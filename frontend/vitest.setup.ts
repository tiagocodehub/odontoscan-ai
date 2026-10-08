import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * Setup global do Vitest.
 *
 * 1. Registra os matchers do jest-dom (`toBeInTheDocument`, etc.).
 * 2. Desmonta a arvore React entre os testes.
 * 3. Preenche APIs ausentes no jsdom que quebrariam componentes (ResizeObserver,
 *    matchMedia, canvas/getContext) — sem elas, montar qualquer viewer baseado
 *    em Konva lancaria excecao antes mesmo das assercoes.
 */

afterEach(() => {
  cleanup();
});

// --- matchMedia -------------------------------------------------------------
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

// --- ResizeObserver (usado pelo RadiographViewer) ---------------------------
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

// --- Canvas / Konva ---------------------------------------------------------
/**
 * jsdom nao implementa `canvas`. Devolvemos um contexto 2D "no-op" para que
 * libs como Konva possam inicializar sem `Not implemented` nem excecoes. Os
 * testes de logica pura nao dependem de pixels reais.
 */
function createCanvasContextStub(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const noop = (): void => {};
  const base: Record<string, unknown> = {
    canvas,
    measureText: () => ({ width: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
  };
  return new Proxy(base, {
    get: (target, property) =>
      property in target ? target[property as string] : noop,
  }) as unknown as CanvasRenderingContext2D;
}

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
  ) {
    return contextId === "2d" ? createCanvasContextStub(this) : null;
  } as unknown as HTMLCanvasElement["getContext"];
}

if (typeof globalThis.Path2D === "undefined") {
  globalThis.Path2D = class {
    addPath(): void {}
    moveTo(): void {}
    lineTo(): void {}
    quadraticCurveTo(): void {}
    bezierCurveTo(): void {}
    arc(): void {}
    rect(): void {}
    closePath(): void {}
  } as unknown as typeof Path2D;
}

// --- Blob URLs (preview do upload) -----------------------------------------
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:vitest-mock";
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => {};
}
