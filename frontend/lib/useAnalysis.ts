"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeRadiograph, ApiError } from "@/lib/api";
import type { AnalysisResponse } from "@/lib/types";

/**
 * Maquina de estados do envio: idle -> uploading -> done | error.
 * Sem Redux/Zustand: um unico hook, estado local elevado em `app/page.tsx`.
 */
export type AnalysisStatus = "idle" | "uploading" | "done" | "error";

export interface UseAnalysisResult {
  status: AnalysisStatus;
  result: AnalysisResponse | null;
  error: ApiError | null;
  analyze: (file: File, patientId?: number | null) => Promise<void>;
  reset: () => void;
}

export function useAnalysis(): UseAnalysisResult {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const aborterRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      aborterRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    aborterRef.current?.abort();
    aborterRef.current = null;
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  const analyze = useCallback(async (file: File, patientId?: number | null) => {
    aborterRef.current?.abort();
    const controller = new AbortController();
    aborterRef.current = controller;

    setStatus("uploading");
    setError(null);
    setResult(null);

    try {
      const analysis = await analyzeRadiograph(file, controller.signal, patientId);
      if (!mountedRef.current || controller.signal.aborted) return;
      setResult(analysis);
      setStatus("done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (!mountedRef.current) return;

      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError("Falha inesperada ao analisar a radiografia. Tente novamente.", {
              code: "UNKNOWN",
              status: 0,
            });

      setError(apiError);
      setStatus("error");
    } finally {
      if (aborterRef.current === controller) aborterRef.current = null;
    }
  }, []);

  return { status, result, error, analyze, reset };
}
