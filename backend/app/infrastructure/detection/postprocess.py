"""Pós-processamento YOLO-style: decode de tensor + threshold + NMS (numpy puro)."""

from __future__ import annotations

import numpy as np

from app.domain.models import BBox, Detection


def nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> list[int]:
    """Non-Maximum Suppression clássico; retorna os índices mantidos."""

    if boxes.size == 0:
        return []

    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]

    areas = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    order = scores.argsort()[::-1]

    keep: list[int] = []
    while order.size > 0:
        current = int(order[0])
        keep.append(current)

        rest = order[1:]
        if rest.size == 0:
            break

        xx1 = np.maximum(x1[current], x1[rest])
        yy1 = np.maximum(y1[current], y1[rest])
        xx2 = np.minimum(x2[current], x2[rest])
        yy2 = np.minimum(y2[current], y2[rest])

        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        union = areas[current] + areas[rest] - inter
        iou = inter / np.where(union > 0, union, 1e-9)

        order = rest[iou <= iou_threshold]

    return keep


def decode_yolo(
    output: np.ndarray,
    conf_threshold: float,
    iou_threshold: float,
) -> list[Detection]:
    """Decodifica a saída YOLO `[1, 4+nc, N]` (ex.: `[1, 84, 8400]`) para detecções.

    As caixas do modelo estão no espaço do tensor (cx, cy, w, h) e são convertidas
    para xyxy. O NMS é aplicado por classe.
    """

    array = np.asarray(output, dtype=np.float32)
    if array.ndim == 3:
        array = array[0]

    if array.ndim != 2:
        raise ValueError(f"Tensor de saída inesperado: shape={array.shape}")

    if array.shape[0] < array.shape[1]:
        array = array.T

    if array.shape[1] <= 4:
        raise ValueError("Tensor de saída sem canais de classe suficientes.")

    boxes_xywh = array[:, :4]
    class_scores = array[:, 4:]

    class_ids = np.argmax(class_scores, axis=1)
    confidences = class_scores[np.arange(class_scores.shape[0]), class_ids]

    mask = confidences >= conf_threshold
    if not np.any(mask):
        return []

    boxes_xyxy = np.stack(
        [
            boxes_xywh[:, 0] - boxes_xywh[:, 2] / 2.0,
            boxes_xywh[:, 1] - boxes_xywh[:, 3] / 2.0,
            boxes_xywh[:, 0] + boxes_xywh[:, 2] / 2.0,
            boxes_xywh[:, 1] + boxes_xywh[:, 3] / 2.0,
        ],
        axis=1,
    )

    detections: list[Detection] = []
    for class_id in np.unique(class_ids[mask]):
        class_mask = mask & (class_ids == class_id)
        indices = np.where(class_mask)[0]
        keep = nms(boxes_xyxy[indices], confidences[indices], iou_threshold)
        for local_index in keep:
            source = indices[local_index]
            x1, y1, x2, y2 = boxes_xyxy[source].tolist()
            detections.append(
                Detection(
                    class_id=int(class_id),
                    confidence=float(confidences[source]),
                    bbox=BBox(x1=float(x1), y1=float(y1), x2=float(x2), y2=float(y2)),
                )
            )

    detections.sort(key=lambda d: d.confidence, reverse=True)
    return detections
