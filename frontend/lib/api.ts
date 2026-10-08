import { ApiError, isApiErrorBody } from "@/lib/errors";
import { API_PREFIX, apiFetch } from "@/lib/http";
import type { AnalysisResponse } from "@/lib/types";

/**
 * Cliente HTTP do OdontoScan AI.
 * Contrato: `docs/api-contract.md` (v1) — `POST /api/v1/analyze`, multipart campo `image`.
 */

export { ApiError } from "@/lib/errors";
export { API_URL } from "@/lib/http";

export const ANALYZE_ENDPOINT = `${API_PREFIX}/analyze`;

/** Limite de upload alinhado ao default de `MAX_UPLOAD_MB` do backend. */
export const MAX_UPLOAD_MB = 15;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/dicom",
  "image/dicom",
]);

const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".dcm", ".dicom"];

/** Tipos que o navegador consegue renderizar em `<img>` (DICOM nao). */
const BROWSER_PREVIEWABLE_MIME = new Set<string>(["image/png", "image/jpeg", "image/jpg"]);

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface FileValidationResult {
  ok: boolean;
  message?: string;
}

/** Validacao client-side (formato + tamanho) ANTES de chamar a API. */
export function validateImageFile(file: File): FileValidationResult {
  const typeIsKnown = file.type !== "" && ALLOWED_MIME_TYPES.has(file.type);
  const extIsKnown = hasAllowedExtension(file.name);

  if (!typeIsKnown && !extIsKnown) {
    return {
      ok: false,
      message: "Formato não suportado. Envie um arquivo PNG, JPEG ou DICOM.",
    };
  }

  if (file.size <= 0) {
    return { ok: false, message: "O arquivo está vazio ou corrompido." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      message: `Arquivo muito grande (${sizeMb} MB). O limite é ${MAX_UPLOAD_MB} MB.`,
    };
  }

  return { ok: true };
}

/** DICOM nao e renderizavel por `<img>` no navegador (limitacao conhecida da Etapa 1). */
export function isBrowserPreviewable(file: File): boolean {
  if (BROWSER_PREVIEWABLE_MIME.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return [".png", ".jpg", ".jpeg"].some((ext) => lower.endsWith(ext));
}

const NETWORK_ERROR_MESSAGE =
  "Não foi possível conectar ao servidor de análise. Verifique se o backend está em execução e tente novamente.";

const FALLBACK_ERROR_MESSAGE = "Falha inesperada ao analisar a radiografia. Tente novamente.";

/**
 * Envia a radiografia para analise.
 *
 * Passa pelo cliente autenticado: se houver sessao, o backend **persiste** a
 * analise e devolve `persisted: true` + `record_id`; anonimo, segue igual ao
 * fluxo da Etapa 1. O `patient_id` (opcional) vincula a analise a um paciente.
 *
 * Lanca `ApiError` com a mensagem do servidor (ou mensagem de rede amigavel).
 */
export async function analyzeRadiograph(
  file: File,
  signal?: AbortSignal,
  patientId?: number | null,
): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("image", file, file.name);
  if (patientId != null) formData.append("patient_id", String(patientId));

  let response: Response;
  try {
    response = await apiFetch(ANALYZE_ENDPOINT, {
      method: "POST",
      body: formData,
      signal,
      // NAO definir Content-Type: o browser adiciona o boundary do multipart.
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(NETWORK_ERROR_MESSAGE, { code: "NETWORK_ERROR", status: 0 });
  }

  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = FALLBACK_ERROR_MESSAGE;
    let requestId: string | null = null;

    try {
      const body: unknown = await response.json();
      if (isApiErrorBody(body)) {
        code = body.error.code;
        message = body.error.message;
        requestId = body.error.request_id ?? null;
      }
    } catch {
      // Resposta sem JSON valido: mantem o fallback amigavel.
    }

    throw new ApiError(message, { code, requestId, status: response.status });
  }

  return (await response.json()) as AnalysisResponse;
}
