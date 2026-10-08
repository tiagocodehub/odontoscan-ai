import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FindingsLegend from "@/components/FindingsLegend";
import { makeFinding } from "@/lib/__fixtures__/analysis";

type LegendProps = ComponentProps<typeof FindingsLegend>;

function renderLegend(overrides: Partial<LegendProps> = {}) {
  const props: LegendProps = {
    findings: [
      makeFinding(),
      makeFinding({
        finding_id: "f2",
        class_id: 1,
        class_name: "caries",
        label_pt: "Cárie",
        confidence: 0.5,
        urgency: "eletiva",
        conduct: "",
        bbox_normalized: [0.1, 0.1, 0.2, 0.2],
        bbox_pixels: [100, 100, 200, 200],
      }),
    ],
    hoveredFindingId: null,
    pinnedFindingId: null,
    onHoverFinding: vi.fn(),
    onTogglePin: vi.fn(),
    ...overrides,
  };

  render(<FindingsLegend {...props} />);
  return props;
}

describe("FindingsLegend", () => {
  it("renderiza label, confiança formatada e badge de urgência", () => {
    renderLegend();

    expect(screen.getByText("Lesão/Infecção Periapical")).toBeInTheDocument();
    expect(screen.getByText("Cárie")).toBeInTheDocument();

    // formatConfidence(0.83) => "83%", formatConfidence(0.5) => "50%".
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();

    expect(screen.getByText("Urgente")).toBeInTheDocument();
    expect(screen.getByText("Eletiva")).toBeInTheDocument();
    expect(screen.getByText("2 achados")).toBeInTheDocument();
  });

  it("dispara onHoverFinding com o finding_id ao mouseEnter", () => {
    const { onHoverFinding } = renderLegend();

    fireEvent.mouseEnter(screen.getByRole("button", { name: /Lesão/ }));

    expect(onHoverFinding).toHaveBeenCalledTimes(1);
    expect(onHoverFinding).toHaveBeenCalledWith("f1");
  });

  it("dispara onHoverFinding ao focus (navegação por teclado)", () => {
    const { onHoverFinding } = renderLegend();
    const segundo = screen.getByRole("button", { name: /Cárie/ });

    fireEvent.focus(segundo);
    expect(onHoverFinding).toHaveBeenCalledWith("f2");

    fireEvent.blur(segundo);
    expect(onHoverFinding).toHaveBeenCalledWith(null);
  });

  it("limpa o hover no mouseLeave", () => {
    const { onHoverFinding } = renderLegend();
    const primeiro = screen.getByRole("button", { name: /Lesão/ });

    fireEvent.mouseEnter(primeiro);
    fireEvent.mouseLeave(primeiro);

    expect(onHoverFinding).toHaveBeenLastCalledWith(null);
  });

  it("chama onTogglePin com o finding_id ao clicar", () => {
    const { onTogglePin } = renderLegend();

    fireEvent.click(screen.getByRole("button", { name: /Lesão/ }));

    expect(onTogglePin).toHaveBeenCalledWith("f1");
  });

  it("marca o item fixado com aria-pressed e o selo 'fixado'", () => {
    renderLegend({ pinnedFindingId: "f1" });

    expect(screen.getByRole("button", { name: /Lesão/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Cárie/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("fixado")).toBeInTheDocument();
  });

  it("mostra estado vazio sem botões quando não há achados", () => {
    renderLegend({ findings: [] });

    expect(
      screen.getByText("Nenhum achado acima do limiar de confiança."),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
