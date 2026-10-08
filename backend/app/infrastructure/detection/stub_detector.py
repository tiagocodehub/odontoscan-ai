"""Detector stub determinístico (ADR-0003).

Deriva 1–3 achados de `sha256(bytes) + tamanho`, com caixas no espaço do tensor
(0..640) para percorrer o MESMO pipeline do modelo real (letterbox → mapping → regras).
"""

from __future__ import annotations

import hashlib

import numpy as np

from app.domain.models import BBox, Detection

DEFAULT_CLASS_NAMES: dict[int, str] = {
    0: "impacted",
    1: "caries",
    2: "deep_caries",
    3: "periapical_lesion",
}


class StubDetector:
    """Implementa DetectorPort sem modelo real; saída estável para a mesma entrada."""

    version = "stub-0.1.0"
    runtime = "stub"

    def __init__(
        self,
        class_names: dict[int, str] | None = None,
        conf_threshold: float = 0.40,
        nms_iou: float = 0.45,
        tensor_size: int = 640,
    ) -> None:
        self.class_names = class_names or dict(DEFAULT_CLASS_NAMES)
        self.conf_threshold = conf_threshold
        self.nms_iou = nms_iou
        self.tensor_size = tensor_size

    def infer(self, tensor: np.ndarray, raw: bytes | None = None) -> list[Detection]:
        payload = raw if raw is not None else np.asarray(tensor, dtype=np.float32).tobytes()
        digest = hashlib.sha256(payload + len(payload).to_bytes(8, "little")).digest()

        count = 1 + digest[0] % 3
        size = float(self.tensor_size)
        class_ids = sorted(self.class_names.keys())

        detections: list[Detection] = []
        for index in range(count):
            chunk = digest[1 + index * 8 : 1 + index * 8 + 8]
            if len(chunk) < 8:
                chunk = (chunk * ((8 // len(chunk)) + 1))[:8]

            class_id = class_ids[chunk[0] % len(class_ids)]
            confidence = 0.5 + (chunk[1] % 46) / 100.0

            margin = size * 0.15
            center_x = margin + (chunk[2] / 255.0) * (size - 2 * margin)
            center_y = margin + (chunk[3] / 255.0) * (size - 2 * margin)
            box_w = size * 0.125 + (chunk[4] / 255.0) * (size * 0.375)
            box_h = size * 0.125 + (chunk[5] / 255.0) * (size * 0.375)

            x1 = max(0.0, min(size, center_x - box_w / 2.0))
            y1 = max(0.0, min(size, center_y - box_h / 2.0))
            x2 = max(0.0, min(size, center_x + box_w / 2.0))
            y2 = max(0.0, min(size, center_y + box_h / 2.0))

            detections.append(
                Detection(
                    class_id=int(class_id),
                    confidence=round(confidence, 4),
                    bbox=BBox(x1=x1, y1=y1, x2=x2, y2=y2),
                )
            )

        detections.sort(key=lambda d: d.confidence, reverse=True)
        return detections
