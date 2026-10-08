import type { Finding, Urgency } from "@/lib/types";
import { URGENCY_ORDER } from "@/lib/types";
import { toUrgency } from "@/lib/urgency";

/**
 * Plano de tratamento SUGERIDO e EDITAVEL.
 *
 * Deriva um item por achado (apoio a decisao, nunca prescricao) e oferece
 * helpers puros para o dentista incluir/excluir itens, anotar observacoes e
 * adicionar itens proprios. Toda funcao e imutavel: recebe a lista atual e
 * devolve uma NOVA lista, o que simplifica o estado elevado em `app/page.tsx`.
 */

export interface TreatmentPlanItem {
  id: string;
  /** `null` quando o item foi adicionado manualmente pelo dentista. */
  finding_id: string | null;
  /** `label_pt` do achado (ou titulo do item custom). */
  title: string;
  /** `conduct` do achado (ou texto do item custom). */
  detail: string;
  urgency: Urgency;
  confidence: number | null;
  /** Checkbox: entra no PDF/anotacao. */
  included: boolean;
  /** Observacao editavel do dentista. */
  note: string;
  custom: boolean;
}

export interface CustomItemInput {
  title: string;
  detail?: string;
  urgency?: Urgency;
  confidence?: number | null;
}

/** Gravidade crescente -> indice maior = mais grave. */
const URGENCY_RANK: ReadonlyMap<string, number> = new Map(
  URGENCY_ORDER.map((value, index) => [value, index]),
);

function rankOf(urgency: Urgency): number {
  return URGENCY_RANK.get(urgency) ?? 0;
}

function safeConfidence(confidence: number): number | null {
  return Number.isFinite(confidence) ? confidence : null;
}

let customItemCounter = 0;

/** Id unico para itens adicionados manualmente (nunca colide com `finding-*`). */
export function createCustomItemId(): string {
  customItemCounter += 1;
  return `custom-${customItemCounter}`;
}

/**
 * Um item por achado, ordenado por urgencia DESC e depois confianca DESC.
 * Todos entram no plano por padrao (`included: true`), sem nota e nao-custom.
 */
export function buildPlanFromFindings(
  findings: readonly Finding[],
): TreatmentPlanItem[] {
  return findings
    .map((finding): TreatmentPlanItem => ({
      id: `finding-${finding.finding_id}`,
      finding_id: finding.finding_id,
      title: finding.label_pt,
      detail: finding.conduct,
      urgency: toUrgency(finding.urgency),
      confidence: safeConfidence(finding.confidence),
      included: true,
      note: "",
      custom: false,
    }))
    .sort((a, b) => {
      const byUrgency = rankOf(b.urgency) - rankOf(a.urgency);
      if (byUrgency !== 0) return byUrgency;
      const aConfidence = a.confidence ?? -1;
      const bConfidence = b.confidence ?? -1;
      return bConfidence - aConfidence;
    });
}

export function toggleIncluded(
  items: readonly TreatmentPlanItem[],
  id: string,
): TreatmentPlanItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, included: !item.included } : item,
  );
}

export function updateNote(
  items: readonly TreatmentPlanItem[],
  id: string,
  note: string,
): TreatmentPlanItem[] {
  return items.map((item) => (item.id === id ? { ...item, note } : item));
}

export function updateTitle(
  items: readonly TreatmentPlanItem[],
  id: string,
  title: string,
): TreatmentPlanItem[] {
  return items.map((item) => (item.id === id ? { ...item, title } : item));
}

export function updateDetail(
  items: readonly TreatmentPlanItem[],
  id: string,
  detail: string,
): TreatmentPlanItem[] {
  return items.map((item) => (item.id === id ? { ...item, detail } : item));
}

export function removeItem(
  items: readonly TreatmentPlanItem[],
  id: string,
): TreatmentPlanItem[] {
  return items.filter((item) => item.id !== id);
}

export function addCustomItem(
  items: readonly TreatmentPlanItem[],
  input: CustomItemInput,
): TreatmentPlanItem[] {
  const item: TreatmentPlanItem = {
    id: createCustomItemId(),
    finding_id: null,
    title: input.title,
    detail: input.detail ?? "",
    urgency: toUrgency(input.urgency ?? "informativa"),
    confidence: input.confidence ?? null,
    included: true,
    note: "",
    custom: true,
  };
  return [...items, item];
}

export function includedItems(
  items: readonly TreatmentPlanItem[],
): TreatmentPlanItem[] {
  return items.filter((item) => item.included);
}

export function countIncluded(items: readonly TreatmentPlanItem[]): number {
  return includedItems(items).length;
}
