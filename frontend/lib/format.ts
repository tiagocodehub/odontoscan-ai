/**
 * Formatadores de apresentacao compartilhados entre UI, viewer e PDF.
 * Fonte unica para evitar divergencia visual (ex.: "83%" vs "0.83").
 */

/**
 * Converte uma confianca normalizada (`[0,1]`) em percentual inteiro.
 * Valores nao finitos ou fora do intervalo sao saneados para `0`/`1`.
 */
export function formatConfidence(confidence: number): string {
  const safe = Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0;
  return `${(safe * 100).toFixed(0)}%`;
}
