"""Modelos de domínio puros (sem FastAPI/OpenCV/ONNX/Pydantic)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Urgency(str, Enum):
    """Urgências previstas no contrato (ordem crescente de gravidade)."""

    INFORMATIVA = "informativa"
    ELETIVA = "eletiva"
    PRIORITARIA = "prioritária"
    URGENTE = "urgente"


URGENCY_ORDER: dict[Urgency, int] = {
    Urgency.INFORMATIVA: 0,
    Urgency.ELETIVA: 1,
    Urgency.PRIORITARIA: 2,
    Urgency.URGENTE: 3,
}


@dataclass(frozen=True)
class BBox:
    """Caixa delimitadora em qualquer espaço (tensor, pixels ou normalizado), ordem xyxy."""

    x1: float
    y1: float
    x2: float
    y2: float

    def as_tuple(self) -> tuple[float, float, float, float]:
        return (self.x1, self.y1, self.x2, self.y2)


@dataclass(frozen=True)
class DiagnosisClass:
    """Entrada catalogada da matriz clínica."""

    class_id: int
    class_name: str
    label_pt: str
    urgency: Urgency
    conduct: str


@dataclass(frozen=True)
class Detection:
    """Detecção crua do modelo, ainda no espaço do tensor (0..image_size)."""

    class_id: int
    confidence: float
    bbox: BBox


@dataclass(frozen=True)
class Finding:
    """Achado pronto para o payload: já mapeado para a imagem original e regra clínica."""

    finding_id: str
    class_id: int
    class_name: str
    label_pt: str
    confidence: float
    urgency: Urgency
    conduct: str
    bbox_normalized: BBox
    bbox_pixels: BBox
