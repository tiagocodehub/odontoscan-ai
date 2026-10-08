"use client";

import type { ReactNode } from "react";
import {
  ANNOTATION_COLORS,
  ANNOTATION_STROKE_WIDTHS,
} from "@/lib/annotations";
import type { AnnotationTool } from "@/lib/annotations";

export interface AnnotationToolbarProps {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (strokeWidth: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  className?: string;
}

interface ToolOption {
  value: AnnotationTool;
  label: string;
  hint: string;
  icon: ReactNode;
}

/**
 * Icones puramente decorativos: o nome acessivel vem do `aria-label` do botao.
 * `aria-hidden` evita ruido para leitores de tela.
 */
function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const TOOL_OPTIONS: ToolOption[] = [
  {
    value: "pan",
    label: "Mover imagem",
    hint: "Arrastar e dar zoom (sem desenhar)",
    icon: (
      <ToolIcon>
        <path d="M12 3v18M3 12h18" />
        <path d="M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5" />
        <path d="M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
      </ToolIcon>
    ),
  },
  {
    value: "pen",
    label: "Caneta",
    hint: "Desenho à mão livre",
    icon: (
      <ToolIcon>
        <path d="M4 20l4-1 10-10a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" />
        <path d="M14 6l4 4" />
      </ToolIcon>
    ),
  },
  {
    value: "arrow",
    label: "Seta",
    hint: "Apontar um ponto",
    icon: (
      <ToolIcon>
        <path d="M5 19 19 5" />
        <path d="M19 5h-7M19 5v7" />
      </ToolIcon>
    ),
  },
  {
    value: "rect",
    label: "Retângulo",
    hint: "Demarcar uma região",
    icon: (
      <ToolIcon>
        <rect x="4" y="6.5" width="16" height="11" rx="1.5" />
      </ToolIcon>
    ),
  },
  {
    value: "ellipse",
    label: "Elipse",
    hint: "Demarcar uma região circular",
    icon: (
      <ToolIcon>
        <ellipse cx="12" cy="12" rx="8" ry="6.5" />
      </ToolIcon>
    ),
  },
];

const BUTTON_BASE =
  "flex h-8 w-8 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none";
const BUTTON_IDLE = "border-white/25 bg-slate-900/60 text-white hover:bg-slate-800";
const BUTTON_ACTIVE = "border-white bg-white/90 text-slate-900 hover:bg-white";
const BUTTON_DISABLED = "disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Barra de anotacao ("lousa"). Fica FORA do `role="img"` do canvas e sobreposta
 * ao viewer; por isso todos os controles sao `<button>` reais, navegaveis por
 * Tab e com `aria-pressed`/`aria-label` explicitos.
 */
export default function AnnotationToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  canUndo,
  canRedo,
  canClear,
  onUndo,
  onRedo,
  onClear,
  className,
}: AnnotationToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Ferramentas de anotação"
      aria-orientation="vertical"
      className={[
        "absolute left-3 top-3 z-20 flex flex-col gap-1.5 rounded-lg border border-white/20 bg-slate-900/85 p-1.5 shadow-lg backdrop-blur",
        className ?? "",
      ].join(" ")}
    >
      <div role="group" aria-label="Ferramenta de desenho" className="flex gap-1">
        {TOOL_OPTIONS.map((option) => {
          const active = option.value === tool;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToolChange(option.value)}
              aria-label={option.label}
              aria-pressed={active}
              title={`${option.label} — ${option.hint}`}
              className={[BUTTON_BASE, active ? BUTTON_ACTIVE : BUTTON_IDLE].join(" ")}
            >
              {option.icon}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="Cor do traço" className="flex gap-1">
        {ANNOTATION_COLORS.map((option) => {
          const active = option.value === color;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onColorChange(option.value)}
              aria-label={`Cor ${option.label}`}
              aria-pressed={active}
              title={`Cor: ${option.label}`}
              className={[BUTTON_BASE, active ? BUTTON_ACTIVE : BUTTON_IDLE].join(" ")}
            >
              <span
                aria-hidden="true"
                className="block h-4 w-4 rounded-sm border border-black/30"
                style={{ backgroundColor: option.value }}
              />
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="Espessura do traço" className="flex gap-1">
        {ANNOTATION_STROKE_WIDTHS.map((option) => {
          const active = option.value === strokeWidth;
          const previewHeight = Math.min(
            8,
            Math.max(2, Math.round(option.value * 700)),
          );
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onStrokeWidthChange(option.value)}
              aria-label={`Espessura ${option.label}`}
              aria-pressed={active}
              title={`Espessura: ${option.label}`}
              className={[BUTTON_BASE, active ? BUTTON_ACTIVE : BUTTON_IDLE].join(" ")}
            >
              <span
                aria-hidden="true"
                className="block w-4 rounded-full bg-current"
                style={{ height: `${previewHeight}px` }}
              />
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="Ações de anotação" className="flex gap-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Desfazer última anotação"
          title="Desfazer última anotação"
          className={[BUTTON_BASE, BUTTON_IDLE, BUTTON_DISABLED].join(" ")}
        >
          <ToolIcon>
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h9a6 6 0 0 1 0 12h-3" />
          </ToolIcon>
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Refazer anotação"
          title="Refazer anotação"
          className={[BUTTON_BASE, BUTTON_IDLE, BUTTON_DISABLED].join(" ")}
        >
          <ToolIcon>
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9h-9a6 6 0 0 0 0 12h3" />
          </ToolIcon>
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          aria-label="Limpar todas as anotações"
          title="Limpar todas as anotações"
          className={[BUTTON_BASE, BUTTON_IDLE, BUTTON_DISABLED].join(" ")}
        >
          <ToolIcon>
            <path d="M4 7h16" />
            <path d="M9 7V4.5h6V7" />
            <path d="M6 7l1 13h10l1-13" />
          </ToolIcon>
        </button>
      </div>
    </div>
  );
}
