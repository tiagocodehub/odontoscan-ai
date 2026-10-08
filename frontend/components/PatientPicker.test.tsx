import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PatientPicker from "@/components/PatientPicker";
import { clearSession, login } from "@/lib/auth";
import type { Patient } from "@/lib/types";

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

function installHandler(patients: Patient[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/auth/")) return Promise.resolve(jsonResponse(tokens));
    if (url.includes("/patients") && method === "GET") {
      return Promise.resolve(jsonResponse([...patients]));
    }
    if (url.includes("/patients") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { name: string; notes?: string };
      const created: Patient = {
        id: 99,
        name: body.name,
        notes: body.notes ?? null,
      };
      patients.push(created);
      return Promise.resolve(jsonResponse(created, 201));
    }
    return Promise.resolve(jsonResponse({}, 200));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function authenticate(): Promise<void> {
  await login("ana@clinica.com", "segredo123");
}

describe("PatientPicker", () => {
  beforeEach(() => {
    clearSession();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lista pacientes e seleciona ao clicar", async () => {
    installHandler([
      { id: 1, name: "Maria S.", notes: null },
      { id: 2, name: "João P.", notes: "Retorno" },
    ]);
    await authenticate();

    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<PatientPicker selectedPatientId={null} onSelect={onSelect} />);

    const maria = await screen.findByRole("button", { name: "Maria S." });
    await user.click(maria);

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("cria um paciente e o seleciona", async () => {
    const patients: Patient[] = [];
    const fetchMock = installHandler(patients);
    await authenticate();

    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<PatientPicker selectedPatientId={null} onSelect={onSelect} />);

    await user.type(screen.getByLabelText("Nome do paciente"), "Maria S.");
    await user.click(screen.getByRole("button", { name: "Adicionar paciente" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(99));
    expect(await screen.findByRole("button", { name: "Maria S." })).toBeInTheDocument();

    const createCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/patients") && call[1]?.method === "POST",
    );
    expect(createCall).toBeDefined();
  });

  it("mostra estado vazio quando não há pacientes", async () => {
    installHandler([]);
    await authenticate();

    render(<PatientPicker selectedPatientId={null} onSelect={vi.fn()} />);

    expect(
      await screen.findByText("Nenhum paciente cadastrado ainda."),
    ).toBeInTheDocument();
  });

  it("exige sessão autenticada", () => {
    render(<PatientPicker selectedPatientId={null} onSelect={vi.fn()} />);

    expect(
      screen.getByText(/Entre na sua conta para cadastrar/),
    ).toBeInTheDocument();
  });
});
