import { ApiError } from "@/lib/errors";
import { configureAuth, jsonInit, requestJson } from "@/lib/http";
import type { AuthTokens, RegisterInput, User } from "@/lib/types";

/**
 * Sessao do OdontoScan AI (Etapa 4).
 *
 * - **Access token em memoria** (`accessToken`): nunca vai para o storage.
 * - **Refresh token em `localStorage`** sob chave versionada: limitacao
 *   consciente e documentada (ADR-0007) — exposto a XSS. Todo o acesso ao
 *   storage fica centralizado aqui.
 * - `lib/http.ts` injeta o access token e renova em 401 chamando `refresh`.
 *
 * Sem Redux/Zustand: store externo minimo consumido por `useSyncExternalStore`.
 */

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: ApiError | null;
}

/** Chave versionada do refresh token no `localStorage`. */
export const REFRESH_TOKEN_STORAGE_KEY = "odontoscan.refresh.v1";

const ANONYMOUS_STATE: AuthState = {
  status: "anonymous",
  user: null,
  error: null,
};

let state: AuthState = { status: "loading", user: null, error: null };
let accessToken: string | null = null;
let bootstrapPromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: AuthState): void {
  state = next;
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthState(): AuthState {
  return state;
}

/** Access token em memoria (usado pelo cliente HTTP). */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Le o refresh token persistido, se houver (guarda para SSR/privacidade). */
export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // Storage indisponivel (ex.: modo privado): sessao segue apenas em memoria.
  }
}

function applyTokens(tokens: AuthTokens): void {
  accessToken = tokens.access_token;
  persistRefreshToken(tokens.refresh_token);
  setState({ status: "authenticated", user: tokens.user, error: null });
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("Falha inesperada. Tente novamente.", {
    code: "UNKNOWN",
    status: 0,
  });
}

/** Limpa access (memoria) + refresh (storage) e volta ao estado anonimo. */
export function clearSession(): void {
  accessToken = null;
  persistRefreshToken(null);
  bootstrapPromise = null;
  setState(ANONYMOUS_STATE);
}

/** Autentica e guarda o par de tokens + usuario. Lanca `ApiError` em falha. */
export async function login(email: string, password: string): Promise<User> {
  try {
    const tokens = await requestJson<AuthTokens>(
      "/auth/login",
      jsonInit("POST", { email, password }),
    );
    applyTokens(tokens);
    return tokens.user;
  } catch (error) {
    const apiError = toApiError(error);
    setState({ status: "anonymous", user: null, error: apiError });
    throw apiError;
  }
}

/**
 * Cria a conta (`POST /auth/register`) e, em seguida, autentica com as mesmas
 * credenciais (o registro devolve apenas o usuario; os tokens vem do login).
 */
export async function register(input: RegisterInput): Promise<User> {
  try {
    await requestJson<User>("/auth/register", jsonInit("POST", input));
  } catch (error) {
    const apiError = toApiError(error);
    setState({ status: "anonymous", user: null, error: apiError });
    throw apiError;
  }
  return login(input.email, input.password);
}

/** Rotaciona o par de tokens. Em falha, limpa a sessao e retorna `false`. */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;

  try {
    const tokens = await requestJson<AuthTokens>(
      "/auth/refresh",
      jsonInit("POST", { refresh_token: refreshToken }),
    );
    applyTokens(tokens);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

/** Revoga o refresh token no servidor e limpa o estado local (sempre). */
export async function logout(): Promise<void> {
  const refreshToken = getStoredRefreshToken();
  try {
    if (refreshToken) {
      await requestJson<void>(
        "/auth/logout",
        jsonInit("POST", { refresh_token: refreshToken }),
      );
    }
  } catch {
    // Falha no servidor nao impede o encerramento local da sessao.
  } finally {
    clearSession();
  }
}

/**
 * Restaura a sessao no boot: se houver refresh token, tenta renovar
 * automaticamente. Idempotente por carga de pagina (uma unica tentativa).
 */
export function restoreSession(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    if (!getStoredRefreshToken()) {
      setState(ANONYMOUS_STATE);
      return;
    }
    const refreshed = await refreshAccessToken();
    if (!refreshed) clearSession();
  })();

  return bootstrapPromise;
}

configureAuth({
  getAccessToken,
  refresh: refreshAccessToken,
  onUnauthorized: clearSession,
});
