"""Dependências FastAPI: sessão de banco, casos de uso e usuário autenticado."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, Request
from sqlmodel import Session

from app.api.errors import UnauthenticatedError
from app.application.auth import AuthUseCases
from app.application.errors import TokenError
from app.application.ports import UserData
from app.application.records import AnalysisUseCases, PatientUseCases
from app.infrastructure.persistence.repositories import (
    SqlAnalysisRepository,
    SqlPatientRepository,
    SqlRefreshTokenStore,
    SqlUserRepository,
)


def get_session(request: Request) -> Iterator[Session]:
    session = request.app.state.database.session()
    try:
        yield session
    finally:
        session.close()


def get_auth_use_cases(
    request: Request, session: Session = Depends(get_session)
) -> AuthUseCases:
    return AuthUseCases(
        users=SqlUserRepository(session),
        refresh_tokens=SqlRefreshTokenStore(session),
        hasher=request.app.state.password_hasher,
        tokens=request.app.state.token_service,
    )


def get_patient_use_cases(
    session: Session = Depends(get_session),
) -> PatientUseCases:
    return PatientUseCases(
        patients=SqlPatientRepository(session),
        analyses=SqlAnalysisRepository(session),
    )


def get_analysis_use_cases(
    session: Session = Depends(get_session),
) -> AnalysisUseCases:
    return AnalysisUseCases(
        analyses=SqlAnalysisRepository(session),
        patients=SqlPatientRepository(session),
    )


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None
    parts = header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def get_current_user(
    request: Request,
    auth: AuthUseCases = Depends(get_auth_use_cases),
) -> UserData:
    token = bearer_token(request)
    if token is None:
        raise UnauthenticatedError()

    try:
        claims = request.app.state.token_service.decode_access_token(token)
    except TokenError as exc:
        raise UnauthenticatedError() from exc

    if request.app.state.revoked_tokens.is_revoked(claims.jti):
        raise UnauthenticatedError()

    user = auth.get_user(claims.user_id)
    if user is None:
        raise UnauthenticatedError()
    return user


def get_optional_user(
    request: Request,
    session: Session = Depends(get_session),
) -> UserData | None:
    """Para `/analyze` (público): devolve o usuário se houver token válido, senão None."""
    token = bearer_token(request)
    if token is None:
        return None
    try:
        claims = request.app.state.token_service.decode_access_token(token)
    except TokenError:
        return None
    if request.app.state.revoked_tokens.is_revoked(claims.jti):
        return None
    return SqlUserRepository(session).get_by_id(claims.user_id)
