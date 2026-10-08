import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/types";
import {
  addCustomItem,
  buildPlanFromFindings,
  countIncluded,
  includedItems,
  removeItem,
  toggleIncluded,
  updateDetail,
  updateNote,
  updateTitle,
} from "@/lib/treatment-plan";
import { makeFinding } from "@/lib/__fixtures__/analysis";

function findBy(
  findings: readonly Finding[],
  findingId: string,
): Finding | undefined {
  return findings.find((finding) => finding.finding_id === findingId);
}

const MIXED_FINDINGS: Finding[] = [
  makeFinding({
    finding_id: "eletiva",
    label_pt: "Eletiva",
    urgency: "eletiva",
    confidence: 0.9,
    conduct: "conduta-eletiva",
  }),
  makeFinding({
    finding_id: "urgente-baixa",
    label_pt: "Urgente baixa",
    urgency: "urgente",
    confidence: 0.5,
    conduct: "conduta-urgente-baixa",
  }),
  makeFinding({
    finding_id: "urgente-alta",
    label_pt: "Urgente alta",
    urgency: "urgente",
    confidence: 0.8,
    conduct: "conduta-urgente-alta",
  }),
  makeFinding({
    finding_id: "prioritaria",
    label_pt: "Prioritária",
    urgency: "prioritária",
    confidence: 0.95,
    conduct: "conduta-prioritaria",
  }),
  makeFinding({
    finding_id: "informativa",
    label_pt: "Informativa",
    urgency: "informativa",
    confidence: 0.99,
    conduct: "conduta-informativa",
  }),
];

describe("buildPlanFromFindings", () => {
  it("gera um item por achado ordenado por urgência desc e confiança desc", () => {
    const plan = buildPlanFromFindings(MIXED_FINDINGS);

    expect(plan.map((item) => item.finding_id)).toEqual([
      "urgente-alta",
      "urgente-baixa",
      "prioritaria",
      "eletiva",
      "informativa",
    ]);
  });

  it("preenche título/detalhe do achado e defaults (included, note, custom)", () => {
    const plan = buildPlanFromFindings([MIXED_FINDINGS[2] as Finding]);
    const item = plan[0];

    expect(item).toBeDefined();
    expect(item?.id).toBe("finding-urgente-alta");
    expect(item?.finding_id).toBe("urgente-alta");
    expect(item?.title).toBe("Urgente alta");
    expect(item?.detail).toBe("conduta-urgente-alta");
    expect(item?.urgency).toBe("urgente");
    expect(item?.confidence).toBe(0.8);
    expect(item?.included).toBe(true);
    expect(item?.note).toBe("");
    expect(item?.custom).toBe(false);
  });

  it("mantém a ordem de entrada quando urgência e confiança empatam", () => {
    const plan = buildPlanFromFindings([
      makeFinding({ finding_id: "a", urgency: "eletiva", confidence: 0.7 }),
      makeFinding({ finding_id: "b", urgency: "eletiva", confidence: 0.7 }),
    ]);

    expect(plan.map((item) => item.finding_id)).toEqual(["a", "b"]);
  });

  it("retorna plano vazio quando não há achados", () => {
    expect(buildPlanFromFindings([])).toEqual([]);
  });

  it("usa toUrgency e descarta confiança inválida (null)", () => {
    const plan = buildPlanFromFindings([
      makeFinding({
        finding_id: "x",
        urgency: "desconhecida" as Finding["urgency"],
        confidence: Number.NaN,
      }),
    ]);

    expect(plan[0]?.urgency).toBe("informativa");
    expect(plan[0]?.confidence).toBeNull();
  });

  it("não muta o array de achados original", () => {
    const source: Finding[] = [MIXED_FINDINGS[0] as Finding, MIXED_FINDINGS[1] as Finding];
    const snapshot = source.map((finding) => finding.finding_id);

    buildPlanFromFindings(source);

    expect(source.map((finding) => finding.finding_id)).toEqual(snapshot);
    expect(findBy(source, "eletiva")).toBeDefined();
  });
});

describe("toggleIncluded", () => {
  it("alterna apenas o item indicado e devolve nova lista", () => {
    const plan = buildPlanFromFindings(MIXED_FINDINGS);
    const toggled = toggleIncluded(plan, "finding-prioritaria");

    expect(toggled).not.toBe(plan);
    expect(toggled.find((item) => item.id === "finding-prioritaria")?.included).toBe(
      false,
    );
    expect(toggled.find((item) => item.id === "finding-urgente-alta")?.included).toBe(
      true,
    );

    const back = toggleIncluded(toggled, "finding-prioritaria");
    expect(back.find((item) => item.id === "finding-prioritaria")?.included).toBe(true);
  });
});

describe("updateNote / updateTitle / updateDetail", () => {
  it("atualiza a observação de um único item", () => {
    const plan = buildPlanFromFindings([makeFinding({ finding_id: "a" })]);
    const updated = updateNote(plan, plan[0]?.id ?? "", "Avaliar canal em 36.");

    expect(updated[0]?.note).toBe("Avaliar canal em 36.");
    expect(plan[0]?.note).toBe("");
  });

  it("atualiza título e detalhe de itens custom", () => {
    const withCustom = addCustomItem([], { title: "Antigo", detail: "Antigo detalhe" });
    const id = withCustom[0]?.id ?? "";

    const renamed = updateTitle(withCustom, id, "Novo título");
    expect(renamed[0]?.title).toBe("Novo título");

    const detailed = updateDetail(renamed, id, "Novo detalhe");
    expect(detailed[0]?.detail).toBe("Novo detalhe");
  });
});

describe("removeItem", () => {
  it("remove o item pelo id", () => {
    const plan = buildPlanFromFindings([
      makeFinding({ finding_id: "a" }),
      makeFinding({ finding_id: "b" }),
    ]);

    const filtered = removeItem(plan, "finding-a");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.finding_id).toBe("b");
    expect(plan).toHaveLength(2);
  });

  it("não altera a lista quando o id não existe", () => {
    const plan = buildPlanFromFindings([makeFinding({ finding_id: "a" })]);
    const filtered = removeItem(plan, "inexistente");

    expect(filtered).toHaveLength(1);
  });
});

describe("addCustomItem", () => {
  it("adiciona item custom com id único, finding_id null e defaults", () => {
    const base = buildPlanFromFindings([makeFinding({ finding_id: "a" })]);

    const once = addCustomItem(base, { title: "Implante em 36", detail: "Considerar" });
    const twice = addCustomItem(once, { title: "Canal em 46" });

    expect(once).toHaveLength(2);
    expect(twice).toHaveLength(3);

    const customA = once[1];
    const customB = twice[2];
    const customOnly = twice.filter((item) => item.custom);

    expect(customOnly).toHaveLength(2);
    expect(customA?.id).not.toBe(customB?.id);
    expect(customA?.finding_id).toBeNull();
    expect(customA?.title).toBe("Implante em 36");
    expect(customA?.detail).toBe("Considerar");
    expect(customA?.custom).toBe(true);
    expect(customA?.included).toBe(true);
    expect(customA?.note).toBe("");
    expect(customA?.urgency).toBe("informativa");
    expect(customA?.confidence).toBeNull();
  });
});

describe("includedItems / countIncluded", () => {
  it("filtra e conta apenas os itens incluídos", () => {
    const plan = buildPlanFromFindings([
      makeFinding({ finding_id: "a" }),
      makeFinding({ finding_id: "b" }),
      makeFinding({ finding_id: "c" }),
    ]);

    expect(countIncluded(plan)).toBe(3);

    const toggled = toggleIncluded(plan, "finding-b");
    const included = includedItems(toggled);

    expect(countIncluded(toggled)).toBe(2);
    expect(included.map((item) => item.finding_id)).toEqual(["a", "c"]);
  });

  it("retorna vazio quando nada está incluído", () => {
    const plan = buildPlanFromFindings([makeFinding({ finding_id: "a" })]);
    const excluded = toggleIncluded(plan, "finding-a");

    expect(includedItems(excluded)).toEqual([]);
    expect(countIncluded(excluded)).toBe(0);
  });
});
