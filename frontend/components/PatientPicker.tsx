"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "@/lib/errors";
import { createPatient, listPatients } from "@/lib/records";
import { useAuth } from "@/lib/useAuth";
import type { Patient } from "@/lib/types";

interface PatientPickerProps {
  selectedPatientId: number | null;
  onSelect: (patientId: number | null) => void;
  className?: string;
}

/**
 * Pacientes do dentista (Etapa 4): lista, cria e seleciona o paciente da
 * analise em andamento. A selecao e opcional — sem ela, a analise nao e
 * vinculada a ninguem. Requer sessao autenticada.
 */
export default function PatientPicker({
  selectedPatientId,
  onSelect,
  className,
}: PatientPickerProps) {
  const { status } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const baseId = useId();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listPatients();
      if (!mountedRef.current) return;
      setPatients(list);
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Não foi possível carregar os pacientes.",
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void refresh();
  }, [status, refresh]);

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (creating) return;

      const trimmed = name.trim();
      if (!trimmed) {
        setError("Informe o nome do paciente.");
        return;
      }

      setCreating(true);
      setError(null);
      try {
        const created = await createPatient({
          name: trimmed,
          notes: notes.trim() || undefined,
        });
        if (!mountedRef.current) return;
        setName("");
        setNotes("");
        await refresh();
        onSelect(created.id);
      } catch (caught) {
        if (!mountedRef.current) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Não foi possível criar o paciente.",
        );
      } finally {
        if (mountedRef.current) setCreating(false);
      }
    },
    [creating, name, notes, onSelect, refresh],
  );

  if (status !== "authenticated") {
    return (
      <section
        aria-label="Pacientes"
        className={[
          "rounded-xl border border-slate-200 bg-white p-4",
          className ?? "",
        ].join(" ")}
      >
        <h2 className="text-sm font-semibold text-slate-700">Paciente</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Entre na sua conta para cadastrar e vincular pacientes às análises.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={`${baseId}-heading`}
      className={[
        "space-y-3 rounded-xl border border-slate-200 bg-white p-4",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${baseId}-heading`} className="text-sm font-semibold text-slate-700">
          Paciente
        </h2>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedPatientId === null}
          className={[
            "rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2",
            selectedPatientId === null
              ? "border-sky-600 bg-sky-50 text-sky-800"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
          ].join(" ")}
        >
          Sem vínculo
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-800 ring-1 ring-inset ring-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p role="status" className="text-xs text-slate-500">
          Carregando pacientes…
        </p>
      ) : patients.length === 0 ? (
        <p role="status" className="text-xs text-slate-500">
          Nenhum paciente cadastrado ainda.
        </p>
      ) : (
        <ul className="space-y-1">
          {patients.map((patient) => {
            const isSelected = selectedPatientId === patient.id;
            return (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => onSelect(patient.id)}
                  aria-pressed={isSelected}
                  className={[
                    "w-full rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2",
                    isSelected
                      ? "border-sky-600 bg-sky-50 font-semibold text-sky-900"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {patient.name}
                  {patient.notes ? (
                    <span className="block text-xs font-normal text-slate-500">
                      {patient.notes}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleCreate} noValidate className="space-y-2 border-t border-slate-100 pt-3">
        <div className="space-y-1">
          <label
            htmlFor={`${baseId}-name`}
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            Nome do paciente
          </label>
          <input
            id={`${baseId}-name`}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-required="true"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`${baseId}-notes`}
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            Observações (opcional)
          </label>
          <input
            id={`${baseId}-notes`}
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          aria-busy={creating}
          className="inline-flex items-center justify-center rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 motion-reduce:transition-none"
        >
          {creating ? "Adicionando…" : "Adicionar paciente"}
        </button>
      </form>
    </section>
  );
}
