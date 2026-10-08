"""Erros da API: envelope único `{ "error": { code, message, request_id } }` + handlers."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.application import errors as app_errors

logger = logging.getLogger("odontoscan.api")


class ApiError(Exception):
    status_code = 500
    code = "INTERNAL_ERROR"
    default_message = "Erro interno inesperado."

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class InvalidFileError(ApiError):
    status_code = 400
    code = "INVALID_FILE"
    default_message = "Arquivo inválido ou corrompido. Envie uma imagem PNG, JPEG ou DICOM íntegra."


class FileTooLargeError(ApiError):
    status_code = 413
    code = "FILE_TOO_LARGE"
    default_message = "Arquivo muito grande. Reduza o tamanho e tente novamente."


class UnsupportedMediaTypeError(ApiError):
    status_code = 415
    code = "UNSUPPORTED_MEDIA_TYPE"
    default_message = "Formato não suportado. Envie PNG, JPEG ou DICOM."


class InvalidInputError(ApiError):
    status_code = 422
    code = "INVALID_INPUT"
    default_message = "Requisição inválida. Envie a imagem no campo 'image'."


class InferenceFailedError(ApiError):
    status_code = 500
    code = "INFERENCE_FAILED"
    default_message = "Falha ao processar a imagem. Tente novamente."


class ModelNotReadyError(ApiError):
    status_code = 503
    code = "MODEL_NOT_READY"
    default_message = "Serviço de análise indisponível: modelo não carregado."


class UnauthenticatedError(ApiError):
    status_code = 401
    code = "UNAUTHENTICATED"
    default_message = "Autenticação necessária ou token inválido/expirado."


class EmailAlreadyRegisteredError(ApiError):
    status_code = 409
    code = "EMAIL_ALREADY_REGISTERED"
    default_message = "E-mail já cadastrado. Faça login ou use outro e-mail."


class RateLimitedError(ApiError):
    status_code = 429
    code = "RATE_LIMITED"
    default_message = "Muitas tentativas de login. Aguarde um instante e tente novamente."


class NotFoundError(ApiError):
    status_code = 404
    code = "NOT_FOUND"
    default_message = "Recurso não encontrado."


def envelope(code: str, message: str, request_id: str) -> dict:
    return {"error": {"code": code, "message": message, "request_id": request_id}}


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=envelope(exc.code, exc.message, _request_id(request)),
        )

    @app.exception_handler(app_errors.DuplicateEmailError)
    async def _handle_duplicate_email(
        request: Request, exc: app_errors.DuplicateEmailError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=EmailAlreadyRegisteredError.status_code,
            content=envelope(
                EmailAlreadyRegisteredError.code,
                EmailAlreadyRegisteredError.default_message,
                _request_id(request),
            ),
        )

    @app.exception_handler(app_errors.InvalidCredentialsError)
    async def _handle_invalid_credentials(
        request: Request, exc: app_errors.InvalidCredentialsError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=UnauthenticatedError.status_code,
            content=envelope(
                UnauthenticatedError.code,
                "E-mail ou senha incorretos.",
                _request_id(request),
            ),
        )

    @app.exception_handler(app_errors.InvalidRefreshTokenError)
    async def _handle_invalid_refresh(
        request: Request, exc: app_errors.InvalidRefreshTokenError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=UnauthenticatedError.status_code,
            content=envelope(
                UnauthenticatedError.code,
                "Refresh token inválido, expirado ou revogado.",
                _request_id(request),
            ),
        )

    @app.exception_handler(app_errors.RecordNotFoundError)
    async def _handle_record_not_found(
        request: Request, exc: app_errors.RecordNotFoundError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=NotFoundError.status_code,
            content=envelope(
                NotFoundError.code,
                NotFoundError.default_message,
                _request_id(request),
            ),
        )

    def _validation_message(request: Request, exc: RequestValidationError) -> str:
        """Mensagem específica do endpoint: o /analyze fala de arquivo; os demais, de campos."""

        if request.url.path.endswith("/analyze"):
            return InvalidInputError.default_message

        fields = sorted(
            {
                str(location[-1])
                for error in exc.errors()
                for location in [error.get("loc", ())]
                if location and location[-1] != "body"
            }
        )
        if fields:
            return "Requisição inválida. Verifique os campos: " + ", ".join(fields) + "."
        return "Requisição inválida. Verifique os dados enviados."

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=envelope(
                InvalidInputError.code,
                _validation_message(request, exc),
                _request_id(request),
            ),
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Erro não tratado: %s", exc)
        return JSONResponse(
            status_code=500,
            content=envelope(
                InferenceFailedError.code,
                InferenceFailedError.default_message,
                _request_id(request),
            ),
        )
