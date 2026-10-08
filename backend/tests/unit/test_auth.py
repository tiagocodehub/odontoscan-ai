"""Testes unitários dos casos de uso de autenticação (anti-enumeração e reuso)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.application.auth import DUMMY_PASSWORD_HASH, AuthUseCases
from app.application.errors import (
    InvalidCredentialsError,
    RefreshTokenReuseError,
)
from app.application.ports import AccessTokenClaims, RefreshTokenData, UserData


def _user(
    user_id: int = 1,
    email: str = "ana@clinica.com",
    password_hash: str = "hash-correto",
) -> UserData:
    return UserData(
        id=user_id,
        name="Dra. Ana",
        email=email,
        cro_number="12345",
        cro_state="SP",
        password_hash=password_hash,
        created_at=datetime.now(timezone.utc),
    )


def _refresh(user_id: int, token_hash: str = "h:tok", revoked_at=None) -> RefreshTokenData:
    now = datetime.now(timezone.utc)
    return RefreshTokenData(
        id=1,
        user_id=user_id,
        token_hash=token_hash,
        expires_at=now + timedelta(days=1),
        revoked_at=revoked_at,
        created_at=now,
    )


class SpyHasher:
    def __init__(self, valid_password: str = "segredo") -> None:
        self._valid_password = valid_password
        self.calls: list[tuple] = []

    def hash(self, password: str) -> str:
        self.calls.append(("hash", password))
        return "hash-novo"

    def verify(self, password: str, password_hash: str) -> bool:
        self.calls.append(("verify", password, password_hash))
        return password_hash == "hash-correto" and password == self._valid_password


class FakeUsers:
    def __init__(self, users: list[UserData] | None = None) -> None:
        users = users or []
        self._by_email = {user.email.lower(): user for user in users}
        self._by_id = {user.id: user for user in users}

    def get_by_email(self, email: str) -> UserData | None:
        return self._by_email.get(email.lower())

    def get_by_id(self, user_id: int) -> UserData | None:
        return self._by_id.get(user_id)

    def create(self, **kwargs) -> UserData:  # pragma: no cover - não usado aqui
        raise NotImplementedError


class FakeRefreshStore:
    def __init__(self, rows: list[RefreshTokenData] | None = None) -> None:
        self._rows = {row.token_hash: row for row in rows or []}

    def add(self, user_id, token_hash, expires_at) -> None:  # pragma: no cover
        self._rows[token_hash] = _refresh(user_id, token_hash)

    def get(self, token_hash: str) -> RefreshTokenData | None:
        return self._rows.get(token_hash)

    def revoke(self, token_hash: str) -> None:
        row = self._rows.get(token_hash)
        if row is not None and row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)

    def revoke_all_for_user(self, user_id: int) -> int:
        now = datetime.now(timezone.utc)
        count = 0
        for row in self._rows.values():
            if row.user_id == user_id and row.revoked_at is None:
                row.revoked_at = now
                count += 1
        return count


class FakeTokens:
    def create_access_token(self, user_id: int) -> tuple[str, int]:
        return "access", 900

    def decode_access_token(self, token: str) -> AccessTokenClaims:
        return AccessTokenClaims(
            user_id=1,
            jti="jti-fake",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )

    def create_refresh_token(self) -> str:
        return "refresh-novo"

    def hash_refresh_token(self, token: str) -> str:
        return f"h:{token}"

    def refresh_token_expiry(self) -> datetime:
        return datetime.now(timezone.utc) + timedelta(days=7)


def _make_auth(users=None, refresh=None, hasher=None) -> AuthUseCases:
    return AuthUseCases(
        users=FakeUsers(users),
        refresh_tokens=refresh or FakeRefreshStore(),
        hasher=hasher or SpyHasher(),
        tokens=FakeTokens(),
    )


def test_verify_chamado_mesmo_sem_usuario():
    hasher = SpyHasher()
    auth = _make_auth(hasher=hasher)

    with pytest.raises(InvalidCredentialsError):
        auth.authenticate("nao-existe@clinica.com", "senha-qualquer")

    assert ("verify", "senha-qualquer", DUMMY_PASSWORD_HASH) in hasher.calls


def test_verify_usa_hash_real_quando_usuario_existe():
    hasher = SpyHasher()
    auth = _make_auth(users=[_user()], hasher=hasher)

    user = auth.authenticate("ana@clinica.com", "segredo")

    assert user.id == 1
    assert hasher.calls == [("verify", "segredo", "hash-correto")]


def test_senha_errada_levanta_erro_generico():
    hasher = SpyHasher()
    auth = _make_auth(users=[_user()], hasher=hasher)

    with pytest.raises(InvalidCredentialsError):
        auth.authenticate("ana@clinica.com", "errada")


def test_refresh_reapresentado_levanta_reuse_error():
    now = datetime.now(timezone.utc)
    row = _refresh(7, revoked_at=now)
    auth = _make_auth(users=[_user(user_id=7)], refresh=FakeRefreshStore([row]))

    with pytest.raises(RefreshTokenReuseError) as exc:
        auth.refresh("tok")

    assert exc.value.user_id == 7


def test_refresh_reapresentado_revoga_familia_do_usuario():
    now = datetime.now(timezone.utc)
    reused = _refresh(7, token_hash="h:tok", revoked_at=now)
    active = _refresh(7, token_hash="h:novo")
    store = FakeRefreshStore([reused, active])
    auth = _make_auth(users=[_user(user_id=7)], refresh=store)

    with pytest.raises(RefreshTokenReuseError):
        auth.refresh("tok")

    assert active.revoked_at is not None
    assert store.get("h:novo").revoked_at is not None


def test_logout_retorna_user_id_e_revoga():
    row = _refresh(7)
    auth = _make_auth(users=[_user(user_id=7)], refresh=FakeRefreshStore([row]))

    assert auth.logout("tok") == 7
    assert row.revoked_at is not None
