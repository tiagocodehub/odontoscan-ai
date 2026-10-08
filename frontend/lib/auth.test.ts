import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes da sessao (Etapa 4). Cada caso recarrega `@/lib/auth` e `@/lib/records`
 * via `import()` dinamico apos `vi.resetModules()`, pois o store guarda estado
 * de modulo (access token em memoria + assinantes).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const REFRESH_KEY = "odontoscan.refresh.v1";

function tokens(access: string, refresh: string, name = "Dra. Ana") {
  return {
    access_token: access,
    token_type: "bearer",
    expires_in: 900,
    refresh_token: refresh,
    user: {
      id: 1,
      name,
      email: "ana@clinica.com",
      cro_number: "12345",
      cro_state: "SP",
    },
  };
}

function errorBody(code: string, message: string, requestId = "req-1") {
  return { error: { code, message, request_id: requestId } };
}

describe("auth", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login guarda access em memoria, refresh no storage e usuario no estado", async () => {
    fetchMock.mockResolvedValue(jsonResponse(tokens("acc-1", "ref-1")));
    const auth = await import("@/lib/auth");

    const user = await auth.login("ana@clinica.com", "segredo123");

    expect(user.name).toBe("Dra. Ana");
    expect(auth.getAccessToken()).toBe("acc-1");
    expect(window.localStorage.getItem(REFRESH_KEY)).toBe("ref-1");
    // Apenas o refresh vai ao storage (access fica em memoria).
    expect(window.localStorage.length).toBe(1);
    expect(auth.getAuthState().status).toBe("authenticated");
    expect(auth.getAuthState().user?.email).toBe("ana@clinica.com");
  });

  it("logout chama o servidor e limpa tokens e estado", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(tokens("acc-1", "ref-1")))
      .mockResolvedValueOnce(jsonResponse(undefined, 204));
    const auth = await import("@/lib/auth");

    await auth.login("ana@clinica.com", "segredo123");
    await auth.logout();

    expect(auth.getAccessToken()).toBeNull();
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(auth.getAuthState().status).toBe("anonymous");
    expect(auth.getAuthState().user).toBeNull();

    const logoutCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/auth/logout"),
    );
    expect(logoutCall).toBeDefined();
  });

  it("restaura a sessao no boot renovando o refresh persistido", async () => {
    window.localStorage.setItem(REFRESH_KEY, "stored-refresh");
    fetchMock.mockResolvedValue(jsonResponse(tokens("acc-boot", "ref-boot")));
    const auth = await import("@/lib/auth");

    await auth.restoreSession();

    expect(auth.getAccessToken()).toBe("acc-boot");
    expect(window.localStorage.getItem(REFRESH_KEY)).toBe("ref-boot");
    expect(auth.getAuthState().status).toBe("authenticated");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sem refresh persistido, o boot fica anonimo sem chamar a rede", async () => {
    const auth = await import("@/lib/auth");

    await auth.restoreSession();

    expect(auth.getAuthState().status).toBe("anonymous");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("em 401, tenta o refresh uma unica vez e repete a chamada", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/auth/login")) {
        return Promise.resolve(jsonResponse(tokens("acc-1", "ref-1")));
      }
      if (url.includes("/auth/refresh")) {
        return Promise.resolve(jsonResponse(tokens("acc-2", "ref-2")));
      }
      if (url.includes("/analyses") && method === "GET") {
        const authHeader = new Headers(init?.headers).get("Authorization");
        if (authHeader === "Bearer acc-2") {
          return Promise.resolve(
            jsonResponse([
              {
                record_id: 7,
                analysis_id: "a",
                created_at: "2026-09-25T14:03:00Z",
                patient: null,
                image: { width: 1, height: 1, format: "png", sha256: "x" },
                crop: null,
                model: { version: "1", runtime: "stub", threshold: 0.4, nms_iou: 0.45 },
                summary: { total: 0, by_class: {}, max_urgency: "informativa" },
                notes: null,
              },
            ]),
          );
        }
        return Promise.resolve(
          jsonResponse(errorBody("UNAUTHENTICATED", "Token expirado."), 401),
        );
      }
      return Promise.resolve(jsonResponse({}, 200));
    });

    const auth = await import("@/lib/auth");
    const records = await import("@/lib/records");

    await auth.login("ana@clinica.com", "segredo123");
    const list = await records.listAnalyses();

    expect(list).toHaveLength(1);
    expect(auth.getAccessToken()).toBe("acc-2");
    expect(window.localStorage.getItem(REFRESH_KEY)).toBe("ref-2");

    const analysesCalls = fetchMock.mock.calls.filter(
      (call) => String(call[0]).includes("/analyses"),
    );
    expect(analysesCalls).toHaveLength(2);
  });

  it("se o refresh falhar em 401, limpa a sessao e propaga o erro", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/login")) {
        return Promise.resolve(jsonResponse(tokens("acc-1", "ref-1")));
      }
      if (url.includes("/auth/refresh")) {
        return Promise.resolve(
          jsonResponse(errorBody("UNAUTHENTICATED", "Refresh inválido."), 401),
        );
      }
      if (url.includes("/analyses")) {
        return Promise.resolve(
          jsonResponse(errorBody("UNAUTHENTICATED", "Token expirado."), 401),
        );
      }
      return Promise.resolve(jsonResponse({}, 200));
    });

    const auth = await import("@/lib/auth");
    const records = await import("@/lib/records");
    const { ApiError } = await import("@/lib/errors");

    await auth.login("ana@clinica.com", "segredo123");

    let caught: unknown;
    try {
      await records.listAnalyses();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(auth.getAccessToken()).toBeNull();
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(auth.getAuthState().status).toBe("anonymous");
  });

  it("register cria a conta e autentica em seguida", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(tokens("ignored", "ignored", "Dra. Nova"), 201),
      )
      .mockResolvedValueOnce(jsonResponse(tokens("acc-new", "ref-new", "Dra. Nova")));
    const auth = await import("@/lib/auth");

    await auth.register({
      name: "Dra. Nova",
      email: "nova@clinica.com",
      cro_number: "54321",
      cro_state: "RJ",
      password: "segredo123",
    });

    expect(auth.getAccessToken()).toBe("acc-new");
    expect(auth.getAuthState().user?.name).toBe("Dra. Nova");
    const registerCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/auth/register"),
    );
    const loginCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/auth/login"),
    );
    expect(registerCall).toBeDefined();
    expect(loginCall).toBeDefined();
  });
});
