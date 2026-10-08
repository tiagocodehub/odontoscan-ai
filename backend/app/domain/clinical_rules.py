"""Matriz de regras clínicas (pura, sem I/O) — condutas de SUPORTE, nunca prescrição.

Fonte: `docs/prompts/prompt_v2.txt` (seção 4) e `docs/api-contract.md`.
"""

from __future__ import annotations

from app.domain.models import DiagnosisClass, Urgency

DISCLAIMER = (
    "Protótipo de pesquisa. Relatório sugestivo gerado por IA para apoio à decisão. "
    "NÃO realiza diagnóstico e NÃO substitui a avaliação de um cirurgião-dentista."
)

FALLBACK_LABEL = "Achado não catalogado"
FALLBACK_CONDUCT = (
    "Achado não catalogado na base clínica desta versão. Avaliar clinicamente e "
    "considerar investigação complementar antes de qualquer conduta."
)

_CLINICAL_MATRIX: dict[str, tuple[str, Urgency, str]] = {
    "impacted": (
        "Dente Impactado/Incluso",
        Urgency.ELETIVA,
        "Avaliar indicação cirúrgica (Bucomaxilofacial) ou acompanhamento radiográfico "
        "se não houver reabsorção dos dentes vizinhos.",
    ),
    "caries": (
        "Cárie Dentária",
        Urgency.ELETIVA,
        "Correlacionar com exame clínico. Considerar restauração em resina composta "
        "e/ou aplicação de flúor se incipiente.",
    ),
    "deep_caries": (
        "Cárie Profunda",
        Urgency.PRIORITARIA,
        "Risco de envolvimento pulpar. Avaliar necessidade de tratamento endodôntico.",
    ),
    "periapical_lesion": (
        "Lesão/Infecção Periapical",
        Urgency.URGENTE,
        "Avaliar tratamento endodôntico; em casos avançados com fratura radicular, "
        "considerar exodontia e planejamento de implante.",
    ),
    # Achados informativos presentes em modelos públicos (ex.: clinical-dental-pathology-detector).
    "fillings": (
        "Restauração prévia",
        Urgency.INFORMATIVA,
        "Achado compatível com tratamento restaurador prévio. Correlacionar com o "
        "histórico clínico do paciente.",
    ),
    "implant": (
        "Implante dentário",
        Urgency.INFORMATIVA,
        "Achado compatível com implante instalado. Correlacionar com o histórico "
        "clínico e o planejamento reabilitador.",
    ),
}

_ALIASES: dict[str, str] = {
    "periapical_lesions": "periapical_lesion",
    "periapical": "periapical_lesion",
    "deep_carie": "deep_caries",
    "dental_caries": "caries",
    "impaction": "impacted",
    # Aliases do modelo ONNX público (ajeetsraina/clinical-dental-pathology-detector).
    "cavity": "caries",
    "cavities": "caries",
    "impacted tooth": "impacted",
    "impacted teeth": "impacted",
    "impacted_tooth": "impacted",
    "filling": "fillings",
    "implants": "implant",
}


def rule_for(class_id: int, class_name: str | None) -> DiagnosisClass:
    """Resolve a regra clínica pelo NOME da classe (nunca pelo ID hardcoded).

    Classe desconhecida cai no fallback "Achado não catalogado" / informativa.
    """

    key = (class_name or "").strip().lower()
    canonical = _ALIASES.get(key, key)
    entry = _CLINICAL_MATRIX.get(canonical)

    if entry is None:
        return DiagnosisClass(
            class_id=class_id,
            class_name=class_name or str(class_id),
            label_pt=FALLBACK_LABEL,
            urgency=Urgency.INFORMATIVA,
            conduct=FALLBACK_CONDUCT,
        )

    label_pt, urgency, conduct = entry
    return DiagnosisClass(
        class_id=class_id,
        class_name=class_name or canonical,
        label_pt=label_pt,
        urgency=urgency,
        conduct=conduct,
    )
