import type { BboxNormalized } from "@/lib/types";

/**
 * Geometria pura do overlay.
 *
 * Regra de ouro: `bbox_normalized` ([0,1], xyxy) e a FONTE DE VERDADE.
 * Todas as conversoes partem dela; `bbox_pixels` nunca e usado para desenhar.
 */

export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Converte `bbox_normalized` (xyxy, [0,1]) para coordenadas do Stage
 * (xywh em pixels do tamanho renderizado).
 */
export function normToStage(
  bbox: BboxNormalized,
  stageWidth: number,
  stageHeight: number,
): StageRect {
  const [rawX1, rawY1, rawX2, rawY2] = bbox;

  // Normaliza possiveis inversoes (x1 > x2) sem confiar na ordem do backend.
  const x1 = clamp01(Math.min(rawX1, rawX2));
  const y1 = clamp01(Math.min(rawY1, rawY2));
  const x2 = clamp01(Math.max(rawX1, rawX2));
  const y2 = clamp01(Math.max(rawY1, rawY2));

  const left = x1 * stageWidth;
  const top = y1 * stageHeight;
  const right = x2 * stageWidth;
  const bottom = y2 * stageHeight;

  return {
    x: left,
    y: top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
  };
}

/**
 * Calcula o retangulo de ajuste ("contain") da imagem dentro do container,
 * preservando o aspect ratio. Usado para dimensionar o Stage.
 */
export function fitContain(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
): StageRect {
  if (imageWidth <= 0 || imageHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}
