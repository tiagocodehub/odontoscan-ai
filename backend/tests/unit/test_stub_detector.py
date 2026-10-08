"""Testes de determinismo do StubDetector (ADR-0003)."""

from __future__ import annotations

import numpy as np

from app.domain.models import Detection
from app.infrastructure.detection.stub_detector import StubDetector


def _tensor() -> np.ndarray:
    return np.zeros((1, 3, 640, 640), dtype=np.float32)


def _fingerprint(detections: list[Detection]) -> list[tuple]:
    return [
        (
            detection.class_id,
            round(detection.confidence, 6),
            tuple(round(value, 6) for value in detection.bbox.as_tuple()),
        )
        for detection in detections
    ]


def test_mesma_entrada_mesma_saida():
    detector = StubDetector()
    raw = b"radiografia-sintetica"

    assert _fingerprint(detector.infer(_tensor(), raw)) == _fingerprint(
        detector.infer(_tensor(), raw)
    )


def test_sem_raw_usa_bytes_do_tensor():
    detector = StubDetector()

    assert _fingerprint(detector.infer(_tensor())) == _fingerprint(
        detector.infer(_tensor(), None)
    )


def test_estrutura_das_deteccoes():
    detector = StubDetector()
    detections = detector.infer(_tensor(), b"abc")

    assert 1 <= len(detections) <= 3
    for detection in detections:
        assert detection.class_id in detector.class_names
        assert 0.5 <= detection.confidence <= 0.95
        x1, y1, x2, y2 = detection.bbox.as_tuple()
        assert 0.0 <= x1 <= x2 <= 640.0
        assert 0.0 <= y1 <= y2 <= 640.0
