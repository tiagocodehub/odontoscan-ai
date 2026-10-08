# ADR-0005 — Relatório PDF gerado no cliente (jspdf) na v1

- **Status:** Aceito
- **Data:** 2026-09-25

## Contexto
Precisávamos de um relatório PDF (imagem anotada + achados + disclaimer) já na Etapa 1,
sem persistência e com o mínimo de superfície de dados sensíveis.

## Decisão
Gerar o PDF no **navegador** com **jspdf**, compondo a imagem a partir do próprio `Stage` do
Konva (`stage.toDataURL({ pixelRatio: 2 })`), o que já inclui as caixas desenhadas, mais a
tabela de achados e o disclaimer.

## Consequências
- A imagem **não sai do navegador** para gerar o PDF (melhor para LGPD).
- Zero dependência/round-trip no backend; implementação simples.
- Cuidados: acentuação PT-BR (fonte Latin-1) e escala do recorte.
- Encapsulado em `ReportPdf.tsx` para permitir migração ao backend quando houver histórico
  (Etapa 4), onde o PDF precisa existir sem o cliente.
