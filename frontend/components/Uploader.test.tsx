import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Uploader from "@/components/Uploader";

type UploaderProps = ComponentProps<typeof Uploader>;

function renderUploader(overrides: Partial<UploaderProps> = {}) {
  const props: UploaderProps = {
    file: null,
    previewUrl: null,
    status: "idle",
    onSelect: vi.fn(),
    onClear: vi.fn(),
    onAnalyze: vi.fn(),
    serverError: null,
    ...overrides,
  };

  render(<Uploader {...props} />);
  return props;
}

function getFileInput(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(/Arraste a radiografia/);
}

describe("Uploader", () => {
  it("rejeita arquivo inválido com a mensagem client-side e NÃO chama a API", async () => {
    // `applyAccept: false` força o envio mesmo fora do `accept` do input,
    // para exercitar a validação client-side de `validateImageFile`.
    const user = userEvent.setup({ applyAccept: false });
    const { onSelect } = renderUploader();

    const invalido = new File(["conteudo"], "notas.txt", { type: "text/plain" });
    await user.upload(getFileInput(), invalido);

    expect(onSelect).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Formato não suportado. Envie um arquivo PNG, JPEG ou DICOM.",
    );
  });

  it("rejeita arquivo acima de 15 MB sem chamar a API", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onSelect } = renderUploader();

    const grande = new File(["conteudo"], "grande.png", { type: "image/png" });
    Object.defineProperty(grande, "size", { value: 16 * 1024 * 1024 });

    await user.upload(getFileInput(), grande);

    expect(onSelect).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Arquivo muito grande/);
  });

  it("aceita arquivo PNG válido e chama onSelect", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onSelect } = renderUploader();

    const valido = new File(["radiografia"], "scan.png", { type: "image/png" });
    await user.upload(getFileInput(), valido);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(valido);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("exibe o erro do servidor e mantém o botão de análise desabilitado sem arquivo", () => {
    renderUploader({ serverError: "Falha do servidor ao analisar." });

    expect(screen.getByRole("alert")).toHaveTextContent("Falha do servidor ao analisar.");
    expect(screen.getByRole("button", { name: /Analisar radiografia/ })).toBeDisabled();
  });

  it("mostra estado de upload com botão ocupado e desabilitado", () => {
    const arquivo = new File(["radiografia"], "scan.png", { type: "image/png" });
    renderUploader({ file: arquivo, status: "uploading" });

    const botao = screen.getByRole("button", { name: /Analisando/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("aria-busy", "true");
  });
});
