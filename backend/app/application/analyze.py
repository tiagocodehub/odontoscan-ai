"""Caso de uso de análise e mapeamento puro de coordenadas (inverso do letterbox)."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

import numpy as np

from app.application.ports import DetectorPort, ImageCodecPort, PreprocessResult
from app.domain.clinical_rules import rule_for
from app.domain.models import BBox, Finding


class ImageDecodeError(Exception):
    """Arquivo corrompido / magic bytes inválidos / dimensões inválidas."""


class InferenceError(Exception):
    """Falha no adaptador de inferência."""


@dataclass(frozen=True)
class LetterboxTransform:
    """Parâmetros do letterbox usados para inverter a escala/padding."""

    scale: float
    pad_x: float
    pad_y: float
    original_size: tuple[int, int]
    crop_offset: tuple[int, int] = (0, 0)


def _clamp(value: float, low: float, high: float) -> float:
    if value < low:
        return low
    if value > high:
        return high
    return value


def radiopaque_fraction(
    gray: np.ndarray,
    box: tuple[float, float, float, float],
    intensity: int,
) -> float:
    """Fração de pixels muito claros (restauração/implante/coroa) dentro da caixa.

    Usada para descartar detecções que recaem sobre material radiopaco, principal
    fonte de falsos positivos observada em bocas tratadas.
    """

    height, width = gray.shape[:2]
    x1 = max(0, int(np.floor(box[0])))
    y1 = max(0, int(np.floor(box[1])))
    x2 = min(width, int(np.ceil(box[2])))
    y2 = min(height, int(np.ceil(box[3])))
    if x2 <= x1 or y2 <= y1:
        return 0.0

    region = gray[y1:y2, x1:x2]
    return float((region >= intensity).mean())


class CoordinateMapper:
    """Inverte o letterbox: tensor (0..S) → imagem original (pixels e normalizado).

    ADR-0004: `r = min(S/W0, S/H0)`, `dx = (S - W0*r)/2`, `dy = (S - H0*r)/2`;
    `x_orig = (x - dx)/r`, com clamp à imagem original.
    """

    def __init__(self, transform: LetterboxTransform) -> None:
        self.transform = transform

    @classmethod
    def from_preprocess(cls, result: PreprocessResult) -> "CoordinateMapper":
        return cls(
            LetterboxTransform(
                scale=result.scale,
                pad_x=result.pad_x,
                pad_y=result.pad_y,
                original_size=result.original_size,
                crop_offset=result.crop_offset,
            )
        )

    def to_tensor(self, bbox: BBox) -> BBox:
        """Mapeia pixels da imagem original para o espaço do tensor (usado em testes)."""

        scale = self.transform.scale
        crop_x, crop_y = self.transform.crop_offset
        return BBox(
            x1=(bbox.x1 - crop_x) * scale + self.transform.pad_x,
            y1=(bbox.y1 - crop_y) * scale + self.transform.pad_y,
            x2=(bbox.x2 - crop_x) * scale + self.transform.pad_x,
            y2=(bbox.y2 - crop_y) * scale + self.transform.pad_y,
        )

    def to_pixels(self, bbox: BBox) -> BBox:
        """Tensor → pixels da imagem ORIGINAL (desfaz letterbox + recorte, com clamp)."""

        scale = self.transform.scale
        width, height = self.transform.original_size
        crop_x, crop_y = self.transform.crop_offset

        def to_orig_x(x: float) -> float:
            return _clamp((x - self.transform.pad_x) / scale + crop_x, 0.0, float(width))

        def to_orig_y(y: float) -> float:
            return _clamp((y - self.transform.pad_y) / scale + crop_y, 0.0, float(height))

        x1 = to_orig_x(bbox.x1)
        y1 = to_orig_y(bbox.y1)
        x2 = to_orig_x(bbox.x2)
        y2 = to_orig_y(bbox.y2)

        return BBox(
            x1=min(x1, x2),
            y1=min(y1, y2),
            x2=max(x1, x2),
            y2=max(y1, y2),
        )

    def to_normalized(self, bbox: BBox) -> BBox:
        """Tensor → [0,1] relativo à imagem original (fonte de verdade do frontend)."""

        pixels = self.to_pixels(bbox)
        width, height = self.transform.original_size
        return BBox(
            x1=pixels.x1 / width,
            y1=pixels.y1 / height,
            x2=pixels.x2 / width,
            y2=pixels.y2 / height,
        )


@dataclass(frozen=True)
class ImageSummary:
    width: int
    height: int
    format: str
    original_format: str
    sha256: str
    bytes: int


@dataclass(frozen=True)
class AnalysisOutput:
    """Resultado intermediário do caso de uso (a API adiciona request_id/disclaimer)."""

    analysis_id: str
    inference_ms: int
    image: ImageSummary
    findings: list[Finding]
    threshold: float
    nms_iou: float
    suppressed: int = 0
    crop: tuple[int, int, int, int] | None = None


class AnalyzeUseCase:
    """Orquestra pré-processamento → detecção → mapeamento → regras clínicas."""

    def __init__(
        self,
        codec: ImageCodecPort,
        detector: DetectorPort,
        image_size: int = 640,
        suppress_radiopaque: bool = True,
        radiopaque_threshold: float = 0.35,
        radiopaque_intensity: int = 200,
    ) -> None:
        self._codec = codec
        self._detector = detector
        self._image_size = image_size
        self._suppress_radiopaque = suppress_radiopaque
        self._radiopaque_threshold = radiopaque_threshold
        self._radiopaque_intensity = radiopaque_intensity

    def run(self, data: bytes) -> AnalysisOutput:
        started = time.perf_counter()

        pre = self._codec.preprocess(data, size=self._image_size)
        mapper = CoordinateMapper.from_preprocess(pre)

        try:
            detections = self._detector.infer(pre.tensor, data)
        except InferenceError:
            raise
        except Exception as exc:  # noqa: BLE001 - normaliza qualquer falha do adaptador
            raise InferenceError("Falha na inferência do modelo.") from exc

        ordered = sorted(
            detections,
            key=lambda d: (d.confidence, d.class_id),
            reverse=True,
        )

        gray = None
        if self._suppress_radiopaque:
            gray = pre.image.rgb.astype(np.float32).mean(axis=2)

        findings: list[Finding] = []
        suppressed = 0

        for detection in ordered:
            class_name = self._detector.class_names.get(detection.class_id, str(detection.class_id))
            rule = rule_for(detection.class_id, class_name)
            pixels = mapper.to_pixels(detection.bbox)

            if gray is not None and (
                radiopaque_fraction(
                    gray,
                    pixels.as_tuple(),
                    self._radiopaque_intensity,
                )
                >= self._radiopaque_threshold
            ):
                suppressed += 1
                continue

            normalized = mapper.to_normalized(detection.bbox)
            findings.append(
                Finding(
                    finding_id=f"f{len(findings) + 1}",
                    class_id=detection.class_id,
                    class_name=class_name,
                    label_pt=rule.label_pt,
                    confidence=round(float(detection.confidence), 4),
                    urgency=rule.urgency,
                    conduct=rule.conduct,
                    bbox_normalized=BBox(
                        x1=round(normalized.x1, 6),
                        y1=round(normalized.y1, 6),
                        x2=round(normalized.x2, 6),
                        y2=round(normalized.y2, 6),
                    ),
                    bbox_pixels=BBox(
                        x1=float(round(pixels.x1)),
                        y1=float(round(pixels.y1)),
                        x2=float(round(pixels.x2)),
                        y2=float(round(pixels.y2)),
                    ),
                )
            )

        elapsed_ms = int(round((time.perf_counter() - started) * 1000))
        image = pre.image

        return AnalysisOutput(
            analysis_id=str(uuid.uuid4()),
            inference_ms=elapsed_ms,
            image=ImageSummary(
                width=image.width,
                height=image.height,
                format=image.format,
                original_format=image.original_format,
                sha256=image.sha256,
                bytes=len(image.raw),
            ),
            findings=findings,
            threshold=float(self._detector.conf_threshold),
            nms_iou=float(self._detector.nms_iou),
            suppressed=suppressed,
            crop=(
                (pre.crop_offset[0], pre.crop_offset[1], pre.crop_size[0], pre.crop_size[1])
                if pre.crop_size is not None
                else None
            ),
        )
