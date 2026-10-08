"""Testes da matriz de regras clínicas (domínio puro)."""

from __future__ import annotations

import pytest

from app.domain.clinical_rules import DISCLAIMER, FALLBACK_LABEL, rule_for
from app.domain.models import Urgency

EXPECTED = {
    "impacted": ("Dente Impactado/Incluso", Urgency.ELETIVA),
    "caries": ("Cárie Dentária", Urgency.ELETIVA),
    "deep_caries": ("Cárie Profunda", Urgency.PRIORITARIA),
    "periapical_lesion": ("Lesão/Infecção Periapical", Urgency.URGENTE),
}


@pytest.mark.parametrize(("class_name", "expected"), EXPECTED.items())
def test_matriz_clinica_por_classe(class_name, expected):
    label_pt, urgency = expected
    rule = rule_for(class_id=0, class_name=class_name)

    assert rule.label_pt == label_pt
    assert rule.urgency == urgency
    assert rule.class_name == class_name


@pytest.mark.parametrize("class_name", list(EXPECTED.keys()))
def test_conduta_usa_verbos_de_apoio(class_name):
    rule = rule_for(class_id=0, class_name=class_name)
    lowered = rule.conduct.lower()
    assert "avaliar" in lowered or "considerar" in lowered


@pytest.mark.parametrize(
    ("raw_name", "expected_label", "expected_urgency"),
    [
        ("impacted_tooth", "Dente Impactado/Incluso", Urgency.ELETIVA),
        ("Impacted Tooth", "Dente Impactado/Incluso", Urgency.ELETIVA),
        ("Cavity", "Cárie Dentária", Urgency.ELETIVA),
        ("cavities", "Cárie Dentária", Urgency.ELETIVA),
        ("Fillings", "Restauração prévia", Urgency.INFORMATIVA),
        ("Implant", "Implante dentário", Urgency.INFORMATIVA),
    ],
)
def test_aliases_dos_modelos_publicos(raw_name, expected_label, expected_urgency):
    rule = rule_for(class_id=0, class_name=raw_name)

    assert rule.label_pt == expected_label
    assert rule.urgency == expected_urgency


def test_classe_desconhecida_cai_no_fallback():
    rule = rule_for(class_id=99, class_name="bone_loss")

    assert rule.label_pt == FALLBACK_LABEL
    assert rule.urgency == Urgency.INFORMATIVA
    assert rule.conduct


def test_fallback_quando_nome_ausente():
    rule = rule_for(class_id=7, class_name=None)

    assert rule.label_pt == FALLBACK_LABEL
    assert rule.urgency == Urgency.INFORMATIVA


def test_disclaimer_constante_do_servidor():
    assert DISCLAIMER.startswith("Protótipo de pesquisa.")
    assert "NÃO realiza diagnóstico" in DISCLAIMER
