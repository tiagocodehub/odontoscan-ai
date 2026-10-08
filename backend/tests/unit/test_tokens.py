"""Testes de geração/validação de JWT e refresh token."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.application.errors import TokenError
from app.infrastructure.security.tokens import JwtTokenService, RevokedTokenStore

SECRET = "test-secret-para-testes-com-mais-de-32-chars"


def test_access_token_valido():
    service = JwtTokenService(SECRET)

    token, expires_in = service.create_access_token(42)
    claims = service.decode_access_token(token)

    assert expires_in == 15 * 60
    assert claims.user_id == 42
    assert claims.jti
    assert claims.expires_at > datetime.now(timezone.utc)


def test_access_token_sem_jti_rejeitado():
    service = JwtTokenService(SECRET)
    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    token = jwt.encode(
        {"sub": "1", "type": "access", "exp": int(future.timestamp())},
        SECRET,
        algorithm="HS256",
    )

    with pytest.raises(TokenError):
        service.decode_access_token(token)


def test_access_token_expirado():
    service = JwtTokenService(SECRET)
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    token = jwt.encode(
        {
            "sub": "1",
            "type": "access",
            "jti": "abc",
            "iat": 0,
            "exp": int(past.timestamp()),
        },
        SECRET,
        algorithm="HS256",
    )

    with pytest.raises(TokenError):
        service.decode_access_token(token)


def test_access_token_tipo_errado():
    service = JwtTokenService(SECRET)
    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    token = jwt.encode(
        {"sub": "1", "type": "refresh", "jti": "abc", "exp": int(future.timestamp())},
        SECRET,
        algorithm="HS256",
    )

    with pytest.raises(TokenError):
        service.decode_access_token(token)


def test_access_token_assinatura_invalida():
    service = JwtTokenService(SECRET)
    token, _ = service.create_access_token(7)

    other = JwtTokenService("outro-segredo-suficiente-com-32-chars-ok")
    with pytest.raises(TokenError):
        other.decode_access_token(token)

    with pytest.raises(TokenError):
        service.decode_access_token("nao-e-um-jwt")


def test_segredo_curto_rejeitado():
    with pytest.raises(ValueError):
        JwtTokenService("curto")


def test_refresh_token_opaco_e_hash_sha256():
    service = JwtTokenService(SECRET)

    token_a = service.create_refresh_token()
    token_b = service.create_refresh_token()

    assert token_a != token_b
    assert len(token_a) >= 48
    assert service.hash_refresh_token(token_a) == hashlib.sha256(
        token_a.encode("utf-8")
    ).hexdigest()
    assert token_a not in service.hash_refresh_token(token_a)


def test_refresh_token_expira_em_dias_configurados():
    service = JwtTokenService(SECRET, refresh_days=7)

    expiry = service.refresh_token_expiry()
    delta = expiry - datetime.now(timezone.utc)

    assert timedelta(days=6, hours=23) < delta <= timedelta(days=7)


def test_revoked_token_store_marca_e_consulta():
    store = RevokedTokenStore()
    future = datetime.now(timezone.utc) + timedelta(minutes=15)

    assert store.is_revoked("jti-1") is False
    store.revoke("jti-1", future)
    assert store.is_revoked("jti-1") is True
    assert store.is_revoked("outro") is False


def test_revoked_token_store_descarta_jti_expirado():
    current = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    store = RevokedTokenStore(clock=lambda: current[0])
    store.revoke("jti-antigo", current[0] + timedelta(minutes=1))

    assert store.is_revoked("jti-antigo") is True

    current[0] = current[0] + timedelta(minutes=2)
    assert store.is_revoked("jti-antigo") is False
