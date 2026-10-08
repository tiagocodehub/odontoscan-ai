import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYZE_ENDPOINT,
  ApiError,
  analyzeRadiograph,
  isBrowserPreviewable,
  validateImageFile,
} from "@/lib/api";
import { makeAnalysisResponse } from "@/lib/__fixtures__/analysis";

/** Resposta fake: a API só usa `ok`, `status` e `json()`. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function makeFile(name: string, type = "", contents: BlobPart[] = ["conteudo"]): File {
  return new File(contents, name, { type });
}

/** Sobrescreve o tamanho (read-only) para simular arquivos grandes sem alocar 15 MB. */
function withSize(file: File, bytes: number): File {
  Object.defineProperty(file, "size", { value: bytes, configurable: true });
  return file;
}

describe("validateImageFile", () => {
  it("aceita PNG/JPEG/DICOM pelo MIME", () => {
    expect(validateImageFile(makeFile("scan.png", "image/png"))).toEqual({ ok: true });
    expect(validateImageFile(makeFile("scan.jpg", "image/jpeg"))).toEqual({ ok: true });
    expect(validateImageFile(makeFile("scan.dcm", "application/dicom"))).toEqual({
      ok: true,
    });
  });

  it("aceita pela extensão quando o navegador não informa o MIME", () => {
    expect(validateImageFile(makeFile("scan.jpeg"))).toEqual({ ok: true });
    expect(validateImageFile(makeFile("scan.DICOM"))).toEqual({ ok: true });
  });

  it("rejeita tipo não suportado com mensagem PT-BR", () => {
    const result = validateImageFile(makeFile("relatorio.pdf", "application/pdf"));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Formato não suportado/);
  });

  it("rejeita arquivo sem MIME e sem extensão conhecida", () => {
    expect(validateImageFile(makeFile("malware.exe", "")).ok).toBe(false);
  });

  it("rejeita arquivo vazio/corrompido", () => {
    const result = validateImageFile(makeFile("vazio.png", "image/png", []));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/vazio ou corrompido/);
  });

  it("rejeita arquivo acima de 15 MB e reporta o tamanho", () => {
    const oversized = withSize(makeFile("grande.png", "image/png"), 15 * 1024 * 1024 + 1);
    const result = validateImageFile(oversized);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Arquivo muito grande/);
    expect(result.message).toMatch(/15 MB/);
  });

  it("aceita arquivo exatamente no limite de 15 MB", () => {
    const atLimit = withSize(makeFile("limite.png", "image/png"), 15 * 1024 * 1024);
    expect(validateImageFile(atLimit)).toEqual({ ok: true });
  });
});

describe("isBrowserPreviewable", () => {
  it("considera PNG/JPEG pré-visualizáveis e DICOM não", () => {
    expect(isBrowserPreviewable(makeFile("a.png", "image/png"))).toBe(true);
    expect(isBrowserPreviewable(makeFile("b.jpg", "image/jpeg"))).toBe(true);
    expect(isBrowserPreviewable(makeFile("c.dcm", "application/dicom"))).toBe(false);
  });
});

describe("analyzeRadiograph", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna o payload em 200 e envia multipart para o endpoint do contrato", async () => {
    const payload = makeAnalysisResponse();
    fetchMock.mockResolvedValue(jsonResponse(payload, 200));

    const file = makeFile("scan.png", "image/png");
    const result = await analyzeRadiograph(file);

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(call?.[0]).toBe(ANALYZE_ENDPOINT);
    expect(call?.[1]?.method).toBe("POST");
    expect(call?.[1]?.body).toBeInstanceOf(FormData);
  });

  it("lança ApiError com code/message/status do envelope em 415", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "Formato não suportado. Envie PNG, JPEG ou DICOM.",
            request_id: "req-415",
          },
        },
        415,
      ),
    );

    let caught: unknown;
    try {
      await analyzeRadiograph(makeFile("scan.gif", "image/gif"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiError = caught as ApiError;
    expect(apiError.name).toBe("ApiError");
    expect(apiError.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(apiError.message).toBe("Formato não suportado. Envie PNG, JPEG ou DICOM.");
    expect(apiError.status).toBe(415);
    expect(apiError.requestId).toBe("req-415");
  });

  it("converte falha de rede em ApiError NETWORK_ERROR (status 0)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    let caught: unknown;
    try {
      await analyzeRadiograph(makeFile("scan.png", "image/png"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiError = caught as ApiError;
    expect(apiError.code).toBe("NETWORK_ERROR");
    expect(apiError.status).toBe(0);
    expect(apiError.message).toMatch(/Não foi possível conectar/);
  });

  it("propaga AbortError sem embrulhar em ApiError", async () => {
    // `AbortController.abort()` rejeita o fetch com um DOMException "AbortError".
    const abortError = new DOMException("Aborted", "AbortError");
    fetchMock.mockRejectedValue(abortError);

    let caught: unknown;
    try {
      await analyzeRadiograph(makeFile("scan.png", "image/png"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(abortError);
    expect(caught).not.toBeInstanceOf(ApiError);
  });

  it("usa fallback amigável quando o corpo de erro não é JSON válido", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    } as unknown as Response);

    let caught: unknown;
    try {
      await analyzeRadiograph(makeFile("scan.png", "image/png"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiError = caught as ApiError;
    expect(apiError.code).toBe("HTTP_500");
    expect(apiError.status).toBe(500);
    expect(apiError.message).toMatch(/Falha inesperada/);
  });
});
