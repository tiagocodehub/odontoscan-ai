/**
 * Tipos que espelham EXATAMENTE o schema de `docs/api-contract.md` (v1).
 * Nao renomeie campos: o contrato e a fonte de verdade compartilhada com o backend.
 */

/** Uniao fechada de urgencias previstas no contrato. */
export type Urgency = "informativa" | "eletiva" | "prioritária" | "urgente";

/** Ordem de gravidade crescente (informativa < eletiva < prioritária < urgente). */
export const URGENCY_ORDER = [
  "informativa",
  "eletiva",
  "prioritária",
  "urgente",
] as const satisfies readonly Urgency[];

/** `bbox_order` e sempre `"xyxy"` conforme contrato. */
export type BboxOrder = "xyxy";

/** Bbox normalizada `[x1, y1, x2, y2]` em `[0,1]` relativa a imagem original. */
export type BboxNormalized = [number, number, number, number];

/** Bbox em pixels da imagem original `[x1, y1, x2, y2]` (auxiliar). */
export type BboxPixels = [number, number, number, number];

export interface ModelInfo {
  version: string;
  runtime: string;
  threshold: number;
  nms_iou: number;
}

/**
 * Recorte aplicado antes da inferencia (remove cabecalho/rodape/insets de "quadro de laudo").
 * As bboxes continuam relativas a imagem ENVIADA (o recorte e desfeito no backend).
 */
export interface CropInfo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  original_format: string;
  sha256: string;
  bytes: number;
  crop: CropInfo | null;
}

export interface Summary {
  total: number;
  by_class: Record<string, number>;
  max_urgency: Urgency;
  /** Deteccoes descartadas pelo filtro de material radiopaco (0 quando desligado). */
  suppressed: number;
}

export interface Finding {
  finding_id: string;
  class_id: number;
  class_name: string;
  label_pt: string;
  confidence: number;
  urgency: Urgency;
  conduct: string;
  bbox_order: BboxOrder;
  bbox_normalized: BboxNormalized;
  bbox_pixels: BboxPixels;
}

/** Resposta 200 de `POST /api/v1/analyze`. */
export interface AnalysisResponse {
  analysis_id: string;
  request_id: string;
  disclaimer: string;
  model: ModelInfo;
  inference_ms: number;
  image: ImageInfo;
  summary: Summary;
  findings: Finding[];
  /** `true` quando a analise foi persistida no historico (havia token valido). */
  persisted: boolean;
  /** Id do registro no historico; `null` em uso anonimo. */
  record_id: RecordId | null;
}

// --- Etapa 4: autenticacao, pacientes e historico -------------------------

/** Identificador inteiro de um registro de analise no historico. */
export type RecordId = number;

/** Usuario autenticado (`GET /auth/me`, resposta de login/refresh). */
export interface User {
  id: number;
  name: string;
  email: string;
  cro_number: string;
  cro_state: string;
}

/** Corpo 200 de `POST /auth/login` e `POST /auth/refresh`. */
export interface AuthTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user: User;
}

/** Referencia minima de paciente embutida no registro de analise. */
export interface PatientRef {
  id: number;
  name: string;
}

/** Paciente do usuario (`GET/POST /patients`). Apenas nome e notas (LGPD). */
export interface Patient extends PatientRef {
  notes?: string | null;
  created_at?: string;
}

/** Corpo de `POST /auth/register`. */
export interface RegisterInput {
  name: string;
  email: string;
  cro_number: string;
  cro_state: string;
  password: string;
}

/** Corpo de `POST /auth/login`. */
export interface LoginInput {
  email: string;
  password: string;
}

/** Metadados de imagem guardados no historico (a imagem NAO e armazenada). */
export interface RecordImageInfo {
  width: number;
  height: number;
  format: string;
  sha256: string;
}

/** Resumo persistido; mesmo formato do `/analyze`, sem `suppressed` garantido. */
export interface RecordSummary {
  total: number;
  by_class: Record<string, number>;
  max_urgency: Urgency;
  suppressed?: number;
}

/** Item do plano de tratamento persistido no historico. */
export interface PlanItem {
  id?: string;
  finding_id?: string | null;
  title: string;
  detail?: string;
  urgency?: Urgency | string;
  confidence?: number | null;
  included?: boolean;
  note?: string;
  custom?: boolean;
}

/** Item da lista `GET /analyses` (sem `findings`/`plan`). */
export interface AnalysisRecordSummary {
  record_id: RecordId;
  analysis_id: string;
  created_at: string;
  patient: PatientRef | null;
  image: RecordImageInfo;
  crop: CropInfo | null;
  model: ModelInfo;
  summary: RecordSummary;
  notes: string | null;
}

/** Detalhe `GET /analyses/{id}` (com `findings` e `plan`). */
export interface AnalysisRecordDetail extends AnalysisRecordSummary {
  findings: Finding[];
  plan: PlanItem[] | null;
}

/** Uniao resumo/detalhe conforme o endpoint consultado. */
export type AnalysisRecord = AnalysisRecordSummary | AnalysisRecordDetail;

/** Corpo de `PUT /analyses/{id}`. */
export interface UpdateAnalysisInput {
  patient_id?: number | null;
  notes?: string;
  plan?: PlanItem[];
}

/** Envelope unico de erro: `{ "error": { code, message, request_id } }`. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}
