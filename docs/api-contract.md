# Contrato da API — OdontoScan AI (v1)

> Documento congelado. Fonte de verdade compartilhada entre backend e frontend.
> Versão: `v1`. Base URL local: `http://localhost:8000`.

## Endpoints

| Verbo | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/analyze` | Analisa uma radiografia (`multipart/form-data`, campo `image`) |
| GET | `/healthz` | Liveness (container healthcheck) |
| GET | `/readyz` | Readiness (detector carregado) |

## Response — `POST /api/v1/analyze` (200)

```json
{
  "analysis_id": "0f6c2b1e-3a1d-4b2c-9f1e-7d6a5c4b3a21",
  "request_id": "a1b2c3d4e5f6",
  "disclaimer": "Protótipo de pesquisa. Relatório sugestivo gerado por IA para apoio à decisão. NÃO realiza diagnóstico e NÃO substitui a avaliação de um cirurgião-dentista.",
  "model": {
    "version": "stub-0.1.0",
    "runtime": "stub",
    "threshold": 0.4,
    "nms_iou": 0.45
  },
  "inference_ms": 12,
  "image": {
    "width": 2880,
    "height": 1440,
    "format": "png",
    "original_format": "png",
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "bytes": 1048576,
    "crop": { "x": 280, "y": 420, "width": 4400, "height": 1556 }
  },
  "summary": {
    "total": 2,
    "by_class": { "periapical_lesion": 1, "caries": 1 },
    "max_urgency": "urgente",
    "suppressed": 0
  },
  "findings": [
    {
      "finding_id": "f1",
      "class_id": 3,
      "class_name": "periapical_lesion",
      "label_pt": "Lesão/Infecção Periapical",
      "confidence": 0.83,
      "urgency": "urgente",
      "conduct": "Avaliar tratamento endodôntico; em casos avançados com fratura radicular, considerar exodontia e planejamento de implante.",
      "bbox_order": "xyxy",
      "bbox_normalized": [0.412, 0.531, 0.470, 0.602],
      "bbox_pixels": [1186, 764, 1353, 867]
    }
  ]
}
```

### Regras do payload
- `bbox_order` é sempre `"xyxy"`.
- `bbox_normalized` usa `[0,1]` relativo à imagem **original** — é a **fonte de verdade** do frontend.
- `bbox_pixels` usa a imagem original em pixels (auxiliar, para tooltips/toasts).
- `findings: []` é resultado válido → **200** (nunca 404).
- `finding_id` é estável e é a chave de correlação do hover legenda↔caixa.
- `disclaimer` vem sempre do servidor (fonte única).
- `urgency` ∈ `{ "informativa", "eletiva", "prioritária", "urgente" }`.
- `image.crop` (nullable): recorte aplicado antes da inferência (remove cabeçalho/rodapé/insets
  de "quadro de laudo"). **As coordenadas continuam relativas à imagem ENVIADA** — o recorte é
  desfeito no mapeamento, então `bbox_normalized`/`bbox_pixels` seguem válidos na imagem original.
- `summary.suppressed`: detecções descartadas pelo filtro de material radiopaco (0 quando desligado).

### Classes conhecidas
Canônicas (DENTEX): `impacted`, `caries`, `deep_caries`, `periapical_lesion`.
Informativas: `fillings` (Restauração prévia), `implant` (Implante dentário).

Os nomes vindos do modelo são normalizados por **aliases** antes de resolver a regra
(ex.: `Cavity`/`cavities` → `caries`; `Impacted Tooth` → `impacted`; `Implants` → `implant`).

Classe desconhecida → fallback com `label_pt: "Achado não catalogado"` e `urgency: "informativa"`.

> Modelo ONNX padrão em `backend/models/liodon_dental_panoramic.onnx` (CC BY-NC-4.0; classes
> `caries`, `periapical_lesion`, `impacted_tooth`). Definido em `MODEL_PATH`. Sem `MODEL_PATH`
> válido → stub determinístico. Alternativa permissiva (Apache-2.0): `dental_pathology_detector.onnx`.

## Erros (envelope único)

```json
{ "error": { "code": "UNSUPPORTED_MEDIA_TYPE", "message": "Formato não suportado. Envie PNG, JPEG ou DICOM.", "request_id": "a1b2c3d4e5f6" } }
```

| Status | Código | Gatilho |
|---|---|---|
| 400 | `INVALID_FILE` | Arquivo corrompido / magic bytes inválidos |
| 413 | `FILE_TOO_LARGE` | Arquivo acima de `MAX_UPLOAD_MB` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Formato fora de PNG/JPEG/DICOM |
| 422 | `INVALID_INPUT` | Multipart sem campo `image` / inválido |
| 500 | `INFERENCE_FAILED` | Exceção no adaptador de inferência |
| 503 | `MODEL_NOT_READY` | Detector não carregado (`/readyz` falso) |

Mensagens em PT-BR, voltadas ao usuário; nunca vazar stack trace ou caminhos internos.

## Autenticação e histórico (Etapa 4)

### Autenticação
| Verbo | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/auth/register` | Cria conta (nome, e-mail, CRO, UF, senha) |
| POST | `/api/v1/auth/login` | Retorna `access_token` (15 min) + `refresh_token` (7 dias) |
| POST | `/api/v1/auth/refresh` | Rotaciona o par de tokens (o refresh usado é invalidado) |
| POST | `/api/v1/auth/logout` | Revoga o refresh token no servidor |
| GET | `/api/v1/auth/me` | Dados do usuário autenticado |

`Authorization: Bearer <access_token>` nas rotas protegidas.

**Corpos (JSON):**
```jsonc
// POST /auth/register  -> 201
{ "name": "Dra. Ana", "email": "ana@clinica.com", "cro_number": "12345", "cro_state": "SP", "password": "segredo-forte" }
// resposta: { "id": 1, "name": "...", "email": "...", "cro_number": "12345", "cro_state": "SP" }

// POST /auth/login  -> 200
{ "email": "ana@clinica.com", "password": "segredo-forte" }
// resposta:
{ "access_token": "...", "token_type": "bearer", "expires_in": 900,
  "refresh_token": "...", "user": { "id": 1, "name": "...", "email": "...", "cro_number": "12345", "cro_state": "SP" } }

// POST /auth/refresh -> 200 (mesmo corpo do login)   |   POST /auth/logout -> 204
{ "refresh_token": "..." }

// POST /patients -> 201   |  { "name": "Maria S.", "notes": "opcional" }
// PUT /analyses/{id}      |  { "patient_id": 3, "notes": "...", "plan": [ /* itens */ ] }
```
`GET /auth/me` devolve o objeto `user`. `GET /patients` devolve uma lista de pacientes.
Regras: `email` único (409), `password` ≥ 8 caracteres, `cro_state` = UF de 2 letras,
`cro_number` só dígitos.

### Pacientes e histórico
| Verbo | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/v1/patients` | Lista/cria pacientes do usuário |
| GET/DELETE | `/api/v1/patients/{id}` | Obtém/remove um paciente (remove também suas análises) |
| GET | `/api/v1/analyses` | Lista análises (`?patient_id=` opcional) |
| GET/DELETE | `/api/v1/analyses/{id}` | Obtém/remove uma análise |
| PUT | `/api/v1/analyses/{id}` | Atualiza `patient_id`, `notes` e `plan` da análise |

### Registro de análise (histórico)
```json
{
  "record_id": 12,
  "analysis_id": "0f6c2b1e-...",
  "created_at": "2026-09-25T14:03:00Z",
  "patient": { "id": 3, "name": "Maria S." },
  "image": { "width": 5000, "height": 3880, "format": "jpeg", "sha256": "b8271e..." },
  "crop": { "x": 280, "y": 420, "width": 4400, "height": 1556 },
  "model": { "version": "8.4.81", "runtime": "onnxruntime", "threshold": 0.4, "nms_iou": 0.45 },
  "summary": { "total": 2, "by_class": { "caries": 2 }, "max_urgency": "eletiva" },
  "findings": [ /* mesmo formato de `/analyze` */ ],
  "plan": [ /* itens do plano de tratamento (opcional; salvo via PUT) */ ],
  "notes": "Observações do dentista"
}
```
Lista (`GET /analyses`) devolve os mesmos campos, **sem** `findings`/`plan` (só `summary` e metadados).
Em `PUT`, apenas `patient_id`, `notes` e `plan` são aceitos.

### Mudanças em `POST /api/v1/analyze`
- **Continua público** (uso anônimo funciona como antes).
- Campos opcionais no multipart: `patient_id` (int).
- Se houver `Authorization` válido, a análise é **persistida** e o payload ganha
  `"persisted": true` + `"record_id"` (id do registro no histórico). Caso contrário, `false`/`null`.
- **A imagem NÃO é armazenada** (LGPD). O histórico guarda metadados (`sha256`, dimensões,
  formato), `findings`, `plan` e o recorte. Para rever visualmente, reenvie o arquivo.

### Erros adicionais
| Status | Código | Gatilho |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Token ausente/expirado/inválido |
| 409 | `EMAIL_ALREADY_REGISTERED` | E-mail já cadastrado |
| 429 | `RATE_LIMITED` | Excesso de tentativas de login |
| 404 | `NOT_FOUND` | Paciente/análise inexistente **ou de outro usuário** (não vaza existência) |

## Parâmetros (env)
| Variável | Default | Descrição |
|---|---|---|
| `MAX_UPLOAD_MB` | `15` | Tamanho máximo do upload |
| `CONF_THRESHOLD` | `0.40` | Limiar de confiança (sweep no DENTEX val: F1 0,51 / P 0,55) |
| `NMS_IOU` | `0.45` | IoU do NMS |
| `MAX_CONCURRENCY` | `2` | Inferências simultâneas (semáforo) |
| `MODEL_PATH` | `` (vazio) | Caminho do `.onnx`; vazio → stub |
| `ALLOW_STUB_FALLBACK` | `true` | Permitir fallback para stub |
| `CORS_ORIGINS` | `http://localhost:3000` | Origens permitidas |
| `AUTO_CROP_PANORAMA` | `true` | Recorta a faixa da panorâmica antes da inferência |
| `CROP_MIN_GAIN` | `0.05` | Só recorta se remover ao menos esta fração da área |
| `SUPPRESS_RADIOPAQUE` | `false` | Descarta detecções sobre material radiopaco (**desligado**: medido, reduz recall) |
| `RADIOPAQUE_THRESHOLD` | `0.35` | Fração de pixels claros para descartar (quando ligado) |
| `RADIOPAQUE_INTENSITY` | `200` | Intensidade a partir da qual o pixel é "radiopaco" |
| `DATABASE_URL` | `sqlite:///./data/odontoscan.db` | Banco (SQLite na v1; Postgres depois) |
| `JWT_SECRET` | *(obrigatório)* | Segredo HMAC do JWT (sem default em produção) |
| `ACCESS_TOKEN_MINUTES` | `15` | Validade do access token |
| `REFRESH_TOKEN_DAYS` | `7` | Validade do refresh token |
| `LOGIN_RATE_LIMIT` | `5` | Tentativas de login por minuto (por IP+e-mail) |
