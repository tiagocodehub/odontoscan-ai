"""Casos de uso de autenticação (sem FastAPI/ORM)."""

from __future__ import annotations

from datetime import datetime, timezone

from app.application.errors import (
    DuplicateEmailError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    RefreshTokenReuseError,
)
from app.application.ports import (
    IssuedTokens,
    PasswordHasher,
    RefreshTokenStore,
    TokenService,
    UserData,
    UserRepository,
)


#: Hash bcrypt descartável usado para equalizar o tempo quando o e-mail não existe
#: (anti-enumeração por timing). Não corresponde a nenhuma senha real.
DUMMY_PASSWORD_HASH = "$2b$12$6bFH10AdN3iY9lCCPOsixuCGxog62StgWzJmyMKlRZhwH6iN8Jdd."


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AuthUseCases:
    def __init__(
        self,
        *,
        users: UserRepository,
        refresh_tokens: RefreshTokenStore,
        hasher: PasswordHasher,
        tokens: TokenService,
    ) -> None:
        self._users = users
        self._refresh_tokens = refresh_tokens
        self._hasher = hasher
        self._tokens = tokens

    def register(
        self,
        *,
        name: str,
        email: str,
        cro_number: str,
        cro_state: str,
        password: str,
    ) -> UserData:
        normalized = normalize_email(email)
        if self._users.get_by_email(normalized) is not None:
            raise DuplicateEmailError()
        return self._users.create(
            name=name.strip(),
            email=normalized,
            cro_number=cro_number.strip(),
            cro_state=cro_state.strip().upper(),
            password_hash=self._hasher.hash(password),
        )

    def authenticate(self, email: str, password: str) -> UserData:
        user = self._users.get_by_email(normalize_email(email))
        if user is None:
            # Executa bcrypt mesmo sem usuário para não vazar a existência do
            # e-mail pelo tempo de resposta (a mensagem de erro segue genérica).
            self._hasher.verify(password, DUMMY_PASSWORD_HASH)
            raise InvalidCredentialsError()
        if not self._hasher.verify(password, user.password_hash):
            raise InvalidCredentialsError()
        return user

    def issue_tokens(self, user: UserData) -> IssuedTokens:
        access_token, expires_in = self._tokens.create_access_token(user.id)
        refresh_token = self._tokens.create_refresh_token()
        self._refresh_tokens.add(
            user.id,
            self._tokens.hash_refresh_token(refresh_token),
            self._tokens.refresh_token_expiry(),
        )
        return IssuedTokens(
            access_token=access_token,
            expires_in=expires_in,
            refresh_token=refresh_token,
            user=user,
        )

    def login(self, email: str, password: str) -> IssuedTokens:
        return self.issue_tokens(self.authenticate(email, password))

    def refresh(self, refresh_token: str) -> IssuedTokens:
        token_hash = self._tokens.hash_refresh_token(refresh_token)
        stored = self._refresh_tokens.get(token_hash)
        if stored is None or stored.expires_at <= _utcnow():
            raise InvalidRefreshTokenError()
        if stored.revoked_at is not None:
            # Reapresentação de um refresh já rotacionado/revogado: possível roubo.
            # Revoga TODA a família (todos os refresh ativos do usuário), não só
            # este: assume que a sessão foi comprometida e força novo login.
            self._refresh_tokens.revoke_all_for_user(stored.user_id)
            raise RefreshTokenReuseError(stored.user_id)

        user = self._users.get_by_id(stored.user_id)
        if user is None:
            raise InvalidRefreshTokenError()

        # Rotação: o refresh usado é revogado antes de emitir o novo par.
        self._refresh_tokens.revoke(token_hash)
        return self.issue_tokens(user)

    def logout(self, refresh_token: str) -> int | None:
        token_hash = self._tokens.hash_refresh_token(refresh_token)
        stored = self._refresh_tokens.get(token_hash)
        self._refresh_tokens.revoke(token_hash)
        return stored.user_id if stored is not None else None

    def get_user(self, user_id: int) -> UserData | None:
        return self._users.get_by_id(user_id)
