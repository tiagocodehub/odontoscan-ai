"""Detector ONNX Runtime (ADR-0002/0003).

Import de `onnxruntime` é LAZY (dentro do __init__) para não pesar a suíte de testes
quando o stub é usado. `class_names` vêm do metadata do modelo ou do sidecar labels.json.
"""

from __future__ import annotations

import ast
import json
import logging
from pathlib import Path

import numpy as np

from app.application.analyze import InferenceError
from app.domain.models import Detection
from app.infrastructure.detection.postprocess import decode_yolo

logger = logging.getLogger("odontoscan.onnx")


class OnnxDetector:
    """Implementa DetectorPort via ONNX Runtime (CPU)."""

    runtime = "onnxruntime"

    def __init__(
        self,
        model_path: str,
        conf_threshold: float,
        nms_iou: float,
        labels_path: str | None = None,
        image_size: int = 640,
    ) -> None:
        import onnxruntime as ort  # lazy import

        path = Path(model_path)
        if not path.is_file():
            raise FileNotFoundError(f"Modelo ONNX não encontrado: {model_path}")

        self.model_path = str(path)
        self.conf_threshold = conf_threshold
        self.nms_iou = nms_iou
        self.image_size = image_size

        self._session = ort.InferenceSession(
            str(path),
            providers=["CPUExecutionProvider"],
        )
        self._input_name = self._session.get_inputs()[0].name

        metadata = self._session.get_modelmeta().custom_metadata_map or {}
        self.version = str(metadata.get("version") or path.stem)
        self.class_names = self._resolve_class_names(metadata, labels_path)

    def _resolve_class_names(
        self,
        metadata: dict[str, str],
        labels_path: str | None,
    ) -> dict[int, str]:
        raw_names = metadata.get("names") or metadata.get("classes")
        if raw_names:
            parsed = self._parse_names(raw_names)
            if parsed:
                return parsed

        if labels_path and Path(labels_path).is_file():
            try:
                data = json.loads(Path(labels_path).read_text(encoding="utf-8"))
                parsed = {int(key): str(value) for key, value in data.items()}
                if parsed:
                    return parsed
            except (ValueError, TypeError, OSError) as exc:
                raise RuntimeError(f"labels.json inválido: {labels_path}") from exc

        raise RuntimeError(
            "class_names ausentes: defina metadata 'names' no modelo ONNX ou forneça "
            f"um labels.json válido (tentado: {labels_path})."
        )

    @staticmethod
    def _parse_names(raw_names: str) -> dict[int, str] | None:
        try:
            parsed = ast.literal_eval(raw_names)
        except (ValueError, SyntaxError):
            return None

        if isinstance(parsed, dict):
            return {int(key): str(value) for key, value in parsed.items()}
        if isinstance(parsed, (list, tuple)):
            return {index: str(value) for index, value in enumerate(parsed)}
        return None

    def infer(self, tensor: np.ndarray, raw: bytes | None = None) -> list[Detection]:
        try:
            outputs = self._session.run(
                None,
                {self._input_name: np.asarray(tensor, dtype=np.float32)},
            )
        except Exception as exc:  # noqa: BLE001 - qualquer falha do runtime vira InferenceError
            raise InferenceError("Falha ao executar o modelo ONNX.") from exc

        if not outputs:
            raise InferenceError("Modelo ONNX não retornou saídas.")
        return decode_yolo(outputs[0], self.conf_threshold, self.nms_iou)
