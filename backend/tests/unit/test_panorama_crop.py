"""Testes do recorte automático da faixa panorâmica."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from app.infrastructure.imaging.preprocess import PillowImageCodec, detect_panorama_crop


def _png(array: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format="PNG")
    return buffer.getvalue()


def _board_with_header_and_insets() -> np.ndarray:
    """Fundo escuro + cabeçalho + faixa panorâmica larga + insets no rodapé."""

    image = np.zeros((400, 1000, 3), dtype=np.uint8)
    image[40:60, 100:900] = 255  # cabeçalho (texto claro, mas estreito)
    image[120:300, 50:950] = 150  # faixa da panorâmica
    image[330:390, 200:400] = 200  # insets intraorais
    return image


def test_detecta_apenas_a_faixa_da_panoramica():
    box = detect_panorama_crop(_board_with_header_and_insets())

    assert box is not None
    x, y, width, height = box
    assert (x, y) == (50, 120)
    assert width == 900
    assert height == 180


def test_imagem_pequena_retorna_none():
    assert detect_panorama_crop(np.zeros((4, 4, 3), dtype=np.uint8)) is None


def test_imagem_escura_retorna_none():
    assert detect_panorama_crop(np.zeros((200, 800, 3), dtype=np.uint8)) is None


def test_codec_nao_recorta_imagem_uniforme():
    array = np.full((300, 600, 3), 170, dtype=np.uint8)
    codec = PillowImageCodec(auto_crop=True)

    result = codec.preprocess(_png(array))

    assert result.crop_size is None
    assert result.crop_offset == (0, 0)
    assert result.original_size == (600, 300)


def test_codec_recorta_quadro_de_laudo():
    codec = PillowImageCodec(auto_crop=True)

    result = codec.preprocess(_png(_board_with_header_and_insets()))

    assert result.crop_size == (900, 180)
    assert result.crop_offset == (50, 120)
    # As coordenadas continuam relativas à imagem ENVIADA.
    assert result.original_size == (1000, 400)


def test_codec_respeita_auto_crop_desativado():
    codec = PillowImageCodec(auto_crop=False)

    result = codec.preprocess(_png(_board_with_header_and_insets()))

    assert result.crop_size is None
    assert result.crop_offset == (0, 0)


def test_ganho_minimo_evita_recorte_irrelevante():
    array = np.full((400, 1000, 3), 150, dtype=np.uint8)
    # Faixa clara cobrindo quase tudo: ganho abaixo do limiar configuravel.
    codec = PillowImageCodec(auto_crop=True, crop_min_gain=0.05)

    result = codec.preprocess(_png(array))

    assert result.crop_size is None
