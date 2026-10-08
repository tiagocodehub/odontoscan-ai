"""Portas (Protocols) da aplicação e DTOs de fronteira.

A aplicação depende apenas do domínio e destas portas; a infraestrutura as implementa.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

import numpy as np

from app.domain.models import Detection

#: Sentinela para distinguir "campo não informado" de "campo definido como null".
UNSET: Any = object()


@dataclass
class DecodedImage:
    """Imagem original decodificada para RGB, com metadados para o payload."""

    rgb: np.ndarray
    width: int
    height: int
    format: str
    original_format: str
    raw: bytes
    sha256: str


@dataclass
class PreprocessResult:
    """Saída do pré-processamento: tensor do modelo + transformação do letterbox.

    `original_size` é sempre o tamanho da IMAGEM ENVIADA (não do recorte), para que
    as coordenadas devolvidas continuem relativas ao arquivo original.
    `crop_offset`/`crop_size` descrevem o recorte usado na inferência (0,0/None = sem recorte).
    """

    tensor: np.ndarray
    scale: float
    pad_x: float
    pad_y: float
    original_size: tuple[int, int]
    image: DecodedImage
    crop_offset: tuple[int, int] = (0, 0)
    crop_size: tuple[int, int] | None = None


@runtime_checkable
class ImageCodecPort(Protocol):
    """Decodifica/valida imagens e aplica o letterbox 640x640."""

    def sniff_format(self, data: bytes) -> str | None:
        """Retorna 'png' | 'jpeg' | 'dicom' ou None se os magic bytes forem inválidos."""

    def decode(self, data: bytes) -> DecodedImage:
        """Decodifica para RGB (Pillow/pydicom). Levanta ImageDecodeError se corrompido."""

    def preprocess(self, data: bytes, size: int = 640) -> PreprocessResult:
        """Decodifica + letterbox, registrando scale/pad/original_size."""


@runtime_checkable
class DetectorPort(Protocol):
    """Porta de detecção implementada pelo stub e pelo ONNX Runtime."""

    @property
    def version(self) -> str:
        """Versão do modelo (ex.: 'stub-0.1.0')."""

    @property
    def runtime(self) -> str:
        """Runtime de inferência (ex.: 'stub', 'onnxruntime')."""

    @property
    def class_names(self) -> dict[int, str]:
        """Mapeamento id → nome da classe (nunca hardcodar ordem no domínio)."""

    @property
    def conf_threshold(self) -> float:
        """Limiar de confiança efetivamente aplicado na detecção."""

    @property
    def nms_iou(self) -> float:
        """IoU do NMS efetivamente aplicada na detecção."""

    def infer(self, tensor: np.ndarray, raw: bytes | None = None) -> list[Detection]:
        """Recebe o tensor (1,3,S,S) e devolve detecções no espaço do tensor.

        `raw` são os bytes originais do upload, usados pelo stub para determinismo.
        """


# ---------------------------------------------------------------------------
# Etapa 4 — autenticação + histórico: DTOs de fronteira e portas
# ---------------------------------------------------------------------------


@dataclass
class UserData:
    id: int
    name: str
    email: str
    cro_number: str
    cro_state: str
    password_hash: str
    created_at: datetime


@dataclass
class PatientData:
    id: int
    user_id: int
    name: str
    notes: str | None
    created_at: datetime


@dataclass
class NewAnalysis:
    """Dados de uma análise a persistir (imagem NÃO entra — LGPD)."""

    analysis_id: str
    image_sha256: str
    image_width: int
    image_height: int
    image_format: str
    model_version: str
    model_runtime: str
    threshold: float
    nms_iou: float
    summary: dict[str, Any]
    findings: list[dict[str, Any]]
    crop: dict[str, int] | None = None
    patient_id: int | None = None


@dataclass
class AnalysisData:
    id: int
    user_id: int
    patient_id: int | None
    analysis_id: str
    created_at: datetime
    image_sha256: str
    image_width: int
    image_height: int
    image_format: str
    crop: dict[str, int] | None
    model_version: str
    model_runtime: str
    threshold: float
    nms_iou: float
    summary: dict[str, Any]
    findings: list[dict[str, Any]]
    plan: list[dict[str, Any]] | None = None
    notes: str | None = None
    patient_name: str | None = None


@dataclass
class RefreshTokenData:
    id: int
    user_id: int
    token_hash: str
    expires_at: datetime
    revoked_at: datetime | None
    created_at: datetime


@dataclass(frozen=True)
class AccessTokenClaims:
    """Claims do access token já validadas (assinatura/expição/tipo)."""

    user_id: int
    jti: str
    expires_at: datetime


@dataclass
class IssuedTokens:
    access_token: str
    expires_in: int
    refresh_token: str
    user: UserData


@runtime_checkable
class UserRepository(Protocol):
    def create(
        self,
        *,
        name: str,
        email: str,
        cro_number: str,
        cro_state: str,
        password_hash: str,
    ) -> UserData:
        """Cria o usuário; levanta DuplicateEmailError se o e-mail já existir."""

    def get_by_email(self, email: str) -> UserData | None: ...

    def get_by_id(self, user_id: int) -> UserData | None: ...


@runtime_checkable
class PatientRepository(Protocol):
    def list(self, user_id: int) -> list[PatientData]: ...

    def create(self, user_id: int, *, name: str, notes: str | None) -> PatientData: ...

    def get(self, user_id: int, patient_id: int) -> PatientData | None: ...

    def delete(self, user_id: int, patient_id: int) -> bool:
        """Remove o paciente e, em cascata, suas análises. False se não existir."""


@runtime_checkable
class AnalysisRepository(Protocol):
    def create(self, user_id: int, data: NewAnalysis) -> AnalysisData: ...

    def list(
        self, user_id: int, patient_id: int | None = None
    ) -> list[AnalysisData]: ...

    def get(self, user_id: int, record_id: int) -> AnalysisData | None: ...

    def update(
        self,
        user_id: int,
        record_id: int,
        *,
        patient_id: Any = UNSET,
        notes: Any = UNSET,
        plan: Any = UNSET,
    ) -> AnalysisData | None: ...

    def delete(self, user_id: int, record_id: int) -> bool: ...


@runtime_checkable
class RefreshTokenStore(Protocol):
    def add(self, user_id: int, token_hash: str, expires_at: datetime) -> None: ...

    def get(self, token_hash: str) -> RefreshTokenData | None: ...

    def revoke(self, token_hash: str) -> None: ...

    def revoke_all_for_user(self, user_id: int) -> int:
        """Revoga todos os refresh ativos do usuário (detecção de roubo)."""


@runtime_checkable
class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...

    def verify(self, password: str, password_hash: str) -> bool: ...


@runtime_checkable
class TokenService(Protocol):
    def create_access_token(self, user_id: int) -> tuple[str, int]:
        """Devolve (token, expires_in_segundos)."""

    def decode_access_token(self, token: str) -> AccessTokenClaims:
        """Devolve as claims; levanta TokenError se inválido/expirado/sem jti."""

    def create_refresh_token(self) -> str: ...

    def hash_refresh_token(self, token: str) -> str: ...

    def refresh_token_expiry(self) -> datetime: ...
