import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HistoryPanel from "@/components/HistoryPanel";
import { clearSession, login } from "@/lib/auth";
import type { AnalysisRecordDetail, AnalysisRecordSummary } from "@/lib/types";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const tokens = {
  access_token: "acc-1",
  token_type: "bearer",
  expires_in: 900,
  refresh_token: "ref-1",
  user: {
    id: 1,
    name: "Dra. Ana",
    email: "ana@clinica.com",
    cro_number: "12345",
    cro_state: "SP",
  },
};

function makeSummary(): AnalysisRecordSummary {
  return {
    record_id: 12,
    analysis_id: "0f6c2b1e",
    created_at: "2026-09-25T14:03:00Z",
    patient: { id: 3, name: "Maria S." },
    image: { width: 5000, height: 3880, format: "jpeg", sha256: "b8271e" },
    crop: null,
    model: { version: "8.4.81", runtime: "onnxruntime", threshold: 0.4, nms_iou: 0.45 },
    summary: { total: 1, by_class: { periapical_lesion: 1 }, max_urgency: "urgente" },
    notes: null,
  };
}

function makeDetail(): AnalysisRecordDetail {
  return {
    ...makeSummary(),
    findings: [
      {
        finding_id: "f1",
        class_id: 3,
        class_name: "periapical_lesion",
        label_pt: "Lesão/Infecção Periapical",
        confidence: 0.83,
        urgency: "urgente",
        conduct: "Avaliar tratamento endodôntico.",
        bbox_order: "xyxy",
        bbox_normalized: [0.4, 0.5, 0.5, 0.6],
        bbox_pixels: [1, 2, 3, 4],
      },
    ],
    plan: [
      {
        id: "finding-f1",
        finding_id: "f1",
        title: "Avaliar endodontia",
        detail: "Conduta sugerida.",
        urgency: "urgente",
        confidence: 0.83,
        included: true,
        note: "Reavaliar em 30 dias",
        custom: false,
      },
    ],
  };
}

interface HandlerState {
  records: AnalysisRecordSummary[];
  detail: AnalysisRecordDetail | null;
  deleted: number[];
  lastListUrl: string | null;
}

function installHandler(state: HandlerState): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/auth/")) return Promise.resolve(jsonResponse(tokens));

    if (url.includes("/analyses") && method === "DELETE") {
      const id = Number(url.split("/").pop());
      state.deleted.push(id);
      state.records = state.records.filter((record) => record.record_id !== id);
      return Promise.resolve(jsonResponse(undefined, 204));
    }

    if (url.includes("/analyses/") && method === "GET") {
      return Promise.resolve(jsonResponse(state.detail));
    }

    if (url.includes("/analyses") && method === "GET") {
      state.lastListUrl = url;
      return Promise.resolve(jsonResponse([...state.records]));
    }

    return Promise.resolve(jsonResponse({}, 200));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function authenticate(): Promise<void> {
  await login("ana@clinica.com", "segredo123");
}

describe("HistoryPanel", () => {
  beforeEach(() => {
    clearSession();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mostra histórico vazio", async () => {
    installHandler({ records: [], detail: null, deleted: [], lastListUrl: null });
    await authenticate();

    render(<HistoryPanel patientFilter={null} />);

    expect(
      await screen.findByText("Nenhuma análise salva no histórico."),
    ).toBeInTheDocument();
  });

  it("abre a análise e exibe achados, plano e aviso de imagem", async () => {
    installHandler({
      records: [makeSummary()],
      detail: makeDetail(),
      deleted: [],
      lastListUrl: null,
    });
    await authenticate();

    const user = userEvent.setup();
    render(<HistoryPanel patientFilter={null} />);

    await user.click(await screen.findByRole("button", { name: "Abrir" }));

    expect(
      await screen.findByText("Lesão/Infecção Periapical"),
    ).toBeInTheDocument();
    expect(screen.getByText("Avaliar endodontia")).toBeInTheDocument();
    expect(screen.getByText("Reavaliar em 30 dias")).toBeInTheDocument();
    expect(
      screen.getAllByText(/A imagem não é guardada/).length,
    ).toBeGreaterThan(0);
  });

  it("exclui a análise após confirmação", async () => {
    const state: HandlerState = {
      records: [makeSummary()],
      detail: makeDetail(),
      deleted: [],
      lastListUrl: null,
    };
    installHandler(state);
    await authenticate();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<HistoryPanel patientFilter={null} />);

    await user.click(
      await screen.findByRole("button", { name: /Excluir análise de Maria S\./ }),
    );

    await waitFor(() => expect(state.deleted).toEqual([12]));
    expect(
      await screen.findByText("Nenhuma análise salva no histórico."),
    ).toBeInTheDocument();
  });

  it("envia o filtro por paciente na listagem", async () => {
    const state: HandlerState = {
      records: [makeSummary()],
      detail: makeDetail(),
      deleted: [],
      lastListUrl: null,
    };
    installHandler(state);
    await authenticate();

    render(<HistoryPanel patientFilter={3} />);

    await waitFor(() => expect(state.lastListUrl).not.toBeNull());
    expect(state.lastListUrl).toContain("patient_id=3");
  });

  it("exige sessão autenticada", () => {
    render(<HistoryPanel patientFilter={null} />);

    expect(screen.getByText(/Entre na sua conta para salvar/)).toBeInTheDocument();
  });
});
