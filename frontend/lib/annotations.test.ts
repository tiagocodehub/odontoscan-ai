import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  annotationStrokePx,
  clampPoint,
  isDot,
  MIN_ANNOTATION_STROKE_PX,
  pointerToNormalized,
  useAnnotationHistory,
} from "@/lib/annotations";
import type { Annotation, ViewTransform } from "@/lib/annotations";
import type { StageRect } from "@/lib/coords";

const IDENTITY: ViewTransform = { scale: 1, x: 0, y: 0 };

// 200x100 "contain" em 100x100 => 100x50 centralizada (letterbox de 25px no topo).
const BASE_RECT: StageRect = { x: 0, y: 25, width: 100, height: 50 };

function makeAnnotation(id: string): Annotation {
  return {
    id,
    tool: "pen",
    color: "#ef4444",
    strokeWidth: 0.005,
    points: [
      [0, 0],
      [1, 1],
    ],
  };
}

describe("clampPoint", () => {
  it("mantém pontos dentro de [0,1]", () => {
    expect(clampPoint([0.5, 0.25])).toEqual([0.5, 0.25]);
  });

  it("faz clamp de pontos fora do intervalo", () => {
    expect(clampPoint([-0.3, 1.4])).toEqual([0, 1]);
    expect(clampPoint([2, -1])).toEqual([1, 0]);
  });

  it("respeita os limites exatos 0 e 1", () => {
    expect(clampPoint([0, 1])).toEqual([0, 1]);
  });

  it("trata NaN como 0 (não propaga NaN)", () => {
    expect(clampPoint([Number.NaN, Number.NaN])).toEqual([0, 0]);
  });
});

describe("pointerToNormalized", () => {
  it("mapeia os cantos da imagem ajustada (sem zoom/pan)", () => {
    // baseRect: x=0,y=25,w=100,h=50.
    expect(pointerToNormalized([0, 25], BASE_RECT, IDENTITY)).toEqual([0, 0]);
    expect(pointerToNormalized([100, 75], BASE_RECT, IDENTITY)).toEqual([1, 1]);
    expect(pointerToNormalized([50, 50], BASE_RECT, IDENTITY)).toEqual([0.5, 0.5]);
  });

  it("desconta o offset (letterbox) do baseRect", () => {
    // Um clique 10px à direita e 5px abaixo do canto superior esquerdo.
    expect(pointerToNormalized([10, 30], BASE_RECT, IDENTITY)).toEqual([0.1, 0.1]);
  });

  it("inverte a transformação do Stage (zoom + pan)", () => {
    const view: ViewTransform = { scale: 2, x: -20, y: -10 };

    // stage = local * scale + offset; o canto (0,25) vira (-20, 40).
    expect(pointerToNormalized([-20, 40], BASE_RECT, view)).toEqual([0, 0]);
    // o centro local (50,50) vira (80, 90).
    expect(pointerToNormalized([80, 90], BASE_RECT, view)).toEqual([0.5, 0.5]);
  });

  it("faz clamp quando o ponteiro sai da imagem", () => {
    expect(pointerToNormalized([-500, -500], BASE_RECT, IDENTITY)).toEqual([0, 0]);
    expect(pointerToNormalized([9999, 9999], BASE_RECT, IDENTITY)).toEqual([1, 1]);
  });

  it("retorna [0,0] sem baseRect ou com baseRect degenerado", () => {
    expect(pointerToNormalized([10, 10], null, IDENTITY)).toEqual([0, 0]);
    expect(
      pointerToNormalized([10, 10], { x: 0, y: 0, width: 0, height: 0 }, IDENTITY),
    ).toEqual([0, 0]);
  });
});

describe("annotationStrokePx", () => {
  it("converte a fração da largura em pixels", () => {
    expect(annotationStrokePx(0.005, 1000)).toBe(5);
    expect(annotationStrokePx(0.01, 400)).toBe(4);
  });

  it("nunca fica abaixo da espessura mínima", () => {
    expect(annotationStrokePx(0.0001, 100)).toBe(MIN_ANNOTATION_STROKE_PX);
    expect(annotationStrokePx(0.005, 0)).toBe(MIN_ANNOTATION_STROKE_PX);
  });

  it("trata valores inválidos com a espessura mínima", () => {
    expect(annotationStrokePx(Number.NaN, 100)).toBe(MIN_ANNOTATION_STROKE_PX);
    expect(annotationStrokePx(0.005, Number.NaN)).toBe(MIN_ANNOTATION_STROKE_PX);
  });
});

describe("isDot", () => {
  it("considera um único ponto (clique) como ponto solto", () => {
    expect(isDot({ points: [[0.5, 0.5]] })).toBe(true);
  });

  it("considera um traço com extensão como não-ponto", () => {
    expect(
      isDot({
        points: [
          [0.1, 0.1],
          [0.4, 0.4],
        ],
      }),
    ).toBe(false);
  });
});

describe("useAnnotationHistory", () => {
  it("começa vazio e sem ações disponíveis", () => {
    const { result } = renderHook(() => useAnnotationHistory());

    expect(result.current.annotations).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canClear).toBe(false);
  });

  it("adiciona, desfaz e refaz preservando a ordem", () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => result.current.addAnnotation(makeAnnotation("a")));
    act(() => result.current.addAnnotation(makeAnnotation("b")));
    expect(result.current.annotations.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canClear).toBe(true);

    act(() => result.current.undo());
    expect(result.current.annotations.map((a) => a.id)).toEqual(["a"]);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.annotations.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.current.canRedo).toBe(false);
  });

  it("não desfaz além do início nem refaz além do fim", () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.annotations).toEqual([]);
  });

  it("invalida o redo após uma nova anotação", () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => result.current.addAnnotation(makeAnnotation("a")));
    act(() => result.current.addAnnotation(makeAnnotation("b")));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.addAnnotation(makeAnnotation("c")));
    expect(result.current.annotations.map((a) => a.id)).toEqual(["a", "c"]);
    expect(result.current.canRedo).toBe(false);
  });

  it("limpa todas as anotações e o histórico", () => {
    const { result } = renderHook(() => useAnnotationHistory());

    act(() => result.current.addAnnotation(makeAnnotation("a")));
    act(() => result.current.addAnnotation(makeAnnotation("b")));
    act(() => result.current.clear());

    expect(result.current.annotations).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canClear).toBe(false);
  });
});
