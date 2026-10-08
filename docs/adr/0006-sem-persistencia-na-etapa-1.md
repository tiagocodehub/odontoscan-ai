# ADR-0006 — Sem persistência na Etapa 1 (SQLite/Postgres adiados)

- **Status:** Aceito
- **Data:** 2026-09-25

## Contexto
O plano inicial previa SQLite na v1. Porém nenhum caso de uso da Etapa 1 lê ou grava dados
persistentes: o fluxo é upload → análise → exibição → PDF, tudo efêmero. O histórico só chega
na Etapa 4.

## Decisão
**Não introduzir banco de dados na Etapa 1.** A arquitetura fica pronta para persistência
(domínio puro + futura porta de repositório), mas sem implementação. Manter apenas
`analysis_id`/`request_id` para rastreabilidade via log, e `image.sha256` para auditoria/dedup
sem guardar a imagem.

## Consequências
- API stateless: mais simples de rodar, testar e manter.
- Melhor conformidade LGPD na v1: imagem processada em memória e descartada (retenção = 0).
- Na Etapa 4 entra SQLite/Postgres + repositório-porta + Alembic; `bbox_normalized` já é
  serializado de forma neutra (JSON/array) para não depender de tipo específico.
