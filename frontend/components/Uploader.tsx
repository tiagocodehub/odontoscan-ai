"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { MAX_UPLOAD_MB, validateImageFile } from "@/lib/api";
import type { AnalysisStatus } from "@/lib/useAnalysis";

interface UploaderProps {
  file: File | null;
  previewUrl: string | null;
  status: AnalysisStatus;
  /** Recebe o arquivo APENAS apos validacao client-side. */
  onSelect: (file: File) => void;
  onClear: () => void;
  onAnalyze: () => void;
  /** Mensagem de erro vinda da API (envelope). */
  serverError?: string | null;
}

const ACCEPT =
  ".png,.jpg,.jpeg,.dcm,.dicom,image/png,image/jpeg,application/dicom";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Entrada de arquivo com drag-and-drop, validacao client-side e preview.
 * Acessiveis: o dropzone e um `<label>` ligado ao `<input type="file">`,
 * portanto funciona por teclado e leitores de tela nativamente.
 */
export default function Uploader({
  file,
  previewUrl,
  status,
  onSelect,
  onClear,
  onAnalyze,
  serverError,
}: UploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isUploading = status === "uploading";
  const errorMessage = localError ?? serverError ?? null;

  const acceptFile = useCallback(
    (candidate: File | null | undefined) => {
      if (!candidate) return;
      const validation = validateImageFile(candidate);
      if (!validation.ok) {
        setLocalError(validation.message ?? "Arquivo inválido.");
        return;
      }
      setLocalError(null);
      onSelect(candidate);
    },
    [onSelect],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      acceptFile(event.target.files?.[0]);
      // Permite reenviar o mesmo arquivo depois de um erro.
      event.target.value = "";
    },
    [acceptFile],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsDragging(false);
      acceptFile(event.dataTransfer.files?.[0]);
    },
    [acceptFile],
  );

  const handleClear = useCallback(() => {
    setLocalError(null);
    if (inputRef.current) inputRef.current.value = "";
    onClear();
  }, [onClear]);

  return (
    <section aria-labelledby={`${inputId}-heading`} className="space-y-3">
      <h2 id={`${inputId}-heading`} className="text-sm font-semibold text-slate-700">
        1. Envie a radiografia
      </h2>

      <label
        htmlFor={inputId}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center",
          "transition-colors duration-150 motion-reduce:transition-none",
          isDragging
            ? "border-sky-500 bg-sky-50"
            : "border-slate-300 bg-white hover:border-sky-400 hover:bg-slate-50",
          isUploading ? "pointer-events-none opacity-60" : "",
          "focus-within:ring-2 focus-within:ring-sky-600 focus-within:ring-offset-2",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          onChange={handleInputChange}
          disabled={isUploading}
          className="sr-only"
          aria-describedby={`${inputId}-hint`}
        />

        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8 fill-slate-400">
          <path d="M12 3 4 11h5v6h6v-6h5L12 3Zm-6 18h12v-2H6v2Z" />
        </svg>

        <span className="text-sm font-semibold text-slate-800">
          Arraste a radiografia aqui ou clique para selecionar
        </span>
        <span id={`${inputId}-hint`} className="text-xs text-slate-500">
          PNG, JPEG ou DICOM — até {MAX_UPLOAD_MB} MB
        </span>
      </label>

      {file ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
          {previewUrl ? (
            // Preview local (blob URL). next/image nao se aplica a blob URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`Pré-visualização de ${file.name}`}
              className="h-16 w-16 flex-none rounded-md border border-slate-200 object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-16 w-16 flex-none items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-[10px] font-semibold uppercase text-slate-500"
            >
              DICOM
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-slate-500">
              {formatBytes(file.size)}
              {!previewUrl ? " — pré-visualização indisponível no navegador" : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={handleClear}
            disabled={isUploading}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            Remover
          </button>
        </div>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onAnalyze}
        disabled={!file || isUploading}
        aria-busy={isUploading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:w-auto"
      >
        {isUploading ? (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
            Analisando…
          </>
        ) : (
          "Analisar radiografia"
        )}
      </button>
    </section>
  );
}
