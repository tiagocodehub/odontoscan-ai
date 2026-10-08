"""Testes do CoordinateMapper (inverso do letterbox) — ida e volta."""

from __future__ import annotations

import pytest

from app.application.analyze import CoordinateMapper, LetterboxTransform
from app.domain.models import BBox


def build_transform(original_size=(2880, 1440), size=640) -> LetterboxTransform:
    width, height = original_size
    scale = min(size / width, size / height)
    new_width = round(width * scale)
    new_height = round(height * scale)
    pad_x = (size - new_width) // 2
    pad_y = (size - new_height) // 2
    return LetterboxTransform(
        scale=scale,
        pad_x=float(pad_x),
        pad_y=float(pad_y),
        original_size=original_size,
    )


def test_letterbox_landscape_registra_padding():
    transform = build_transform(original_size=(2880, 1440), size=640)

    assert transform.scale == pytest.approx(640 / 2880)
    assert transform.pad_x == pytest.approx(0.0)
    assert transform.pad_y == pytest.approx(160.0)


def test_round_trip_tensor_original_tensor():
    mapper = CoordinateMapper(build_transform(original_size=(2880, 1440)))
    original = BBox(x1=500.0, y1=300.0, x2=900.0, y2=700.0)

    tensor = mapper.to_tensor(original)
    back = mapper.to_pixels(tensor)

    assert back.x1 == pytest.approx(original.x1, abs=1e-6)
    assert back.y1 == pytest.approx(original.y1, abs=1e-6)
    assert back.x2 == pytest.approx(original.x2, abs=1e-6)
    assert back.y2 == pytest.approx(original.y2, abs=1e-6)


def test_letterbox_portrait_registra_padding():
    transform = build_transform(original_size=(1440, 2880), size=640)

    assert transform.scale == pytest.approx(640 / 2880)
    assert transform.pad_x == pytest.approx(160.0)
    assert transform.pad_y == pytest.approx(0.0)


def test_round_trip_retrato_h_maior_que_w():
    mapper = CoordinateMapper(build_transform(original_size=(1440, 2880)))
    original = BBox(x1=100.0, y1=500.0, x2=300.0, y2=900.0)

    tensor = mapper.to_tensor(original)
    back = mapper.to_pixels(tensor)

    assert back.x1 == pytest.approx(original.x1, abs=1e-6)
    assert back.y1 == pytest.approx(original.y1, abs=1e-6)
    assert back.x2 == pytest.approx(original.x2, abs=1e-6)
    assert back.y2 == pytest.approx(original.y2, abs=1e-6)


def test_normalizado_dentro_de_0_1():
    mapper = CoordinateMapper(build_transform(original_size=(2880, 1440)))
    tensor_bbox = BBox(x1=100.0, y1=200.0, x2=400.0, y2=500.0)

    normalized = mapper.to_normalized(tensor_bbox)

    for value in normalized.as_tuple():
        assert 0.0 <= value <= 1.0
    assert normalized.x1 < normalized.x2
    assert normalized.y1 < normalized.y2


def test_clamp_em_coordenadas_fora_do_tensor():
    mapper = CoordinateMapper(build_transform(original_size=(1000, 1000)))
    outside = BBox(x1=-500.0, y1=-500.0, x2=5000.0, y2=5000.0)

    pixels = mapper.to_pixels(outside)

    assert pixels.x1 == 0.0
    assert pixels.y1 == 0.0
    assert pixels.x2 == 1000.0
    assert pixels.y2 == 1000.0
