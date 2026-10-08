"""Composition root do OdontoScan AI (FastAPI).

Carrega o detector UMA vez no lifespan, injeta codec/use case/semáforo no `app.state`
e aplica CORS + headers de segurança + request_id.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.api.analyses_routes import router as analyses_router
from app.api.auth_routes import router as auth_router
from app.api.errors import register_exception_handlers
from app.api.patients_routes import router as patients_router
from app.api.routes import router
from app.application.analyze import AnalyzeUseCase
from app.config import Settings, get_settings
from app.infrastructure.detection.factory import build_detector
from app.infrastructure.imaging.preprocess import PillowImageCodec
from app.infrastructure.persistence.db import Database
from app.infrastructure.security.passwords import BcryptPasswordHasher
from app.infrastructure.security.rate_limit import LoginRateLimiter
from app.infrastructure.security.tokens import JwtTokenService, RevokedTokenStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("odontoscan.main")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}

DOCS_PATHS = frozenset({"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"})

DOCS_CSP = (
    "default-src 'self'; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "font-src 'self' data: https://cdn.jsdelivr.net; "
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings

    detector = build_detector(settings)
    codec = PillowImageCodec(
        max_dimension=settings.max_image_dimension,
        image_size=settings.image_size,
        max_frames=settings.max_frames,
        max_image_pixels=settings.max_image_dimension**2,
        auto_crop=settings.auto_crop_panorama,
        crop_min_gain=settings.crop_min_gain,
    )

    app.state.detector = detector
    app.state.codec = codec
    app.state.analyze_use_case = AnalyzeUseCase(
        codec=codec,
        detector=detector,
        image_size=settings.image_size,
        suppress_radiopaque=settings.suppress_radiopaque,
        radiopaque_threshold=settings.radiopaque_threshold,
        radiopaque_intensity=settings.radiopaque_intensity,
    )
    app.state.inference_semaphore = asyncio.Semaphore(settings.max_concurrency)

    # Etapa 4: banco (create_all no lifespan; Alembic fica para Postgres) + segurança.
    database = Database.from_url(settings.database_url)
    database.create_all()
    app.state.database = database
    app.state.password_hasher = BcryptPasswordHasher()
    app.state.token_service = JwtTokenService(
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        access_minutes=settings.access_token_minutes,
        refresh_days=settings.refresh_token_days,
    )
    app.state.rate_limiter = LoginRateLimiter(
        settings.login_rate_limit,
        ip_limit=settings.login_ip_rate_limit,
    )
    # Denylist de access tokens (por processo — ver ADR-0007).
    app.state.revoked_tokens = RevokedTokenStore()

    app.state.ready = True
    logger.info(
        "Detector pronto: runtime=%s version=%s (stub=%s); banco=%s",
        detector.runtime,
        detector.version,
        detector.runtime == "stub",
        settings.database_url,
    )

    try:
        yield
    finally:
        app.state.ready = False
        app.state.detector = None
        app.state.analyze_use_case = None
        app.state.password_hasher = None
        app.state.token_service = None
        app.state.rate_limiter = None
        app.state.revoked_tokens = None
        if getattr(app.state, "database", None) is not None:
            app.state.database.dispose()
            app.state.database = None
        logger.info("Detector liberado (shutdown).")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(
        title="OdontoScan AI API",
        description="Protótipo de pesquisa para apoio à decisão em radiografias odontológicas.",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.ready = False
    app.state.detector = None
    app.state.codec = None
    app.state.analyze_use_case = None
    app.state.inference_semaphore = None
    app.state.database = None
    app.state.password_hasher = None
    app.state.token_service = None
    app.state.rate_limiter = None
    app.state.revoked_tokens = None

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next) -> Response:
        request_id = uuid.uuid4().hex[:12]
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        is_docs = request.url.path in DOCS_PATHS
        for header, value in SECURITY_HEADERS.items():
            if is_docs and header == "Content-Security-Policy":
                response.headers.setdefault(header, DOCS_CSP)
            else:
                response.headers.setdefault(header, value)
        return response

    register_exception_handlers(app)
    app.include_router(router)
    app.include_router(auth_router)
    app.include_router(patients_router)
    app.include_router(analyses_router)
    return app


app = create_app()
