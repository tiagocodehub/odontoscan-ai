# OdontoScan AI

> **PROTÓTIPO DE PESQUISA.** Este software é um relatório sugestivo gerado por IA para apoio à
> decisão clínica. **NÃO realiza diagnóstico** e **NÃO substitui** a avaliação de um
> cirurgião-dentista. O diagnóstico final e a conduta terapêutica são de responsabilidade
> exclusiva do profissional.

MVP web de apoio à decisão para análise de radiografias odontológicas com IA. Recebe uma
radiografia (panorâmica/intraoral), detecta achados, exibe marcações interativas sobre a imagem
e gera um relatório sugestivo em PDF.

## Escopo (Etapas 1 e 2)
- Upload de radiografia (PNG/JPEG/DICOM).
- Detecção de achados com bounding boxes.
- Legenda interativa (hover na lista destaca a caixa na imagem).
- **Lousa digital:** desenho sobre a radiografia (caneta, seta, retângulo, elipse; cores,
  espessura; desfazer/refazer/limpar). Anotações em coordenadas normalizadas à imagem.
- **Plano de tratamento sugerido e editável:** derivado dos achados (matriz `class → conduta`),
  com inclusão/exclusão, observações por item e itens próprios; linguagem de apoio, sem prescrição.
- **Conta (CRO) e histórico:** cadastro/login, pacientes e análises salvas (achados + plano).
  Uso anônimo continua válido; a **imagem não é armazenada** (ver
  [`adr/0007-auth-persistencia-lgpd.md`](./adr/0007-auth-persistencia-lgpd.md)).
- Relatório PDF (imagem anotada — **com os desenhos** — + achados + plano + disclaimer).

Capacidades e limites do modelo: [`model-card.md`](./model-card.md).

**Pendências de segurança da v1** (documentadas no ADR-0007): sem criptografia em repouso,
refresh token em `localStorage`, rate limit em memória e HTTP local (sem TLS).

## Estado das etapas
| Etapa | Escopo | Status |
|---|---|---|
| 1 | Upload + detecção + legenda interativa + PDF | ✅ |
| 2 | Lousa digital | ✅ |
| 3 | Plano de tratamento editável | ✅ |
| 4 | Login (CRO) + histórico | ✅ |

## Arquitetura
Monorepo com `/backend` (FastAPI) e `/frontend` (Next.js), orquestrado por `docker-compose.yml`.
Arquitetura hexagonal leve: `domain` (puro) → `application` (casos de uso/portas) →
`infrastructure` (adaptadores) → `api` (HTTP).

O contrato da API está congelado em [`api-contract.md`](./api-contract.md). As decisões
arquiteturais estão registradas em [`adr/`](./adr/).

## IA
A inferência usa ONNX Runtime através de um **adaptador plugável**:
- Se `MODEL_PATH` aponta para um `.onnx` válido → `OnnxDetector`.
- Caso contrário → `StubDetector` determinístico (mesmo pipeline de pré-processamento e
  remapeamento de coordenadas).

Trocar de modelo não exige alterar rotas ou casos de uso.

**Modelo padrão:** `backend/models/liodon_dental_panoramic.onnx` — YOLO11-N panorâmico
(10,6 MB, **CC BY-NC-4.0, uso não comercial**), classes `caries`, `periapical_lesion` e
`impacted_tooth`. Validado no val do DENTEX; limiar padrão ajustado para `0,40`.
**Alternativa** (`backend/models/dental_pathology_detector.onnx`, Apache-2.0) disponível, mas
não generaliza para radiografias panorâmicas (0 verdadeiros positivos no gabarito do DENTEX).

**Pré-processamento:** o backend **recorta automaticamente a faixa da panorâmica**
(`AUTO_CROP_PANORAMA`), descartando cabeçalho/rodapé/insets de "quadro de laudo", e devolve as
coordenadas sempre relativas à imagem enviada. O filtro de material radiopaco existe mas vem
**desligado** — medido no DENTEX, ele reduz mais recall que falsos positivos (ver
[`model-card.md`](./model-card.md#61-pré-processamento-e-filtros-medições-nossas)).

## Classes clínicas
Canônicas (dataset DENTEX): `impacted`, `caries`, `deep_caries`, `periapical_lesion`.
Achados informativos do modelo público: `fillings`, `implant`.
Nomes do modelo são normalizados por aliases (ex.: `Cavity` → `caries`).
`bone_loss` está fora de escopo (não existe no DENTEX).

## Conformidade
- **SaMD:** software de apoio diagnóstico tende a Classe de risco II ou superior
  (ANVISA RDC 657/2022 e RDC 751/2022). O disclaimer **não** substitui registro/notificação nem
  o dossiê técnico (IEC 62304, ISO 14971, origem e tamanho dos dados de treino). **Este projeto
  não é regularizado e não deve ser usado com pacientes reais.**
- **LGPD:** dado de saúde é sensível (Art. 11). Na v1 a imagem é processada em memória e **não é
  armazenada**; não coletamos identificadores de paciente.

## Licenças de terceiros
- Dataset **DENTEX**: CC BY-NC-SA 4.0 (não comercial).
- **Ultralytics YOLO**: AGPL-3.0 (uso comercial exige Ultralytics Enterprise License) — motivo
  da escolha por ONNX Runtime.

## Como executar
```bash
docker compose up --build
```
- Backend: http://localhost:8000 (docs em `/docs`)
- Frontend: http://localhost:3000

## Desenvolvimento
- Backend: `cd backend && pytest`
- Frontend: `cd frontend && npm run dev`
