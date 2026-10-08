"""Exceções da camada de aplicação (independentes de HTTP/ORM)."""

from __future__ import annotations


class DuplicateEmailError(Exception):
    """E-mail já cadastrado (violação da unicidade)."""


class InvalidCredentialsError(Exception):
    """E-mail/senha incorretos."""


class InvalidRefreshTokenError(Exception):
    """Refresh token ausente, expirado, revogado ou inexistente."""


class RefreshTokenReuseError(InvalidRefreshTokenError):
    """Refresh já revogado/rotacionado reapresentado (sinal clássico de roubo)."""

    def __init__(self, user_id: int | None = None) -> None:
        self.user_id = user_id
        super().__init__("Refresh token já revogado/rotacionado.")


class TokenError(Exception):
    """Access token ausente/expirado/inválido ou de tipo incorreto."""


class RecordNotFoundError(Exception):
    """Paciente/análise inexistente ou pertencente a outro usuário."""
