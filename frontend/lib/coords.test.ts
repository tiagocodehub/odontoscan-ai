import { describe, expect, it } from "vitest";
import { clamp, clamp01, fitContain, normToStage } from "@/lib/coords";
import type { BboxNormalized } from "@/lib/types";

const bbox = (x1: number, y1: number, x2: number, y2: number): BboxNormalized => [
  x1,
  y1,
  x2,
  y2,
];

describe("clamp / clamp01", () => {
  it("mantém valores dentro do intervalo", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("limita pelos extremos min e max", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("trata NaN como min (sem propagar NaN na geometria)", () => {
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
  });

  it("clamp01 restringe a [0,1]", () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe("normToStage", () => {
  it("mapeia a bbox cheia [0,0,1,1] para o stage inteiro (landscape)", () => {
    expect(normToStage(bbox(0, 0, 1, 1), 200, 100)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });

  it("mapeia bbox intermediária em um stage landscape", () => {
    // [0.25,0.5,0.75,1] em 400x200 => left 100, top 100, right 300, bottom 200
    expect(normToStage(bbox(0.25, 0.5, 0.75, 1), 400, 200)).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
  });

  it("respeita stage em formato retrato (H > W)", () => {
    // [0.1,0.2,0.3,0.4] em 100x400 => x 10, y 80, width 20, height 80
    expect(normToStage(bbox(0.1, 0.2, 0.3, 0.4), 100, 400)).toEqual({
      x: 10,
      y: 80,
      width: 20,
      height: 80,
    });
  });

  it("normaliza bboxes invertidas (x1>x2 / y1>y2) sem confiar na ordem", () => {
    const invertida = normToStage(bbox(0.75, 1, 0.25, 0.5), 400, 200);
    const ordenada = normToStage(bbox(0.25, 0.5, 0.75, 1), 400, 200);
    expect(invertida).toEqual(ordenada);
  });

  it("faz clamp de valores fora de [0,1] nas bordas", () => {
    expect(normToStage(bbox(-1, -2, 2, 3), 400, 200)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    });
    expect(normToStage(bbox(0.9, 0.9, 1.2, 1.2), 100, 100)).toEqual({
      x: 90,
      y: 90,
      width: 10,
      height: 10,
    });
  });

  it("garante largura/altura mínimas de 1px (caixa de área zero)", () => {
    expect(normToStage(bbox(0.5, 0.5, 0.5, 0.5), 100, 100)).toEqual({
      x: 50,
      y: 50,
      width: 1,
      height: 1,
    });
    expect(normToStage(bbox(1, 1, 1, 1), 100, 100)).toEqual({
      x: 100,
      y: 100,
      width: 1,
      height: 1,
    });
  });
});

describe("fitContain", () => {
  it("ajusta imagem landscape ao container preservando o aspecto", () => {
    // 200x100 dentro de 100x100 => metade do tamanho, centralizada na vertical
    expect(fitContain(200, 100, 100, 100)).toEqual({
      x: 0,
      y: 25,
      width: 100,
      height: 50,
    });
  });

  it("ajusta imagem retrato (H > W) centralizada na horizontal", () => {
    expect(fitContain(100, 200, 100, 100)).toEqual({
      x: 25,
      y: 0,
      width: 50,
      height: 100,
    });
  });

  it("centraliza quando a imagem é mais larga que o container", () => {
    // 400x200 em 200x300 => scale 0.5, sobra 200px vertical
    expect(fitContain(400, 200, 200, 300)).toEqual({
      x: 0,
      y: 100,
      width: 200,
      height: 100,
    });
  });

  it("preenche exatamente quando o aspecto coincide", () => {
    expect(fitContain(100, 50, 200, 100)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });

  it("retorna retângulo vazio para dimensões degeneradas", () => {
    expect(fitContain(0, 100, 100, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(fitContain(100, 0, 100, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(fitContain(100, 100, 0, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(fitContain(100, 100, 100, 0)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(fitContain(-1, 100, 100, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
