"""Testes da fração de material radiopaco (supressão de falsos positivos)."""

from __future__ import annotations

import numpy as np
import pytest

from app.application.analyze import radiopaque_fraction


def test_regiao_totalmente_branca():
    gray = np.zeros((100, 100), dtype=np.float32)
    gray[10:20, 10:20] = 255.0

    assert radiopaque_fraction(gray, (10, 10, 20, 20), intensity=200) == 1.0


def test_fracao_em_imagem_inteira():
    gray = np.zeros((100, 100), dtype=np.float32)
    gray[10:20, 10:20] = 255.0

    assert radiopaque_fraction(gray, (0, 0, 100, 100), intensity=200) == pytest.approx(0.01)


def test_caixa_invalida_retorna_zero():
    gray = np.full((50, 50), 255.0, dtype=np.float32)

    assert radiopaque_fraction(gray, (10, 10, 10, 10), intensity=200) == 0.0


def test_caixa_extrapola_bordas_com_clamp():
    gray = np.full((50, 50), 255.0, dtype=np.float32)

    # Coordenadas fora da imagem sao recortadas para o tamanho real.
    assert radiopaque_fraction(gray, (-10, -10, 500, 500), intensity=200) == 1.0


def test_regiao_escura_nao_e_radiopaca():
    gray = np.full((50, 50), 120.0, dtype=np.float32)

    assert radiopaque_fraction(gray, (0, 0, 50, 50), intensity=200) == 0.0
