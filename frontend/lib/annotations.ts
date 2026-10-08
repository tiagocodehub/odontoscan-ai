"use client";

import { useCallback, useReducer } from "react";
import { clamp01 } from "@/lib/coords";
import type { StageRect } from "@/lib/coords";

/**
 * Lousa digital: tipos e helpers PUROS (sem Konva/DOM) para que a geometria das
 * anotacoes seja testavel isoladamente.
 *
 * Regra de ouro (igual as bboxes): as coordenadas sao NORMALIZADAS a imagem
 * original (`[0,1]`). Assim os desenhos acompanham zoom/pan, resize do viewer e
 * a renderizacao offscreen usada no PDF.
 */

export type AnnotationTool = "pan" | "pen" | "arrow" | "rect" | "ellipse";

/** Ferramentas que efetivamente desenham (tudo menos "pan"). */
export type DrawingTool = Exclude<AnnotationTool, "pan">;

/** Ponto normalizado `[x, y]` em `[0,1]` relativo a imagem original. */
export type AnnotationPoint = [number, number];

export interface Annotation {
  id: string;
  tool: DrawingTool;
  color: string;
  /** Espessura como FRACAO da largura da imagem (independe de zoom/resolucao). */
  strokeWidth: number;
  points: AnnotationPoint[];
}

/** Transformacao atual do Stage (mesma do viewer: `view`). */
export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

/** Retangulo da imagem ajustada ao container (o `baseRect` do viewer). */
export type AnnotationBaseRect = StageRect;

export const ANNOTATION_COLORS = [
  { value: "#ef4444", label: "Vermelho" },
  { value: "#facc15", label: "Amarelo" },
  { value: "#22c55e", label: "Verde" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#ffffff", label: "Branco" },
] as const;

export const ANNOTATION_STROKE_WIDTHS = [
  { value: 0.0025, label: "Fino" },
  { value: 0.005, label: "Médio" },
  { value: 0.01, label: "Grosso" },
] as const;

export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0].value;
export const DEFAULT_ANNOTATION_STROKE_WIDTH = ANNOTATION_STROKE_WIDTHS[1].value;

/** Espessura minima em pixels para o traco nao desaparecer em telas pequenas. */
export const MIN_ANNOTATION_STROKE_PX = 1;

/** Span normalizado abaixo do qual a anotacao e considerada um "ponto". */
const DOT_SPAN_EPSILON = 1e-3;

/** Garante que cada coordenada fique em `[0,1]` (NaN vira 0). */
export function clampPoint(point: AnnotationPoint): AnnotationPoint {
  return [clamp01(point[0]), clamp01(point[1])];
}

/**
 * Converte a posicao do ponteiro (coordenadas do container do Stage, NAO
 * transformadas) para o espaco normalizado da imagem original.
 *
 * Inverte a transformacao do Stage — `stage = imagem * scale + offset` — e
 * depois subtrai o `baseRect` (letterbox) e divide pelo tamanho renderizado:
 *
 *   semZoom = (pointer - view.xy) / view.scale
 *   norm    = (semZoom - baseRect.xy) / baseRect.wh
 *
 * Sempre faz clamp em `[0,1]`, entao arrastar para fora da imagem nao fura a
 * borda.
 */
export function pointerToNormalized(
  pointer: AnnotationPoint,
  baseRect: AnnotationBaseRect | null,
  view: ViewTransform,
): AnnotationPoint {
  if (!baseRect || baseRect.width <= 0 || baseRect.height <= 0) return [0, 0];

  const scale = Number.isFinite(view.scale) && view.scale !== 0 ? view.scale : 1;
  const unscaledX = (pointer[0] - view.x) / scale;
  const unscaledY = (pointer[1] - view.y) / scale;

  return clampPoint([
    (unscaledX - baseRect.x) / baseRect.width,
    (unscaledY - baseRect.y) / baseRect.height,
  ]);
}

/**
 * Converte a espessura normalizada (fracao da largura) para pixels em uma
 * imagem de largura `width`. Usada tanto no viewer quanto no export offscreen.
 */
export function annotationStrokePx(strokeWidth: number, width: number): number {
  if (!Number.isFinite(strokeWidth) || !Number.isFinite(width) || width <= 0) {
    return MIN_ANNOTATION_STROKE_PX;
  }
  return Math.max(strokeWidth * width, MIN_ANNOTATION_STROKE_PX);
}

/** `true` quando a anotacao ocupa (quase) nenhuma area — vira um ponto solto. */
export function isDot(annotation: Pick<Annotation, "points">): boolean {
  const { points } = annotation;
  if (points.length < 2) return true;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return maxX - minX < DOT_SPAN_EPSILON && maxY - minY < DOT_SPAN_EPSILON;
}

export function createAnnotationId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Historico (undo/redo/clear) -------------------------------------------

export interface AnnotationHistoryState {
  entries: Annotation[];
  /** Quantidade de entradas visiveis; `entries.slice(0, pointer)`. */
  pointer: number;
}

export type AnnotationHistoryAction =
  | { type: "add"; annotation: Annotation }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" };

export const initialAnnotationHistory: AnnotationHistoryState = {
  entries: [],
  pointer: 0,
};

/**
 * Reducer puro e imutavel. Adicionar apos um undo descarta o "futuro" (redo
 * deixa de existir), que e o comportamento esperado em editores.
 */
export function annotationHistoryReducer(
  state: AnnotationHistoryState,
  action: AnnotationHistoryAction,
): AnnotationHistoryState {
  switch (action.type) {
    case "add": {
      const entries = [...state.entries.slice(0, state.pointer), action.annotation];
      return { entries, pointer: entries.length };
    }
    case "undo": {
      if (state.pointer <= 0) return state;
      return { ...state, pointer: state.pointer - 1 };
    }
    case "redo": {
      if (state.pointer >= state.entries.length) return state;
      return { ...state, pointer: state.pointer + 1 };
    }
    case "clear": {
      if (state.entries.length === 0 && state.pointer === 0) return state;
      return initialAnnotationHistory;
    }
    default: {
      return state;
    }
  }
}

export interface AnnotationHistory {
  /** Anotacoes visiveis (respeitando undo/redo). */
  annotations: Annotation[];
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  addAnnotation: (annotation: Annotation) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

export function useAnnotationHistory(): AnnotationHistory {
  const [state, dispatch] = useReducer(annotationHistoryReducer, initialAnnotationHistory);

  const addAnnotation = useCallback(
    (annotation: Annotation) => dispatch({ type: "add", annotation }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  return {
    annotations: state.entries.slice(0, state.pointer),
    canUndo: state.pointer > 0,
    canRedo: state.pointer < state.entries.length,
    canClear: state.entries.length > 0,
    addAnnotation,
    undo,
    redo,
    clear,
  };
}
