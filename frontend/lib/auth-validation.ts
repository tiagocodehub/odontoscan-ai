/**
 * Validacao client-side do formulario de autenticacao (Etapa 4).
 * Regras alinhadas ao contrato: e-mail, senha >= 8, `cro_state` UF de 2 letras,
 * `cro_number` apenas digitos. Funcoes puras e reutilizaveis nos testes.
 */

export const MIN_PASSWORD_LENGTH = 8;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UF_PATTERN = /^[A-Za-z]{2}$/;
export const CRO_NUMBER_PATTERN = /^\d+$/;

export function validateName(value: string): string | null {
  return value.trim().length > 0 ? null : "Informe seu nome.";
}

export function validateEmail(value: string): string | null {
  return EMAIL_PATTERN.test(value.trim()) ? null : "Informe um e-mail válido.";
}

export function validatePassword(value: string): string | null {
  return value.length >= MIN_PASSWORD_LENGTH
    ? null
    : `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
}

export function validateCroNumber(value: string): string | null {
  return CRO_NUMBER_PATTERN.test(value.trim())
    ? null
    : "O CRO deve conter apenas números.";
}

export function validateCroState(value: string): string | null {
  return UF_PATTERN.test(value.trim())
    ? null
    : "A UF deve ter 2 letras (ex.: SP).";
}
