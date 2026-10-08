import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { makeAnalysisResponse } from "@/lib/__fixtures__/analysis";
import { useAnalysis } from "@/lib/useAnalysis";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function makeFile(): File {
  return new File(["radiografia"], "scan.png", { type: "image/png" });
}

describe("useAnalysis", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("transiciona idle -> uploading -> done e popula o resultado", async () => {
    const payload = makeAnalysisResponse();
    let resolveFetch: ((value: Response) => void) | null = null;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { result } = renderHook(() => useAnalysis());
    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.analyze(makeFile());
    });

    // Estado intermediário observável enquanto o fetch está pendente.
    expect(result.current.status).toBe("uploading");

    await act(async () => {
      resolveFetch?.(jsonResponse(payload, 200));
      await pending;
    });

    expect(result.current.status).toBe("done");
    expect(result.current.result).toEqual(payload);
    expect(result.current.error).toBeNull();
  });

  it("transiciona idle -> uploading -> error com erro do envelope", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "Formato não suportado. Envie PNG, JPEG ou DICOM.",
            request_id: "req-err",
          },
        },
        415,
      ),
    );

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.analyze(makeFile());
    });

    expect(result.current.status).toBe("error");
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(result.current.error?.status).toBe(415);
    expect(result.current.error?.message).toBe(
      "Formato não suportado. Envie PNG, JPEG ou DICOM.",
    );
  });

  it("reset volta ao estado inicial e limpa resultado/erro", async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeAnalysisResponse(), 200));

    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.analyze(makeFile());
    });
    expect(result.current.status).toBe("done");
    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
