import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPanel from "@/components/AuthPanel";
import { clearSession } from "@/lib/auth";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function errorBody(code: string, message: string) {
  return { error: { code, message, request_id: "req-auth" } };
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

describe("AuthPanel", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearSession();
    window.localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("valida e-mail e senha no cliente antes de chamar a API", async () => {
    const user = userEvent.setup();
    render(<AuthPanel />);

    await user.type(screen.getByLabelText("E-mail"), "invalido");
    await user.type(screen.getByLabelText("Senha"), "123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(
      screen.getByText("A senha deve ter pelo menos 8 caracteres."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("valida CRO (apenas dígitos) e UF (2 letras) no cadastro", async () => {
    const user = userEvent.setup();
    render(<AuthPanel />);

    await user.click(screen.getByRole("tab", { name: "Criar conta" }));
    await user.type(screen.getByLabelText("Nome"), "Dra. Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@clinica.com");
    await user.type(screen.getByLabelText("Senha"), "segredo123");
    await user.type(screen.getByLabelText("CRO (nº)"), "12a");
    await user.type(screen.getByLabelText("UF"), "S");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(
      await screen.findByText("O CRO deve conter apenas números."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A UF deve ter 2 letras (ex.: SP)."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exibe a mensagem do envelope de erro ao falhar o login", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(errorBody("UNAUTHENTICATED", "E-mail ou senha inválidos."), 401),
    );
    const user = userEvent.setup();
    render(<AuthPanel />);

    await user.type(screen.getByLabelText("E-mail"), "ana@clinica.com");
    await user.type(screen.getByLabelText("Senha"), "segredo123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("E-mail ou senha inválidos.")).toBeInTheDocument();
  });

  it("avisa sobre muitas tentativas quando recebe 429", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(errorBody("RATE_LIMITED", "Excesso de tentativas de login."), 429),
    );
    const user = userEvent.setup();
    render(<AuthPanel />);

    await user.type(screen.getByLabelText("E-mail"), "ana@clinica.com");
    await user.type(screen.getByLabelText("Senha"), "segredo123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText(/Muitas tentativas de acesso/),
    ).toBeInTheDocument();
  });

  it("mostra o usuário e o botão Sair após autenticar", async () => {
    fetchMock.mockResolvedValue(jsonResponse(tokens));
    const user = userEvent.setup();
    render(<AuthPanel />);

    await user.type(screen.getByLabelText("E-mail"), "ana@clinica.com");
    await user.type(screen.getByLabelText("Senha"), "segredo123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Dra. Ana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });
});
