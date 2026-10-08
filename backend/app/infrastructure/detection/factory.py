"""Factory do detector: ONNX quando há MODEL_PATH válido; senão stub (se permitido)."""

from __future__ import annotations

import logging
from pathlib import Path

from app.application.ports import DetectorPort
from app.config import Settings
from app.infrastructure.detection.onnx_detector import OnnxDetector
from app.infrastructure.detection.stub_detector import StubDetector

logger = logging.getLogger("odontoscan.factory")


def build_detector(settings: Settings) -> DetectorPort:
    model_path = (settings.model_path or "").strip()

    if model_path:
        if Path(model_path).is_file():
            try:
                detector = OnnxDetector(
                    model_path=model_path,
                    conf_threshold=settings.conf_threshold,
                    nms_iou=settings.nms_iou,
                    labels_path=settings.labels_path,
                    image_size=settings.image_size,
                )
                logger.info("Detector ONNX carregado: %s", detector.version)
                return detector
            except Exception as exc:  # noqa: BLE001 - decide fallback controlado
                logger.warning("Falha ao carregar ONNX (%s): %s", model_path, exc)
                if not settings.allow_stub_fallback:
                    raise
        else:
            logger.warning("MODEL_PATH inexistente: %s", model_path)
            if not settings.allow_stub_fallback:
                raise RuntimeError(
                    f"MODEL_PATH inválido ('{model_path}') e ALLOW_STUB_FALLBACK=false."
                )
    elif not settings.allow_stub_fallback:
        raise RuntimeError("MODEL_PATH ausente e ALLOW_STUB_FALLBACK=false; nada a carregar.")

    logger.warning("Usando StubDetector determinístico (sem modelo .onnx real).")
    return StubDetector(
        conf_threshold=settings.conf_threshold,
        nms_iou=settings.nms_iou,
        tensor_size=settings.image_size,
    )
