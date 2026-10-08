import { ApiError, isApiErrorBody } from "@/lib/errors";

/**
 * Cliente HTTP autenticado do OdontoScan AI.
 *
 * Todo o trafego autenticado passa por aqui: injeta `Authorization: Bearer
 * <access>` e, em caso de **401**, tenta **um unico** refresh antes de repetir a
 * chamada. Se o refresh falhar, o adaptador de sessao e notificado (logout).
 *
 * O modulo NAO conhece `lib/auth.ts` diretamente: a sessao e ligada via
 * `configureAuth`, evitando dependencia circular. Sem adaptador, o cliente
 * opera de forma anonima (ex.: `/analyze`).
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://localhost:8000";

/** Prefixo versionado do contrato: `docs/api-contract.md` (v1). */
export const API_PREFIX = `${API_URL}/api/v1`;

export interface AuthAdapter {
  /** Access token atual (em memoria) ou `null` se anonimo. */
  getAccessToken: () => string | null;
  /** Rotaciona o par de tokens; `true` se obteve um novo access token. */
  refresh: () => Promise<boolean>;
  /** Chamado quando a sessao nao pode ser renovada (limpar estado). */
  onUnauthorized: () => void;
}

let authAdapter: AuthAdapter | null = null;

/** Liga/desliga o provedor de sessao (chamado por `lib/auth.ts`). */
export function configureAuth(adapter: AuthAdapter | null): void {
  authAdapter = adapter;
}

function resolveUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  return `${API_PREFIX}${input.startsWith("/") ? input : `/${input}`}`;
}

/** Rotas de auth: um 401 nelas NUNCA dispara refresh (evita loop). */
function isAuthEndpoint(url: string): boolean {
  return url.includes("/auth/");
}

function performFetch(url: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const token = authAdapter?.getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

/**
 * Executa um `fetch` autenticado. Em 401 de rota protegida, tenta um refresh e
 * repete a chamada uma unica vez. Retorna o `Response` cru (o parsing e do
 * chamador), preservando `AbortError` e erros de rede.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = resolveUrl(input);
  const response = await performFetch(url, init);

  if (response.status !== 401 || authAdapter === null || isAuthEndpoint(url)) {
    return response;
  }

  const refreshed = await authAdapter.refresh();
  if (!refreshed) {
    authAdapter.onUnauthorized();
    return response;
  }

  return performFetch(url, init);
}

const NETWORK_ERROR_MESSAGE =
  "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";

const FALLBACK_ERROR_MESSAGE =
  "Não foi possível concluir a operação. Tente novamente.";

async function parseJson<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

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

  return (await response.json()) as T;
}

/**
 * Executa uma requisicao JSON autenticada e devolve o corpo tipado.
 * Converte falhas de rede em `ApiError` `NETWORK_ERROR` (status 0).
 */
export async function requestJson<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(NETWORK_ERROR_MESSAGE, { code: "NETWORK_ERROR", status: 0 });
  }
  return parseJson<T>(response);
}

/** Helper de `RequestInit` para corpos JSON (define o `Content-Type`). */
export function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
