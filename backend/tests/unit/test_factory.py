"""Testes do fallback controlado da factory de detector (ADR-0003)."""

from __future__ import annotations

import pytest

from app.infrastructure.detection.factory import build_detector
from app.infrastructure.detection.stub_detector import StubDetector
from tests.conftest import make_settings


def test_model_path_invalido_cai_no_stub():
    detector = build_detector(make_settings(model_path="models/nao-existe.onnx"))

    assert isinstance(detector, StubDetector)


def test_model_path_vazio_cai_no_stub():
    detector = build_detector(make_settings(model_path=""))

    assert isinstance(detector, StubDetector)


def test_model_path_invalido_sem_fallback_levanta_erro():
    settings = make_settings(
        model_path="models/nao-existe.onnx",
        allow_stub_fallback=False,
    )

    with pytest.raises(RuntimeError):
        build_detector(settings)


def test_model_path_vazio_sem_fallback_levanta_erro():
    settings = make_settings(model_path="", allow_stub_fallback=False)

    with pytest.raises(RuntimeError):
        build_detector(settings)
