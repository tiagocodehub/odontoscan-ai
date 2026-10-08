import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TreatmentPlan from "@/components/TreatmentPlan";
import { buildPlanFromFindings } from "@/lib/treatment-plan";
import type { TreatmentPlanItem } from "@/lib/treatment-plan";
import { makeFinding } from "@/lib/__fixtures__/analysis";

function renderPlan(initial: TreatmentPlanItem[], onRestore = vi.fn()) {
  function Harness() {
    const [items, setItems] = useState(initial);
    return (
      <TreatmentPlan items={items} onItemsChange={setItems} onRestore={onRestore} />
    );
  }

  render(<Harness />);
  return { onRestore };
}

function twoFindingsPlan(): TreatmentPlanItem[] {
  return buildPlanFromFindings([
    makeFinding({ finding_id: "f1" }),
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
  ]);
}

describe("TreatmentPlan", () => {
  it("renderiza itens com título, urgência e confiança", () => {
    renderPlan(twoFindingsPlan());

    expect(screen.getByText("Lesão/Infecção Periapical")).toBeInTheDocument();
    expect(screen.getByText("Cárie")).toBeInTheDocument();
    expect(screen.getByText("Urgente")).toBeInTheDocument();
    expect(screen.getByText("Eletiva")).toBeInTheDocument();
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("alterna o checkbox de inclusão do item", async () => {
    const user = userEvent.setup();
    renderPlan(twoFindingsPlan());

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();

    await user.click(checkboxes[0] as HTMLElement);

    expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")[1]).toBeChecked();
  });

  it("edita a observação do item", async () => {
    const user = userEvent.setup();
    renderPlan(twoFindingsPlan());

    const notes = screen.getAllByLabelText("Observação");
    await user.type(notes[0] as HTMLElement, "Correlacionar com exame clínico");

    expect(screen.getAllByLabelText("Observação")[0]).toHaveValue(
      "Correlacionar com exame clínico",
    );
  });

  it("exige título e adiciona item custom", async () => {
    const user = userEvent.setup();
    renderPlan(buildPlanFromFindings([makeFinding({ finding_id: "f1" })]));

    await user.click(screen.getByRole("button", { name: "Adicionar item" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Informe um título para o item.");
    expect(screen.queryByText("item próprio")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Título do novo item"), "Implante em 36");
    await user.type(screen.getByLabelText("Detalhe (opcional)"), "Considerar avaliação");
    await user.click(screen.getByRole("button", { name: "Adicionar item" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Implante em 36")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Considerar avaliação")).toBeInTheDocument();
    expect(screen.getByText("item próprio")).toBeInTheDocument();
  });

  it("remove um item do plano", async () => {
    const user = userEvent.setup();
    renderPlan(twoFindingsPlan());

    await user.click(
      screen.getByRole("button", { name: "Remover item Lesão/Infecção Periapical" }),
    );

    expect(screen.queryByText("Lesão/Infecção Periapical")).not.toBeInTheDocument();
    expect(screen.getByText("Cárie")).toBeInTheDocument();
  });

  it("chama onRestore ao restaurar a sugestão", async () => {
    const user = userEvent.setup();
    const { onRestore } = renderPlan([]);

    await user.click(screen.getByRole("button", { name: "Restaurar sugestão" }));

    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("mostra aviso quando o plano está vazio", () => {
    renderPlan([]);

    expect(
      screen.getByText(/Nenhum item no plano/),
    ).toBeInTheDocument();
  });
});
