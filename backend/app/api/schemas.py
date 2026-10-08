"""Schemas Pydantic v2 da resposta e do envelope de erro (espelho do contrato v1)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.application.analyze import AnalysisOutput
from app.application.ports import (
    AnalysisData,
    DetectorPort,
    NewAnalysis,
    PatientData,
    UserData,
)
from app.domain.clinical_rules import DISCLAIMER
from app.domain.models import Finding, URGENCY_ORDER, Urgency

BboxOrder = Literal["xyxy"]


class ModelOut(BaseModel):
    version: str
    runtime: str
    threshold: float
    nms_iou: float


class CropOut(BaseModel):
    """Recorte aplicado antes da inferência (coordenadas relativas à imagem enviada)."""

    x: int
    y: int
    width: int
    height: int


class ImageOut(BaseModel):
    width: int
    height: int
    format: str
    original_format: str
    sha256: str
    bytes: int
    crop: CropOut | None = None


class SummaryOut(BaseModel):
    total: int
    by_class: dict[str, int]
    max_urgency: str
    suppressed: int = 0


class FindingOut(BaseModel):
    finding_id: str
    class_id: int
    class_name: str
    label_pt: str
    confidence: float
    urgency: str
    conduct: str
    bbox_order: BboxOrder = "xyxy"
    bbox_normalized: list[float]
    bbox_pixels: list[int]


class AnalyzeResponse(BaseModel):
    analysis_id: str
    request_id: str
    disclaimer: str
    model: ModelOut
    inference_ms: int
    image: ImageOut
    summary: SummaryOut
    findings: list[FindingOut]
    persisted: bool = False
    record_id: int | None = None


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


def build_summary(findings: list[Finding], suppressed: int = 0) -> SummaryOut:
    by_class: dict[str, int] = {}
    max_urgency = Urgency.INFORMATIVA

    for finding in findings:
        by_class[finding.class_name] = by_class.get(finding.class_name, 0) + 1
        if URGENCY_ORDER[finding.urgency] > URGENCY_ORDER[max_urgency]:
            max_urgency = finding.urgency

    return SummaryOut(
        total=len(findings),
        by_class=by_class,
        max_urgency=max_urgency.value,
        suppressed=suppressed,
    )


def _finding_out(finding: Finding) -> FindingOut:
    return FindingOut(
        finding_id=finding.finding_id,
        class_id=finding.class_id,
        class_name=finding.class_name,
        label_pt=finding.label_pt,
        confidence=finding.confidence,
        urgency=finding.urgency.value,
        conduct=finding.conduct,
        bbox_order="xyxy",
        bbox_normalized=[round(float(value), 6) for value in finding.bbox_normalized.as_tuple()],
        bbox_pixels=[int(round(value)) for value in finding.bbox_pixels.as_tuple()],
    )


def build_response(
    output: AnalysisOutput,
    detector: DetectorPort,
    request_id: str,
    *,
    persisted: bool = False,
    record_id: int | None = None,
) -> AnalyzeResponse:
    return AnalyzeResponse(
        analysis_id=output.analysis_id,
        request_id=request_id,
        disclaimer=DISCLAIMER,
        model=ModelOut(
            version=detector.version,
            runtime=detector.runtime,
            threshold=output.threshold,
            nms_iou=output.nms_iou,
        ),
        inference_ms=output.inference_ms,
        image=ImageOut(
            width=output.image.width,
            height=output.image.height,
            format=output.image.format,
            original_format=output.image.original_format,
            sha256=output.image.sha256,
            bytes=output.image.bytes,
            crop=(
                CropOut(x=output.crop[0], y=output.crop[1], width=output.crop[2], height=output.crop[3])
                if output.crop is not None
                else None
            ),
        ),
        summary=build_summary(output.findings, output.suppressed),
        findings=[_finding_out(finding) for finding in output.findings],
        persisted=persisted,
        record_id=record_id,
    )


def build_analysis_record(
    output: AnalysisOutput,
    detector: DetectorPort,
    patient_id: int | None,
) -> NewAnalysis:
    """Monta o registro a persistir a partir da saída da análise (sem a imagem)."""

    summary = build_summary(output.findings, output.suppressed)
    crop = (
        {
            "x": output.crop[0],
            "y": output.crop[1],
            "width": output.crop[2],
            "height": output.crop[3],
        }
        if output.crop is not None
        else None
    )
    return NewAnalysis(
        analysis_id=output.analysis_id,
        image_sha256=output.image.sha256,
        image_width=output.image.width,
        image_height=output.image.height,
        image_format=output.image.format,
        model_version=detector.version,
        model_runtime=detector.runtime,
        threshold=output.threshold,
        nms_iou=output.nms_iou,
        summary=summary.model_dump(),
        findings=[_finding_out(finding).model_dump() for finding in output.findings],
        crop=crop,
        patient_id=patient_id,
    )


# ---------------------------------------------------------------------------
# Etapa 4 — autenticação
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    cro_number: str = Field(pattern=r"^\d{1,10}$")
    cro_state: str = Field(pattern=r"^[A-Za-z]{2}$")
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=512)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    cro_number: str
    cro_state: str


class TokenPairOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    refresh_token: str
    user: UserOut


def user_out(user: UserData) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        cro_number=user.cro_number,
        cro_state=user.cro_state,
    )


# ---------------------------------------------------------------------------
# Etapa 4 — pacientes
# ---------------------------------------------------------------------------


class PatientCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)


class PatientOut(BaseModel):
    id: int
    name: str
    notes: str | None = None
    created_at: str


def patient_out(patient: PatientData) -> PatientOut:
    return PatientOut(
        id=patient.id,
        name=patient.name,
        notes=patient.notes,
        created_at=iso_z(patient.created_at),
    )


# ---------------------------------------------------------------------------
# Etapa 4 — histórico de análises
# ---------------------------------------------------------------------------


class PatientRef(BaseModel):
    id: int
    name: str


class RecordImageOut(BaseModel):
    width: int
    height: int
    format: str
    sha256: str


class PlanItem(BaseModel):
    """Item do plano de tratamento. Tolerante a campos extras do frontend."""

    model_config = ConfigDict(extra="allow")

    title: str | None = Field(default=None, max_length=300)
    detail: str | None = Field(default=None, max_length=2000)
    urgency: str | None = Field(default=None, max_length=50)
    note: str | None = Field(default=None, max_length=2000)
    included: bool | None = None


class AnalysisUpdateRequest(BaseModel):
    patient_id: int | None = None
    notes: str | None = Field(default=None, max_length=4000)
    plan: list[PlanItem] | None = None


class AnalysisRecordOut(BaseModel):
    record_id: int
    analysis_id: str
    created_at: str
    patient: PatientRef | None
    image: RecordImageOut
    crop: CropOut | None
    model: ModelOut
    summary: SummaryOut
    findings: list[FindingOut]
    plan: list[dict[str, Any]] | None = None
    notes: str | None = None


class AnalysisListItemOut(BaseModel):
    record_id: int
    analysis_id: str
    created_at: str
    patient: PatientRef | None
    image: RecordImageOut
    crop: CropOut | None
    model: ModelOut
    summary: SummaryOut
    notes: str | None = None


def iso_z(value: datetime) -> str:
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.replace(microsecond=0).isoformat() + "Z"


def _record_common(record: AnalysisData) -> dict[str, Any]:
    return {
        "record_id": record.id,
        "analysis_id": record.analysis_id,
        "created_at": iso_z(record.created_at),
        "patient": (
            PatientRef(id=record.patient_id, name=record.patient_name or "")
            if record.patient_id is not None
            else None
        ),
        "image": RecordImageOut(
            width=record.image_width,
            height=record.image_height,
            format=record.image_format,
            sha256=record.image_sha256,
        ),
        "crop": (
            CropOut(**record.crop) if record.crop is not None else None
        ),
        "model": ModelOut(
            version=record.model_version,
            runtime=record.model_runtime,
            threshold=record.threshold,
            nms_iou=record.nms_iou,
        ),
        "summary": SummaryOut.model_validate(record.summary),
        "notes": record.notes,
    }


def analysis_record_out(record: AnalysisData) -> AnalysisRecordOut:
    return AnalysisRecordOut(
        **_record_common(record),
        findings=[FindingOut.model_validate(item) for item in record.findings],
        plan=record.plan,
    )


def analysis_list_item_out(record: AnalysisData) -> AnalysisListItemOut:
    return AnalysisListItemOut(**_record_common(record))
