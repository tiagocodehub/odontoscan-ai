"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UrgencyBadge } from "@/components/FindingsLegend";
import { ApiError } from "@/lib/errors";
import { formatConfidence } from "@/lib/format";
import { deleteAnalysis, getAnalysis, listAnalyses } from "@/lib/records";
import { toUrgency, urgencyLabel } from "@/lib/urgency";
import { useAuth } from "@/lib/useAuth";
import type { AnalysisRecordDetail, AnalysisRecordSummary } from "@/lib/types";

interface HistoryPanelProps {
  /** Filtro por paciente (`?patient_id=`); `null` lista todos. */
  patientFilter: number | null;
  /** Muda quando uma nova analise e persistida, forçando recarga da lista. */
  refreshKey?: number | null;
  className?: string;
}

const IMAGE_NOTICE =
  "A imagem não é guardada. Reenvie o arquivo para rever as marcações.";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

/**
 * Historico de analises (Etapa 4).
 *
 * Lista `GET /analyses` (com filtro opcional por paciente) e, ao abrir
 * (`GET /analyses/{id}`), mostra achados e plano. A imagem nao e armazenada
 * (LGPD): a UI deixa claro que rever as marcacoes exige reenviar o arquivo.
 * Permite excluir a analise, com confirmacao.
 */
export default function HistoryPanel({
  patientFilter,
  refreshKey = null,
  className,
}: HistoryPanelProps) {
  const { status } = useAuth();
  const [records, setRecords] = useState<AnalysisRecordSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnalysisRecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAnalyses(patientFilter);
      if (!mountedRef.current) return;
      setRecords(list);
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Não foi possível carregar o histórico.",
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [patientFilter]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load, refreshKey]);

  const handleOpen = useCallback(async (recordId: number) => {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const found = await getAnalysis(recordId);
      if (!mountedRef.current) return;
      setDetail(found);
    } catch (caught) {
      if (!mountedRef.current) return;
      setDetailError(
        caught instanceof ApiError
          ? caught.message
          : "Não foi possível abrir a análise.",
      );
    } finally {
      if (mountedRef.current) setDetailLoading(false);
    }
  }, []);

  const handleDelete = useCallback(
    async (recordId: number) => {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Excluir esta análise do histórico? Esta ação não pode ser desfeita.",
        );
        if (!confirmed) return;
      }
      setDeletingId(recordId);
      setError(null);
      try {
        await deleteAnalysis(recordId);
        if (!mountedRef.current) return;
        if (detail?.record_id === recordId) setDetail(null);
        await load();
      } catch (caught) {
        if (!mountedRef.current) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Não foi possível excluir a análise.",
        );
      } finally {
        if (mountedRef.current) setDeletingId(null);
      }
    },
    [detail, load],
  );

  if (status !== "authenticated") {
    return (
      <section
        aria-label="Histórico"
        className={[
          "rounded-xl border border-slate-200 bg-white p-4",
          className ?? "",
        ].join(" ")}
      >
        <h2 className="text-sm font-semibold text-slate-700">Histórico</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Entre na sua conta para salvar e consultar análises anteriores.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="history-heading"
      className={[
        "space-y-3 rounded-xl border border-slate-200 bg-white p-4",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="history-heading" className="text-sm font-semibold text-slate-700">
          Histórico
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
        >
          Atualizar
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        {patientFilter === null ? "Todos os pacientes" : "Filtrado pelo paciente selecionado"}
        {" · "}
        {IMAGE_NOTICE}
      </p>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-800 ring-1 ring-inset ring-red-200">
          {error}
        </p>
      ) : null}

      {loading && records.length === 0 ? (
        <p role="status" className="text-xs text-slate-500">
          Carregando histórico…
        </p>
      ) : records.length === 0 ? (
        <p role="status" className="text-xs text-slate-500">
          Nenhuma análise salva no histórico.
        </p>
      ) : (
        <ul className="space-y-2">
          {records.map((record) => (
            <li
              key={record.record_id}
              className="space-y-2 rounded-lg border border-slate-200 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {record.patient?.name ?? "Sem paciente"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatDate(record.created_at)}
                  </p>
                </div>
                <UrgencyBadge urgency={toUrgency(record.summary.max_urgency)} />
              </div>

              <p className="text-[11px] text-slate-600">
                {record.summary.total}{" "}
                {record.summary.total === 1 ? "achado" : "achados"}
                {record.notes ? ` · ${record.notes}` : ""}
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleOpen(record.record_id)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
                >
                  Abrir
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(record.record_id)}
                  disabled={deletingId === record.record_id}
                  aria-label={`Excluir análise de ${record.patient?.name ?? "sem paciente"}`}
                  className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none"
                >
                  {deletingId === record.record_id ? "Excluindo…" : "Excluir"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {detailLoading ? (
        <p role="status" className="text-xs text-slate-500">
          Abrindo análise…
        </p>
      ) : null}

      {detailError ? (
        <p role="alert" className="text-xs text-red-700">
          {detailError}
        </p>
      ) : null}

      {detail ? (
        <div
          aria-label="Detalhe da análise"
          className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-800">
                {detail.patient?.name ?? "Sem paciente"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {formatDate(detail.created_at)} · registro #{detail.record_id}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
            >
              Fechar
            </button>
          </div>

          <p className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-900 ring-1 ring-inset ring-amber-300">
            {IMAGE_NOTICE}
          </p>

          {detail.notes ? (
            <p className="text-[11px] text-slate-700">
              <span className="font-semibold">Observações: </span>
              {detail.notes}
            </p>
          ) : null}

          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Achados
            </h4>
            {detail.findings.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nenhum achado acima do limiar.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {detail.findings.map((finding) => (
                  <li
                    key={finding.finding_id}
                    className="rounded-md border border-slate-200 bg-white p-2"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        {finding.label_pt}
                      </span>
                      <UrgencyBadge urgency={toUrgency(finding.urgency)} />
                      <span className="text-[11px] text-slate-500">
                        {formatConfidence(finding.confidence)}
                      </span>
                    </span>
                    {finding.conduct ? (
                      <span className="mt-1 block text-[11px] leading-relaxed text-slate-600">
                        {finding.conduct}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Plano de tratamento
            </h4>
            {!detail.plan || detail.plan.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum item no plano salvo.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {detail.plan.map((item, index) => (
                  <li
                    key={item.id ?? `${item.title}-${index}`}
                    className="rounded-md border border-slate-200 bg-white p-2"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {urgencyLabel(toUrgency(item.urgency ?? "informativa"))}
                        {item.included === false ? " · não incluído" : ""}
                      </span>
                    </span>
                    {item.note ? (
                      <span className="mt-1 block text-[11px] italic text-slate-600">
                        {item.note}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
