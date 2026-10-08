import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Configuracao de testes (Vitest + Testing Library, ambiente jsdom).
 *
 * - `jsdom` simula o DOM sem navegador real (testes offline, sem backend).
 * - `globals: true` habilita `describe/it/expect` como globais em runtime, mas
 *   os testes importam explicitamente de `vitest` para nao afrouxar o ESLint.
 * - alias `@` espelha o `paths` do `tsconfig.json` (raiz do frontend).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "dist/**"],
    clearMocks: true,
    restoreMocks: true,
  },
});
