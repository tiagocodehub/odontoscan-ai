import type { Urgency } from "@/lib/types";
import { URGENCY_ORDER } from "@/lib/types";

/**
 * Apresentacao de urgencia (rotulo, cores de badge e cor de traco da bbox).
 * Fonte unica para UI, viewer e PDF — evita divergencia visual.
 */

const URGENCY_SET = new Set<string>(URGENCY_ORDER);

/** Type guard: garante que um valor vindo da API pertence a uniao conhecida. */
export function isUrgency(value: unknown): value is Urgency {
  return typeof value === "string" && URGENCY_SET.has(value);
}

/** Normaliza um valor arbitrario para `Urgency`, caindo em "informativa". */
export function toUrgency(value: unknown): Urgency {
  return isUrgency(value) ? value : "informativa";
}

export function urgencyLabel(value: Urgency): string {
  switch (value) {
    case "informativa":
      return "Informativa";
    case "eletiva":
      return "Eletiva";
    case "prioritária":
      return "Prioritária";
    case "urgente":
      return "Urgente";
  }
}

/** Classes Tailwind do badge (contraste AA sobre fundo claro). */
export function urgencyBadgeClasses(value: Urgency): string {
  switch (value) {
    case "informativa":
      return "bg-slate-100 text-slate-800 ring-slate-300";
    case "eletiva":
      return "bg-sky-100 text-sky-900 ring-sky-300";
    case "prioritária":
      return "bg-amber-100 text-amber-900 ring-amber-300";
    case "urgente":
      return "bg-red-100 text-red-800 ring-red-300";
  }
}

/** Cor do traco/realce da bounding box no Konva (mesma semantica do badge). */
export function urgencyStroke(value: Urgency): string {
  switch (value) {
    case "informativa":
      return "#475569"; // slate-600
    case "eletiva":
      return "#0284c7"; // sky-600
    case "prioritária":
      return "#d97706"; // amber-600
    case "urgente":
      return "#dc2626"; // red-600
  }
}

/** Classes da faixa lateral colorida de cada item da legenda. */
export function urgencyAccentClasses(value: Urgency): string {
  switch (value) {
    case "informativa":
      return "bg-slate-400";
    case "eletiva":
      return "bg-sky-500";
    case "prioritária":
      return "bg-amber-500";
    case "urgente":
      return "bg-red-500";
  }
}

/** Preenchimento translucido da bbox com o contorno permanecendo opaco. */
export function urgencyFill(value: Urgency, alpha: number): string {
  const hex = urgencyStroke(value).replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const safeAlpha = Math.min(Math.max(alpha, 0), 1);
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}
