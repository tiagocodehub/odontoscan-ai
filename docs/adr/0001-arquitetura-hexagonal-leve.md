# ADR-0001 — Arquitetura hexagonal leve (domain / application / infrastructure / api)

- **Status:** Aceito
- **Data:** 2026-09-25

## Contexto
Precisávamos separar regras clínicas puras e orquestração das dependências pesadas
(FastAPI, OpenCV, ONNX), sem introduzir a cerimônia de Clean Architecture/DDD
(agregados, repositórios, unidade de trabalho) desnecessária para um MVP.

## Decisão
Adotar camadas `domain / application / infrastructure / api` com regra de dependência unidirecional:
- `domain/` não importa nada de terceiros (sem FastAPI/OpenCV/ONNX/Pydantic).
- `application/` depende apenas de `domain/` + portas (`Protocol`).
- `infrastructure/` implementa as portas.
- `api/` traduz HTTP e é o único que conhece FastAPI.
- `main.py` atua como composition root.

## Consequências
- Domínio e regras clínicas são puros e 100% testáveis.
- Trocar implementações (stub↔ONNX, SQLite↔Postgres) não afeta rotas.
- Backend permanece enxuto (~10 arquivos), sem over-engineering.
