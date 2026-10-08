# ADR-0002 — ONNX Runtime em vez de Ultralytics YOLO

- **Status:** Aceito
- **Data:** 2026-09-25

## Contexto
O prompt original sugeria Ultralytics YOLOv8/v11. Porém o pacote Ultralytics é licenciado sob
**AGPL-3.0**: usar o código, os modelos ou modelos treinados a partir dele em produto comercial
closed-source exige **Ultralytics Enterprise License**, sob pena de obrigar a abrir todo o
código-fonte. Além disso, o dataset DENTEX é **CC BY-NC-SA 4.0 (não comercial)**.

## Decisão
Usar **ONNX Runtime** como motor de inferência, desacoplado via adaptador (ver ADR-0003).
O runtime não impõe a AGPL do framework de treino.

## Consequências
- Menor risco jurídico para uso comercial futuro.
- O modelo continua sendo um artefato externo (`.onnx`); a licença do **treino/dataset** deve ser
  revalidada antes de qualquer uso comercial (DENTEX é não comercial).
- Exige implementar decode + NMS manualmente em `postprocess.py` (custo aceitável e isolado).
