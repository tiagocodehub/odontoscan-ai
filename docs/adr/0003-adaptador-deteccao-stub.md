# ADR-0003 — Adaptador de detecção plugável + stub determinístico

- **Status:** Aceito
- **Data:** 2026-09-25

## Contexto
Não tínhamos um modelo odontológico pronto e validado. Precisávamos entregar a Etapa 1
funcional (fluxo completo upload→detecção→overlay→PDF) sem bloquear no modelo.

## Decisão
Definir a porta `DetectorPort` e uma factory que escolhe a implementação por `MODEL_PATH`:
- `MODEL_PATH` válido → `OnnxDetector`.
- Ausente/inválido → `StubDetector` determinístico (hash SHA-256 dos bytes → caixas estáveis).
- `ALLOW_STUB_FALLBACK` controla o fallback; nunca cair silenciosamente.

O stub **percorre o mesmo pipeline** (pré-processamento → detecção → mapeamento → regras),
emitindo caixas no espaço do tensor.

## Consequências
- A Etapa 1 fica completa e testável sem modelo real.
- Trocar de modelo = 1 arquivo + `MODEL_PATH`; nenhuma rota/caso de uso muda.
- Bugs de overlay aparecem já com o stub.
- `class_names` deve vir do modelo ou de `models/labels.json` (sidecar), com aliases e fallback
  "não catalogado" para evitar `KeyError`.
