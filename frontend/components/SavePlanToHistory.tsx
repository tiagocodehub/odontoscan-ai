"use client";

import { useCallback, useId, useState } from "react";
import { ApiError } from "@/lib/errors";
import { updateAnalysis } from "@/lib/records";
import { useAuth } from "@/lib/useAuth";
import type { TreatmentPlanItem } from "@/lib/treatment-plan";
import type { RecordId } from "@/lib/types";

interface SavePlanToHistoryProps {
  /** Registro persistido da analise atual (`result.record_id`). */
  recordId: RecordId | null;
  /** Paciente selecionado no momento do salvamento (opcional). */
  patientId: number | null;
  /** Plano editado que sera persistido junto de `patient_id` e `notes`. */
  plan: TreatmentPlanItem[];
  className?: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Botao explicito "Salvar no histórico" (Etapa 4).
 *
 * So aparece quando a analise foi **persistida** (`record_id`) e ha sessao
 * autenticada. Chama `PUT /analyses/{id}` com `{ patient_id, notes, plan }`.
 */
export default function SavePlanToHistory({
  recordId,
  patientId,
  plan,
  className,
}: SavePlanToHistoryProps) {
  const { status } = useAuth();
  const [notes, setNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();

  const handleSave = useCallback(async () => {
    if (recordId === null || saveStatus === "saving") return;
    setSaveStatus("saving");
    setError(null);
    try {
      await updateAnalysis(recordId, {
        patient_id: patientId,
        notes: notes.trim(),
        plan,
      });
      setSaveStatus("saved");
    } catch (caught) {
      setSaveStatus("error");
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Não foi possível salvar o plano no histórico.",
      );
    }
  }, [notes, patientId, plan, recordId, saveStatus]);

  if (status !== "authenticated" || recordId === null) return null;

  return (
    <section
      aria-labelledby={`${baseId}-heading`}
      className={[
        "space-y-2 rounded-xl border border-slate-200 bg-white p-4",
        className ?? "",
      ].join(" ")}
    >
      <h2 id={`${baseId}-heading`} className="text-sm font-semibold text-slate-700">
        Salvar no histórico
      </h2>
      <p className="text-xs leading-relaxed text-slate-500">
        Persiste o plano atual e as observações no registro #{recordId} da
        análise. A imagem não é armazenada.
      </p>

      <div className="space-y-1">
        <label
          htmlFor={`${baseId}-notes`}
          className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
        >
          Observações do dentista (opcional)
        </label>
        <textarea
          id={`${baseId}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-800 ring-1 ring-inset ring-red-200">
          {error}
        </p>
      ) : null}

      {saveStatus === "saved" ? (
        <p role="status" className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800 ring-1 ring-inset ring-emerald-200">
          Plano salvo no histórico.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saveStatus === "saving"}
        aria-busy={saveStatus === "saving"}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
      >
        {saveStatus === "saving" ? "Salvando…" : "Salvar no histórico"}
      </button>
    </section>
  );
}
