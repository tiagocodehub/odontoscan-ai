"""Rotas HTTP: POST /api/v1/analyze, GET /healthz, GET /readyz."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_analysis_use_cases, get_optional_user
from app.api.errors import (
    FileTooLargeError,
    InferenceFailedError,
    InvalidFileError,
    ModelNotReadyError,
    UnsupportedMediaTypeError,
)
from app.api.schemas import (
    AnalyzeResponse,
    build_analysis_record,
    build_response,
)
from app.application.analyze import ImageDecodeError, InferenceError
from app.application.ports import UserData
from app.application.records import AnalysisUseCases

logger = logging.getLogger("odontoscan.routes")

router = APIRouter()

ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/dicom",
    "image/dicom",
    "application/dicom+json",
}

MULTIPART_SLACK_BYTES = 64 * 1024


def _content_length(request: Request) -> int | None:
    raw = request.headers.get("content-length")
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(request: Request) -> dict:
    state = request.app.state
    if not getattr(state, "ready", False) or getattr(state, "detector", None) is None:
        raise ModelNotReadyError()
    detector = state.detector
    return {
        "status": "ready",
        "model": {"version": detector.version, "runtime": detector.runtime},
    }


@router.post("/api/v1/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: Request,
    image: UploadFile = File(...),
    patient_id: int | None = Form(default=None, ge=1),
    user: UserData | None = Depends(get_optional_user),
    analysis_use_cases: AnalysisUseCases = Depends(get_analysis_use_cases),
) -> AnalyzeResponse:
    state = request.app.state
    if not getattr(state, "ready", False) or getattr(state, "detector", None) is None:
        raise ModelNotReadyError()

    settings = state.settings
    max_bytes = settings.max_upload_bytes

    declared_length = _content_length(request)
    if declared_length is not None and declared_length > max_bytes + MULTIPART_SLACK_BYTES:
        raise FileTooLargeError(
            f"Arquivo muito grande. O limite é {settings.max_upload_mb} MB."
        )

    data = await image.read(max_bytes + 1)
    if not data:
        raise InvalidFileError("O arquivo está vazio ou corrompido.")
    if len(data) > max_bytes:
        raise FileTooLargeError(
            f"Arquivo muito grande. O limite é {settings.max_upload_mb} MB."
        )

    codec = state.codec
    if codec.sniff_format(data) is None:
        declared = (image.content_type or "").lower()
        if declared in ALLOWED_MIME_TYPES:
            raise InvalidFileError()
        raise UnsupportedMediaTypeError()

    try:
        async with state.inference_semaphore:
            inference = asyncio.ensure_future(
                run_in_threadpool(state.analyze_use_case.run, data)
            )
            try:
                output = await asyncio.shield(inference)
            except asyncio.CancelledError:
                await inference
                raise
    except ImageDecodeError as exc:
        raise InvalidFileError() from exc
    except InferenceError as exc:
        logger.error("Falha de inferência: %s", exc)
        raise InferenceFailedError() from exc

    persisted = False
    record_id: int | None = None
    if user is not None:
        record = analysis_use_cases.persist(
            user.id,
            build_analysis_record(output, state.detector, patient_id),
        )
        persisted = True
        record_id = record.id

    return build_response(
        output,
        state.detector,
        request.state.request_id,
        persisted=persisted,
        record_id=record_id,
    )
