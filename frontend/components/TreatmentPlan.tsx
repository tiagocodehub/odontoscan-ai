"use client";

import { useCallback, useId, useState } from "react";
import type { FormEvent } from "react";
import { UrgencyBadge } from "@/components/FindingsLegend";
import { formatConfidence } from "@/lib/format";
import {
  addCustomItem,
  removeItem,
  toggleIncluded,
  updateDetail,
  updateNote,
  updateTitle,
} from "@/lib/treatment-plan";
import type { TreatmentPlanItem } from "@/lib/treatment-plan";

export interface TreatmentPlanProps {
  items: TreatmentPlanItem[];
  /** Recebe a NOVA lista (helpers puros aplicados no estado elevado). */
  onItemsChange: (items: TreatmentPlanItem[]) => void;
  /** Volta ao plano derivado dos achados (sugestao original). */
  onRestore: () => void;
  className?: string;
  headingId?: string;
}

/**
 * Plano de tratamento sugerido e editavel.
 *
 * Componente CONTROLADO: nao guarda os itens, apenas deriva a proxima lista com
 * os helpers de `@/lib/treatment-plan` e devolve via `onItemsChange`. O estado
 * elevado em `app/page.tsx` e a unica fonte de verdade (mesma lista vai ao PDF).
 */
export default function TreatmentPlan({
  items,
  onItemsChange,
  onRestore,
  className,
  headingId = "treatment-plan-heading",
}: TreatmentPlanProps) {
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDetail, setDraftDetail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const baseId = useId();

  const handleToggle = useCallback(
    (id: string) => onItemsChange(toggleIncluded(items, id)),
    [items, onItemsChange],
  );
  const handleNote = useCallback(
    (id: string, note: string) => onItemsChange(updateNote(items, id, note)),
    [items, onItemsChange],
  );
  const handleTitle = useCallback(
    (id: string, title: string) => onItemsChange(updateTitle(items, id, title)),
    [items, onItemsChange],
  );
  const handleDetail = useCallback(
    (id: string, detail: string) => onItemsChange(updateDetail(items, id, detail)),
    [items, onItemsChange],
  );
  const handleRemove = useCallback(
    (id: string) => onItemsChange(removeItem(items, id)),
    [items, onItemsChange],
  );

  const handleAdd = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = draftTitle.trim();
      if (!title) {
        setFormError("Informe um título para o item.");
        return;
      }
      onItemsChange(addCustomItem(items, { title, detail: draftDetail.trim() }));
      setDraftTitle("");
      setDraftDetail("");
      setFormError(null);
    },
    [draftDetail, draftTitle, items, onItemsChange],
  );

  const newTitleId = `${baseId}-new-title`;
  const newDetailId = `${baseId}-new-detail`;
  const errorId = `${baseId}-new-error`;

  return (
    <section
      aria-labelledby={headingId}
      className={[
        "space-y-3 rounded-xl border border-slate-200 bg-white p-4",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={headingId} className="text-sm font-semibold text-slate-700">
          Plano de tratamento
        </h2>
        <button
          type="button"
          onClick={onRestore}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          Restaurar sugestão
        </button>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Sugestão editável de apoio à decisão. Ajuste, inclua ou remova itens e
        registre observações. A conduta final é responsabilidade exclusiva do
        profissional habilitado.
      </p>

      {items.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
        >
          Nenhum item no plano. Adicione itens manualmente ou use o botão
          Restaurar sugestão para reaproveitar os achados detectados.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const checkboxId = `${baseId}-include-${item.id}`;
            const noteId = `${baseId}-note-${item.id}`;
            const titleId = `${baseId}-title-${item.id}`;
            const detailId = `${baseId}-detail-${item.id}`;

            return (
              <li
                key={item.id}
                className={[
                  "space-y-2 rounded-lg border border-slate-200 p-3 transition-opacity motion-reduce:transition-none",
                  item.included ? "" : "opacity-60",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="flex items-center gap-2">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={item.included}
                      onChange={() => handleToggle(item.id)}
                      className="h-4 w-4 rounded border-slate-400 text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
                    />
                    <label
                      htmlFor={checkboxId}
                      className="text-xs font-medium text-slate-600"
                    >
                      Incluir no relatório
                    </label>
                  </span>

                  <UrgencyBadge urgency={item.urgency} />
                  {item.confidence !== null ? (
                    <span className="text-xs text-slate-500">
                      Confiança:{" "}
                      <strong className="font-semibold text-slate-700">
                        {formatConfidence(item.confidence)}
                      </strong>
                    </span>
                  ) : null}
                  {item.custom ? (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      item próprio
                    </span>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    aria-label={`Remover item ${item.title}`}
                    className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
                  >
                    Remover
                  </button>
                </div>

                {item.custom ? (
                  <div className="space-y-1">
                    <label
                      htmlFor={titleId}
                      className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Título do item
                    </label>
                    <input
                      id={titleId}
                      type="text"
                      value={item.title}
                      onChange={(event) => handleTitle(item.id, event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
                    />
                    <label
                      htmlFor={detailId}
                      className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Detalhe do item
                    </label>
                    <input
                      id={detailId}
                      type="text"
                      value={item.detail}
                      onChange={(event) => handleDetail(item.id, event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    {item.detail ? (
                      <p className="text-xs leading-relaxed text-slate-700">
                        <span className="font-semibold text-slate-800">
                          Conduta sugerida:{" "}
                        </span>
                        {item.detail}
                      </p>
                    ) : null}
                  </>
                )}

                <div className="space-y-1">
                  <label
                    htmlFor={noteId}
                    className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Observação
                  </label>
                  <textarea
                    id={noteId}
                    value={item.note}
                    onChange={(event) => handleNote(item.id, event.target.value)}
                    rows={2}
                    placeholder="Observação do profissional (opcional)"
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={handleAdd}
        noValidate
        className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Adicionar item
        </h3>

        <div className="space-y-1">
          <label
            htmlFor={newTitleId}
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            Título do novo item
          </label>
          <input
            id={newTitleId}
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            aria-required="true"
            aria-invalid={formError !== null}
            aria-describedby={formError !== null ? errorId : undefined}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          />
        </div>

        {formError ? (
          <p id={errorId} role="alert" className="text-xs text-red-700">
            {formError}
          </p>
        ) : null}

        <div className="space-y-1">
          <label
            htmlFor={newDetailId}
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            Detalhe (opcional)
          </label>
          <input
            id={newDetailId}
            type="text"
            value={draftDetail}
            onChange={(event) => setDraftDetail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          Adicionar item
        </button>
      </form>
    </section>
  );
}
