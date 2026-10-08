# OdontoScan AI

> **PROTÓTIPO DE PESQUISA.** Relatório sugestivo gerado por IA para apoio à decisão clínica.
> **NÃO realiza diagnóstico** e **NÃO substitui** a avaliação de um cirurgião-dentista.

MVP web de apoio à decisão em radiografias odontológicas: upload da radiografia, detecção de
achados com IA, marcações interativas (bounding boxes) com legenda sincronizada e relatório PDF.

## Funcionalidades (Etapas 1 e 2)
- Upload de radiografia (PNG/JPEG/DICOM).
- Detecção de achados (ONNX Runtime ou *stub* determinístico).
- Viewer com bounding boxes e legenda interativa (hover destaca a caixa).
- **Lousa digital:** desenhe/circule/anote sobre a radiografia — caneta livre, seta,
  retângulo e elipse, com cores, espessura e desfazer/refazer/limpar.
- **Plano de tratamento sugerido e editável:** pré-preenchido a partir dos achados
  (com observações por item e itens próprios do dentista).
- Relatório PDF com a imagem demarcada (**incluindo os desenhos**), achados, plano e disclaimer.
- **Conta do dentista (CRO) e histórico de pacientes:** cadastro/login, pacientes e análises
  salvas (achados + plano). O uso **anônimo continua funcionando**; o histórico só existe com login.

> **A imagem NÃO é armazenada.** O histórico guarda metadados, achados e plano; para rever
> visualmente, reenvie o arquivo. Veja `docs/adr/0007-auth-persistencia-lgpd.md`.

Roadmap: conexão a uma API comercial de IA (dados/API licenciados); Postgres + Alembic;
criptografia em repouso; cookies `HttpOnly` para o refresh token.

## Estrutura
```
OdontoScan AI/
├─ backend/     # FastAPI + ONNX/stub (hexagonal leve)
├─ frontend/    # Next.js + react-konva + jspdf
├─ docs/        # README técnico, contrato da API e ADRs
├─ memory/      # PROJECT_MEMORY.md (contexto para agentes)
└─ docker-compose.yml
```

## Executar com Docker (recomendado)
```bash
docker compose up --build
```
- Frontend: http://localhost:3000
- Backend: http://localhost:8000 (docs em `/docs`)

## Executar manualmente
### Backend
```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
# testes: .venv\Scripts\python -m pytest -q
```
### Frontend
```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev   # http://localhost:3000
```

## IA
A inferência usa **ONNX Runtime** através de um adaptador plugável (`MODEL_PATH`):
- `MODEL_PATH` válido → `OnnxDetector`.
- Ausente/inválido → `StubDetector` determinístico (mesmo pipeline de pré-processamento e
  remapeamento de coordenadas). Ajuste via `ALLOW_STUB_FALLBACK`.

**Modelo padrão:** `backend/models/liodon_dental_panoramic.onnx` — YOLO11-N panorâmico
(10,6 MB, **CC BY-NC-4.0, uso não comercial**), classes `caries`, `periapical_lesion`,
`impacted_tooth`, validado no val do DENTEX (mAP50 0,622; F1 0,51 @ conf 0,40 no nosso sweep).

**Alternativa:** `backend/models/dental_pathology_detector.onnx` (Apache-2.0, permissivo, mas
**não generaliza para panorâmica** — 0 verdadeiros positivos no gabarito do DENTEX).

Classes canônicas (DENTEX): `impacted`, `caries`, `deep_caries`, `periapical_lesion`
(+ informativas `fillings` e `implant`). Nomes dos modelos são normalizados por aliases.
`bone_loss` está fora de escopo.

## Documentação
- [`docs/api-contract.md`](docs/api-contract.md) — contrato da API (congelado).
- [`docs/adr/`](docs/adr/) — decisões arquiteturais (ADR-0001 a 0006).
- [`docs/model-card.md`](docs/model-card.md) — o que o modelo detecta e não detecta.
- [`docs/README.md`](docs/README.md) — escopo, licenças, SaMD e LGPD.

## Conformidade
Protótipo **não regularizado** — não usar com pacientes reais. SaMD tende a Classe II+
(ANVISA RDC 657/2022 e RDC 751/2022). LGPD Art. 11: a imagem é processada em memória e não é
armazenada na Etapa 1.

## Licenças de terceiros
Dataset **DENTEX** (CC BY-NC-SA 4.0, não comercial); **Ultralytics YOLO** (AGPL-3.0) — por isso
optamos por ONNX Runtime.
