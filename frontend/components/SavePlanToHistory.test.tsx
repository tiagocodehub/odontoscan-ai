import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SavePlanToHistory from "@/components/SavePlanToHistory";
import { clearSession, login } from "@/lib/auth";
import type { TreatmentPlanItem } from "@/lib/treatment-plan";

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

const plan: TreatmentPlanItem[] = [
  {
    id: "finding-f1",
    finding_id: "f1",
    title: "Avaliar endodontia",
    detail: "Conduta.",
    urgency: "urgente",
    confidence: 0.83,
    included: true,
    note: "",
    custom: false,
  },
];

describe("SavePlanToHistory", () => {
  beforeEach(() => {
    clearSession();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("não renderiza sem registro persistido", () => {
    render(<SavePlanToHistory recordId={null} patientId={null} plan={plan} />);

    expect(
      screen.queryByRole("button", { name: "Salvar no histórico" }),
    ).not.toBeInTheDocument();
  });

  it("envia patient_id, notes e plan via PUT e confirma o salvamento", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/")) return Promise.resolve(jsonResponse(tokens));
      if (url.includes("/analyses/12") && init?.method === "PUT") {
        return Promise.resolve(jsonResponse({ record_id: 12 }));
      }
      return Promise.resolve(jsonResponse({}, 200));
    });
    vi.stubGlobal("fetch", fetchMock);
    await login("ana@clinica.com", "segredo123");

    const user = userEvent.setup();
    render(<SavePlanToHistory recordId={12} patientId={3} plan={plan} />);

    await user.type(
      screen.getByLabelText("Observações do dentista (opcional)"),
      "Reavaliar em 30 dias",
    );
    await user.click(screen.getByRole("button", { name: "Salvar no histórico" }));

    expect(await screen.findByText("Plano salvo no histórico.")).toBeInTheDocument();

    const putCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/analyses/12") && call[1]?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(String(putCall?.[1]?.body)) as {
      patient_id: number;
      notes: string;
      plan: { title: string }[];
    };
    expect(body.patient_id).toBe(3);
    expect(body.notes).toBe("Reavaliar em 30 dias");
    expect(body.plan[0]?.title).toBe("Avaliar endodontia");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
