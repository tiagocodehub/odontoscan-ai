"""Rotas de autenticação: register, login, refresh, logout, me (Etapa 4)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import bearer_token, get_auth_use_cases, get_current_user
from app.api.errors import RateLimitedError
from app.api.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPairOut,
    UserOut,
    user_out,
)
from app.application.auth import AuthUseCases
from app.application.errors import (
    InvalidCredentialsError,
    RefreshTokenReuseError,
    TokenError,
)
from app.application.ports import IssuedTokens, UserData

logger = logging.getLogger("odontoscan.auth")

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _token_pair(issued: IssuedTokens) -> TokenPairOut:
    return TokenPairOut(
        access_token=issued.access_token,
        token_type="bearer",
        expires_in=issued.expires_in,
        refresh_token=issued.refresh_token,
        user=user_out(issued.user),
    )


@router.post("/register", response_model=UserOut, status_code=201)
def register(
    payload: RegisterRequest,
    request: Request,
    auth: AuthUseCases = Depends(get_auth_use_cases),
) -> UserOut:
    user = auth.register(
        name=payload.name,
        email=str(payload.email),
        cro_number=payload.cro_number,
        cro_state=payload.cro_state,
        password=payload.password,
    )
    logger.info("auth.register user_id=%s request_id=%s", user.id, _request_id(request))
    return user_out(user)


@router.post("/login", response_model=TokenPairOut)
def login(
    payload: LoginRequest,
    request: Request,
    auth: AuthUseCases = Depends(get_auth_use_cases),
) -> TokenPairOut:
    limiter = request.app.state.rate_limiter
    client_ip = request.client.host if request.client else "unknown"
    if not limiter.allow(client_ip, str(payload.email)):
        raise RateLimitedError()

    try:
        issued = auth.login(str(payload.email), payload.password)
    except InvalidCredentialsError:
        # Nunca logar a senha: apenas e-mail e IP (para correlação de ataques).
        logger.warning(
            "auth.login_failed email=%s ip=%s request_id=%s",
            str(payload.email),
            client_ip,
            _request_id(request),
        )
        raise

    logger.info("auth.login user_id=%s request_id=%s", issued.user.id, _request_id(request))
    return _token_pair(issued)


@router.post("/refresh", response_model=TokenPairOut)
def refresh(
    payload: RefreshRequest,
    request: Request,
    auth: AuthUseCases = Depends(get_auth_use_cases),
) -> TokenPairOut:
    try:
        issued = auth.refresh(payload.refresh_token)
    except RefreshTokenReuseError as exc:
        logger.warning(
            "auth.refresh_reuse_detected user_id=%s request_id=%s",
            exc.user_id,
            _request_id(request),
        )
        logger.warning(
            "auth.refresh_family_revoked user_id=%s request_id=%s",
            exc.user_id,
            _request_id(request),
        )
        raise
    return _token_pair(issued)


def _revoke_presented_access_token(request: Request, token: str) -> None:
    """Revoga o access apresentado (se válido); token inválido/expirado é ignorado."""
    try:
        claims = request.app.state.token_service.decode_access_token(token)
    except TokenError:
        return
    request.app.state.revoked_tokens.revoke(claims.jti, claims.expires_at)


@router.post("/logout", status_code=204)
def logout(
    payload: RefreshRequest,
    request: Request,
    auth: AuthUseCases = Depends(get_auth_use_cases),
) -> Response:
    access_token = bearer_token(request)
    if access_token is not None:
        _revoke_presented_access_token(request, access_token)

    user_id = auth.logout(payload.refresh_token)
    logger.info("auth.logout user_id=%s request_id=%s", user_id, _request_id(request))
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
def me(user: UserData = Depends(get_current_user)) -> UserOut:
    return user_out(user)
