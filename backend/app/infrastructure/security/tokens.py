"""Access token JWT HS256 e refresh token opaco (hash sha256 no banco).

Regra: o refresh token em claro nunca é persistido; guardamos apenas o sha256.
"""

from __future__ import annotations

import hashlib
import secrets
import threading
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import jwt

from app.application.errors import TokenError
from app.application.ports import AccessTokenClaims

ACCESS_TYPE = "access"
MIN_SECRET_LENGTH = 16


class JwtTokenService:
    """Implementa a porta TokenService."""

    def __init__(
        self,
        secret: str,
        algorithm: str = "HS256",
        access_minutes: int = 15,
        refresh_days: int = 7,
    ) -> None:
        if len(secret) < MIN_SECRET_LENGTH:
            raise ValueError(f"jwt_secret deve ter ao menos {MIN_SECRET_LENGTH} caracteres.")
        self._secret = secret
        self._algorithm = algorithm
        self._access_minutes = access_minutes
        self._refresh_days = refresh_days

    def create_access_token(self, user_id: int) -> tuple[str, int]:
        now = datetime.now(timezone.utc)
        expires = now + timedelta(minutes=self._access_minutes)
        payload = {
            "sub": str(user_id),
            "type": ACCESS_TYPE,
            "jti": uuid.uuid4().hex,
            "iat": int(now.timestamp()),
            "exp": int(expires.timestamp()),
        }
        token = jwt.encode(payload, self._secret, algorithm=self._algorithm)
        return token, self._access_minutes * 60

    def decode_access_token(self, token: str) -> AccessTokenClaims:
        try:
            payload = jwt.decode(token, self._secret, algorithms=[self._algorithm])
        except jwt.PyJWTError as exc:
            raise TokenError("Access token inválido ou expirado.") from exc

        if payload.get("type") != ACCESS_TYPE:
            raise TokenError("Tipo de token inválido.")

        subject = payload.get("sub")
        try:
            user_id = int(subject)
        except (TypeError, ValueError) as exc:
            raise TokenError("Access token sem sujeito válido.") from exc

        jti = payload.get("jti")
        if not isinstance(jti, str) or not jti:
            raise TokenError("Access token sem identificador (jti).")

        try:
            expires_at = datetime.fromtimestamp(int(payload["exp"]), tz=timezone.utc)
        except (KeyError, TypeError, ValueError, OSError, OverflowError) as exc:
            raise TokenError("Access token sem expiração válida.") from exc

        return AccessTokenClaims(user_id=user_id, jti=jti, expires_at=expires_at)

    def create_refresh_token(self) -> str:
        return secrets.token_urlsafe(48)

    def hash_refresh_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def refresh_token_expiry(self) -> datetime:
        return datetime.now(timezone.utc) + timedelta(days=self._refresh_days)


class RevokedTokenStore:
    """Denylist em memória dos access tokens revogados (jti -> expiração).

    Guarda apenas o `jti` (nunca o token) e descarta as entradas já expiradas, de
    modo que o conjunto não cresce além dos tokens ainda válidos.

    LIMITAÇÃO (ADR-0007): é por processo e **não distribuído** — um reinício ou
    outra réplica não enxerga as revogações. Em produção: Redis/blacklist central.
    """

    def __init__(self, clock: Callable[[], datetime] | None = None) -> None:
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._revoked: dict[str, datetime] = {}
        self._lock = threading.Lock()

    def revoke(self, jti: str, expires_at: datetime) -> None:
        """Marca o `jti` como revogado até `expires_at` (após isso é inútil)."""
        with self._lock:
            self._purge()
            self._revoked[jti] = expires_at

    def is_revoked(self, jti: str) -> bool:
        with self._lock:
            self._purge()
            return jti in self._revoked

    def _purge(self) -> None:
        now = self._clock()
        for jti in [key for key, exp in self._revoked.items() if exp <= now]:
            del self._revoked[jti]
