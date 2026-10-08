"""Testes do pós-processamento YOLO (decode + NMS) com tensor sintético."""

from __future__ import annotations

import numpy as np
import pytest

from app.infrastructure.detection.postprocess import decode_yolo, nms


def _make_output() -> np.ndarray:
    channels = np.zeros((6, 10), dtype=np.float32)
    channels[:, 0] = [100.0, 100.0, 50.0, 50.0, 0.90, 0.05]
    channels[:, 1] = [102.0, 101.0, 50.0, 50.0, 0.80, 0.10]
    channels[:, 2] = [400.0, 400.0, 60.0, 60.0, 0.10, 0.70]
    return channels[None, ...]


def test_nms_suprime_caixas_sobrepostas():
    boxes = np.array(
        [[0, 0, 10, 10], [1, 1, 11, 11], [100, 100, 110, 110]],
        dtype=np.float32,
    )
    scores = np.array([0.9, 0.8, 0.7], dtype=np.float32)

    assert nms(boxes, scores, iou_threshold=0.5) == [0, 2]


def test_nms_sem_caixas_retorna_vazio():
    assert nms(np.zeros((0, 4), dtype=np.float32), np.zeros(0, dtype=np.float32), 0.5) == []


def test_decode_yolo_aplica_threshold_e_nms():
    detections = decode_yolo(_make_output(), conf_threshold=0.5, iou_threshold=0.45)

    assert len(detections) == 2
    assert {detection.class_id for detection in detections} == {0, 1}
    assert detections[0].confidence == pytest.approx(0.90, abs=1e-6)


def test_decode_yolo_sem_deteccoes_acima_do_threshold():
    assert decode_yolo(_make_output(), conf_threshold=0.99, iou_threshold=0.45) == []


def test_decode_yolo_shape_invalido_levanta_erro():
    with pytest.raises(ValueError):
        decode_yolo(np.zeros((1, 3), dtype=np.float32), conf_threshold=0.5, iou_threshold=0.45)
