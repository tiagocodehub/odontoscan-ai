"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { RefAttributes } from "react";
import Uploader from "@/components/Uploader";
import FindingsLegend, { UrgencyBadge } from "@/components/FindingsLegend";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import ReportPdf from "@/components/ReportPdf";
import TreatmentPlan from "@/components/TreatmentPlan";
import AuthPanel from "@/components/AuthPanel";
import PatientPicker from "@/components/PatientPicker";
import HistoryPanel from "@/components/HistoryPanel";
import SavePlanToHistory from "@/components/SavePlanToHistory";
import type {
  RadiographViewerHandle,
  RadiographViewerProps,
} from "@/components/RadiographViewer";
import { isBrowserPreviewable } from "@/lib/api";
import { FALLBACK_DISCLAIMER, PROTOTYPE_LABEL } from "@/lib/disclaimer";
import { useAnalysis } from "@/lib/useAnalysis";
import { useAuth } from "@/lib/useAuth";
import { toUrgency } from "@/lib/urgency";
import { buildPlanFromFindings } from "@/lib/treatment-plan";
import type { TreatmentPlanItem } from "@/lib/treatment-plan";

/**
 * Konva acessa `window` — o viewer precisa ser carregado SOMENTE no cliente.
 * `ssr: false` elimina qualquer risco de erro de hidratacao.
 */
const RadiographViewer = dynamic<
  RadiographViewerProps & RefAttributes<RadiographViewerHandle>
>(() => import("@/components/RadiographViewer"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="flex h-[320px] w-full items-center justify-center rounded-xl border border-slate-300 bg-slate-900 text-sm text-slate-300 sm:h-[420px] lg:h-[520px]"
    >
      Carregando visualizador…
    </div>
  ),
});

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hoveredFindingId, setHoveredFindingId] = useState<string | null>(null);
  const [pinnedFindingId, setPinnedFindingId] = useState<string | null>(null);
  const [plan, setPlan] = useState<TreatmentPlanItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);

  const viewerRef = useRef<RadiographViewerHandle | null>(null);
  const { status, result, error, analyze, reset } = useAnalysis();
  const { status: authStatus } = useAuth();

  // Sessao encerrada: remove qualquer vinculo de paciente selecionado.
  useEffect(() => {
    if (authStatus !== "authenticated") setSelectedPatientId(null);
  }, [authStatus]);

  // Cria/revoga a blob URL do preview (nunca envia a imagem a terceiros).
  useEffect(() => {
    if (!file || !isBrowserPreviewable(file)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Limpa hover/pin e reinicia o plano a cada nova analise concluida.
  useEffect(() => {
    setHoveredFindingId(null);
    setPinnedFindingId(null);
    setPlan(result ? buildPlanFromFindings(result.findings) : []);
  }, [result]);

  const handleSelect = useCallback(
    (nextFile: File) => {
      setFile(nextFile);
      reset();
      setHoveredFindingId(null);
      setPinnedFindingId(null);
    },
    [reset],
  );

  const handleClear = useCallback(() => {
    setFile(null);
    reset();
    setHoveredFindingId(null);
    setPinnedFindingId(null);
  }, [reset]);

  const handleAnalyze = useCallback(() => {
    if (!file) return;
    void analyze(file, selectedPatientId);
  }, [file, selectedPatientId, analyze]);

  const handleTogglePin = useCallback((findingId: string) => {
    setPinnedFindingId((current) => (current === findingId ? null : findingId));
  }, []);

  const handleRestorePlan = useCallback(() => {
    setPlan(result ? buildPlanFromFindings(result.findings) : []);
  }, [result]);

  const getStageImage = useCallback(
    // O viewer exporta offscreen nas dimensoes reais da imagem; pixelRatio 1
    // ja entrega resolucao nativa (pixelRatio 2 multiplicaria desnecessariamente).
    () => viewerRef.current?.toDataURL(1) ?? null,
    [],
  );

  const findings = result?.findings ?? [];
  const disclaimerText = result?.disclaimer ?? FALLBACK_DISCLAIMER;
  const showViewer = previewUrl !== null || result !== null;

  const byClassEntries = useMemo(
    () => (result ? Object.entries(result.summary.by_class) : []),
    [result],
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-700 text-white"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                <path d="M12 3c-4.4 0-7 2.6-7 7 0 2.6.6 4.6 1.3 6.4.5 1.2.9 2.1 1.1 3.1.2 1 .9 1.5 1.6 1.5.8 0 1.4-.6 1.6-1.6l.7-3.1c.1-.5.4-.8.7-.8s.6.3.7.8l.7 3.1c.2 1 .8 1.6 1.6 1.6.7 0 1.4-.5 1.6-1.5.2-1 .6-1.9 1.1-3.1C18.4 14.6 19 12.6 19 10c0-4.4-2.6-7-7-7Z" />
              </svg>
            </span>
            <div>
              <h1 className="text-lg font-bold leading-tight text-slate-900">
                OdontoScan AI
              </h1>
              <p className="text-xs text-slate-500">
                Apoio à decisão em radiografias odontológicas
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
            <p className="self-start rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:self-center">
              {PROTOTYPE_LABEL}
            </p>
            <AuthPanel />
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <noscript>
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-300">
            Este protótipo requer JavaScript para enviar e visualizar as radiografias.
          </p>
        </noscript>

        <DisclaimerBanner text={disclaimerText} />

        {result ? (
          <section
            aria-label="Resumo da análise"
            className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Achados detectados
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                {result.summary.total}
              </p>
              {byClassEntries.length > 0 ? (
                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {byClassEntries.map(([className, count]) => (
                    <li key={className} className="font-mono">
                      {className}: {count}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Urgência máxima
              </p>
              <div className="mt-2">
                <UrgencyBadge
                  urgency={toUrgency(result.summary.max_urgency)}
                  className="px-3 py-1 text-sm"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Inferência
              </p>
              <p className="mt-1 text-sm text-slate-800">
                {result.inference_ms} ms
              </p>
              <p className="text-xs text-slate-500">
                Modelo {result.model.version} · runtime {result.model.runtime}
              </p>
              <p className="text-xs text-slate-500">
                Imagem {result.image.width}×{result.image.height}px ·{" "}
                {result.image.original_format.toUpperCase()}
              </p>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-6">
            <Uploader
              file={file}
              previewUrl={previewUrl}
              status={status}
              onSelect={handleSelect}
              onClear={handleClear}
              onAnalyze={handleAnalyze}
              serverError={error?.message ?? null}
            />

            {error ? (
              <p className="text-xs text-slate-500">
                Código: <span className="font-mono">{error.code}</span>
                {error.requestId ? (
                  <>
                    {" "}
                    · request_id: <span className="font-mono">{error.requestId}</span>
                  </>
                ) : null}
              </p>
            ) : null}

            <section aria-labelledby="viewer-heading" className="space-y-3">
              <h2 id="viewer-heading" className="text-sm font-semibold text-slate-700">
                2. Confira as demarcações
              </h2>

              {showViewer ? (
                <RadiographViewer
                  ref={viewerRef}
                  imageUrl={previewUrl}
                  findings={findings}
                  hoveredFindingId={hoveredFindingId}
                  pinnedFindingId={pinnedFindingId}
                  onHoverFinding={setHoveredFindingId}
                  onSelectFinding={handleTogglePin}
                />
              ) : (
                <div className="flex h-[320px] w-full items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 sm:h-[420px] lg:h-[520px]">
                  A radiografia e as demarcações aparecerão aqui após o envio.
                </div>
              )}
            </section>

            {result ? (
              <TreatmentPlan
                items={plan}
                onItemsChange={setPlan}
                onRestore={handleRestorePlan}
              />
            ) : null}

            {result ? (
              <SavePlanToHistory
                recordId={result.record_id}
                patientId={selectedPatientId}
                plan={plan}
              />
            ) : null}
          </div>

          <aside className="space-y-6">
            <FindingsLegend
              findings={findings}
              hoveredFindingId={hoveredFindingId}
              pinnedFindingId={pinnedFindingId}
              onHoverFinding={setHoveredFindingId}
              onTogglePin={handleTogglePin}
            />

            <PatientPicker
              selectedPatientId={selectedPatientId}
              onSelect={setSelectedPatientId}
            />

            <HistoryPanel
              patientFilter={selectedPatientId}
              refreshKey={result?.record_id ?? null}
            />

            <section
              aria-labelledby="report-heading"
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <h2 id="report-heading" className="text-sm font-semibold text-slate-700">
                Relatório
              </h2>
              <p className="text-xs leading-relaxed text-slate-500">
                Gera um PDF no seu navegador com a imagem demarcada, a tabela de achados
                e o aviso legal. Nenhuma imagem é enviada para serviços de terceiros.
              </p>
              <ReportPdf
                analysis={result}
                plan={plan}
                getStageImage={getStageImage}
                className="w-full"
              />
            </section>

            {result ? (
              <dl className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
                <div className="flex justify-between gap-2">
                  <dt>analysis_id</dt>
                  <dd className="truncate font-mono" title={result.analysis_id}>
                    {result.analysis_id}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>request_id</dt>
                  <dd className="truncate font-mono" title={result.request_id}>
                    {result.request_id}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>limiar</dt>
                  <dd className="font-mono">{result.model.threshold.toFixed(2)}</dd>
                </div>
              </dl>
            ) : null}
          </aside>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 text-xs leading-relaxed text-slate-500 sm:px-6">
          <p>
            OdontoScan AI é um protótipo de pesquisa. Os resultados são sugestivos e
            não constituem diagnóstico. A decisão clínica é responsabilidade
            exclusiva do profissional habilitado.
          </p>
        </div>
      </footer>
    </div>
  );
}
