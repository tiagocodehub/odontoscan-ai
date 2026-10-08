import type { ApiErrorBody } from "@/lib/types";

/**
 * Erro tipado da API OdontoScan.
 *
 * Carrega a `message` em PT-BR vinda do envelope `{ error: { code, message,
 * request_id } }` para exibicao direta ao usuario, alem de `code`, `status` e
 * `request_id` (os dois ultimos uteis para diagnostico na UI).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string | null;
  readonly status: number;

  constructor(
    message: string,
    options: { code: string; requestId?: string | null; status: number },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = options.code;
    this.requestId = options.requestId ?? null;
    this.status = options.status;
  }
}

/** Type guard do envelope de erro unico do contrato. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const candidate = (value as { error?: unknown }).error;
  if (typeof candidate !== "object" || candidate === null) return false;
  const { code, message } = candidate as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}
