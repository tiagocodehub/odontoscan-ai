"use client";

import { useCallback } from "react";
import type { Finding, Urgency } from "@/lib/types";
import {
  toUrgency,
  urgencyAccentClasses,
  urgencyBadgeClasses,
  urgencyLabel,
} from "@/lib/urgency";
import { formatConfidence } from "@/lib/format";

interface UrgencyBadgeProps {
  urgency: Urgency | string;
  className?: string;
}

/** Selo de urgencia reutilizado na legenda e no headline de resumo. */
export function UrgencyBadge({ urgency, className }: UrgencyBadgeProps) {
  const value = toUrgency(urgency);
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        urgencyBadgeClasses(value),
        className ?? "",
      ].join(" ")}
    >
      {urgencyLabel(value)}
    </span>
  );
}

interface FindingsLegendProps {
  findings: Finding[];
  hoveredFindingId: string | null;
  pinnedFindingId: string | null;
  onHoverFinding: (findingId: string | null) => void;
  onTogglePin: (findingId: string) => void;
  className?: string;
}

/**
 * Legenda interativa. Hover/focus destaca a bbox correspondente no viewer;
 * o vinculo e feito por `finding_id` (estado elevado em `app/page.tsx`).
 */
export default function FindingsLegend({
  findings,
  hoveredFindingId,
  pinnedFindingId,
  onHoverFinding,
  onTogglePin,
  className,
}: FindingsLegendProps) {
  const handleMouseEnter = useCallback(
    (findingId: string) => () => onHoverFinding(findingId),
    [onHoverFinding],
  );
  const handleMouseLeave = useCallback(() => onHoverFinding(null), [onHoverFinding]);

  if (findings.length === 0) {
    return (
      <div
        className={[
          "rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900",
          className ?? "",
        ].join(" ")}
      >
        <p className="font-semibold">Nenhum achado acima do limiar de confiança.</p>
        <p className="mt-1 leading-relaxed">
          O modelo não detectou alterações com confiança suficiente. Isso não exclui
          a necessidade de avaliação clínica.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Achados detectados" className={className}>
      <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
        <span>Achados detectados</span>
        <span className="text-xs font-normal text-slate-500">
          {findings.length} {findings.length === 1 ? "achado" : "achados"}
        </span>
      </h2>

      <ul className="space-y-2">
        {findings.map((finding) => {
          const urgency = toUrgency(finding.urgency);
          const isHovered = hoveredFindingId === finding.finding_id;
          const isPinned = pinnedFindingId === finding.finding_id;
          const isActive = isHovered || isPinned;

          return (
            <li key={finding.finding_id}>
              <button
                type="button"
                aria-pressed={isPinned}
                onMouseEnter={handleMouseEnter(finding.finding_id)}
                onMouseLeave={handleMouseLeave}
                onFocus={handleMouseEnter(finding.finding_id)}
                onBlur={handleMouseLeave}
                onClick={() => onTogglePin(finding.finding_id)}
                className={[
                  "relative w-full overflow-hidden rounded-lg border bg-white p-3 text-left",
                  "transition-colors duration-150 motion-reduce:transition-none",
                  "hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2",
                  isActive ? "border-slate-500 ring-2 ring-sky-500/40" : "border-slate-200",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "absolute inset-y-0 left-0 w-1.5",
                    urgencyAccentClasses(urgency),
                  ].join(" ")}
                />

                <span className="flex flex-wrap items-center gap-2 pl-1.5">
                  <span className="text-sm font-semibold text-slate-900">
                    {finding.label_pt}
                  </span>
                  <UrgencyBadge urgency={urgency} />
                  {isPinned ? (
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      fixado
                    </span>
                  ) : null}
                </span>

                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1.5 text-xs text-slate-600">
                  <span className="font-mono text-[11px] text-slate-500">
                    {finding.class_name}
                  </span>
                  <span aria-label={`Confiança ${formatConfidence(finding.confidence)}`}>
                    Confiança:{" "}
                    <strong className="font-semibold text-slate-800">
                      {formatConfidence(finding.confidence)}
                    </strong>
                  </span>
                </span>

                {finding.conduct ? (
                  <span className="mt-2 block pl-1.5 text-xs leading-relaxed text-slate-700">
                    <span className="font-semibold text-slate-800">Conduta sugerida: </span>
                    {finding.conduct}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
