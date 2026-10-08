# ADR-0004 — bbox normalizado como fonte de verdade + CoordinateMapper puro

- **Status:** Aceito
- **Data:** 2026-09-25

## Contexto
A maior fonte de bug em overlays é a matemática inversa do letterbox (escala + padding) e o
uso de pixels absolutos, que quebram em resize/zoom e em imagens grandes (DICOM).

## Decisão
- O frontend usa **sempre** `bbox_normalized` (`[0,1]`) para posicionar caixas; `bbox_pixels` é auxiliar.
- Um `CoordinateMapper` puro inverte o letterbox:
  `r = min(S/W0, S/H0)`, `dx = (S - W0*r)/2`, `dy = (S - H0*r)/2`;
  `x_orig = (x - dx)/r` (clamp à imagem original).
- O letterbox registra `scale`, `pad_x`, `pad_y` e `original_size` usados no mapeamento.

## Consequências
- Overlay permanece alinhado independentemente da resolução de exibição.
- Mapeamento 100% testável com teste de ida-e-volta (round-trip).
- DICOM: windowing antes do letterbox (não altera dimensões).
