"""Testes do mapeamento de coordenadas quando há recorte antes da inferência."""

from __future__ import annotations

import pytest

from app.application.analyze import CoordinateMapper, LetterboxTransform
from app.domain.models import BBox


def _mapper() -> CoordinateMapper:
    return CoordinateMapper(
        LetterboxTransform(
            scale=0.5,
            pad_x=10.0,
            pad_y=20.0,
            original_size=(2000, 1000),
            crop_offset=(300, 100),
        )
    )


def test_to_pixels_soma_o_offset_do_recorte():
    pixels = _mapper().to_pixels(BBox(x1=10, y1=20, x2=60, y2=70))

    assert (pixels.x1, pixels.y1, pixels.x2, pixels.y2) == (300.0, 100.0, 400.0, 200.0)


def test_round_trip_com_recorte():
    mapper = _mapper()
    original = BBox(x1=320, y1=140, x2=380, y2=190)

    tensor = mapper.to_tensor(original)
    back = mapper.to_pixels(tensor)

    assert back.x1 == pytest.approx(original.x1)
    assert back.y1 == pytest.approx(original.y1)
    assert back.x2 == pytest.approx(original.x2)
    assert back.y2 == pytest.approx(original.y2)


def test_normalizado_usa_tamanho_original():
    # Entrada em espaço do tensor (10,20)-(60,70) -> pixels (300,100)-(400,200).
    normalized = _mapper().to_normalized(BBox(x1=10, y1=20, x2=60, y2=70))

    assert normalized.x1 == pytest.approx(0.15)
    assert normalized.y1 == pytest.approx(0.10)
    assert normalized.x2 == pytest.approx(0.20)
    assert normalized.y2 == pytest.approx(0.20)


def test_clamp_na_imagem_original():
    mapper = CoordinateMapper(
        LetterboxTransform(
            scale=1.0,
            pad_x=0.0,
            pad_y=0.0,
            original_size=(100, 100),
            crop_offset=(50, 50),
        )
    )

    pixels = mapper.to_pixels(BBox(x1=-100, y1=-100, x2=1000, y2=1000))

    assert (pixels.x1, pixels.y1) == (0.0, 0.0)
    assert (pixels.x2, pixels.y2) == (100.0, 100.0)
