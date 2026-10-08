"use client";

import { useCallback, useId, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "@/lib/errors";
import { useAuth } from "@/lib/useAuth";
import {
  validateCroNumber,
  validateCroState,
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/auth-validation";

type Mode = "login" | "register";

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  cro_number?: string;
  cro_state?: string;
}

/**
 * Painel de conta (Etapa 4) exibido no cabecalho.
 *
 * - Anonimo: alterna **Entrar / Criar conta** com validacao client-side.
 * - Autenticado: mostra o usuario (nome + CRO) e o botao **Sair**.
 *
 * Erros da API vem do envelope (`code`/`message`); **429** ganha aviso de
 * "muitas tentativas". Nunca loga senha/token.
 */
export default function AuthPanel({ className }: { className?: string }) {
  const { status, user, logout, login, register } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [croNumber, setCroNumber] = useState("");
  const [croState, setCroState] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const baseId = useId();

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setFieldErrors({});
    setApiError(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;

      const errors: FieldErrors = {};
      if (mode === "register") {
        const nameError = validateName(name);
        if (nameError) errors.name = nameError;
        const croNumberError = validateCroNumber(croNumber);
        if (croNumberError) errors.cro_number = croNumberError;
        const croStateError = validateCroState(croState);
        if (croStateError) errors.cro_state = croStateError;
      }
      const emailError = validateEmail(email);
      if (emailError) errors.email = emailError;
      const passwordError = validatePassword(password);
      if (passwordError) errors.password = passwordError;

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setApiError(null);
        return;
      }

      setFieldErrors({});
      setApiError(null);
      setSubmitting(true);
      try {
        if (mode === "login") {
          await login(email.trim(), password);
        } else {
          await register({
            name: name.trim(),
            email: email.trim(),
            cro_number: croNumber.trim(),
            cro_state: croState.trim().toUpperCase(),
            password,
          });
        }
      } catch (error) {
        setApiError(
          error instanceof ApiError
            ? error
            : new ApiError("Falha inesperada. Tente novamente.", {
                code: "UNKNOWN",
                status: 0,
              }),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [croNumber, croState, email, login, mode, name, password, register, submitting],
  );

  if (status === "authenticated" && user) {
    return (
      <div className={["flex items-center gap-3", className ?? ""].join(" ")}>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">{user.name}</p>
          <p className="text-xs text-slate-500">
            CRO {user.cro_number}/{user.cro_state}
            <span className="hidden sm:inline"> · {user.email}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          Sair
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <p
        role="status"
        className={["text-xs text-slate-500", className ?? ""].join(" ")}
      >
        Carregando sessão…
      </p>
    );
  }

  const isRegister = mode === "register";
  const rateLimited =
    apiError !== null &&
    (apiError.status === 429 || apiError.code === "RATE_LIMITED");

  return (
    <div
      className={[
        "w-full rounded-xl border border-slate-200 bg-white p-3 sm:w-96",
        className ?? "",
      ].join(" ")}
    >
      <div role="tablist" aria-label="Acesso" className="mb-3 flex gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={!isRegister}
          onClick={() => switchMode("login")}
          className={[
            "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none",
            !isRegister ? "bg-sky-700 text-white" : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isRegister}
          onClick={() => switchMode("register")}
          className={[
            "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none",
            isRegister ? "bg-sky-700 text-white" : "text-slate-600 hover:bg-slate-100",
          ].join(" ")}
        >
          Criar conta
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-2">
        {isRegister ? (
          <div className="space-y-1">
            <label
              htmlFor={`${baseId}-name`}
              className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            >
              Nome
            </label>
            <input
              id={`${baseId}-name`}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-required="true"
              aria-invalid={fieldErrors.name !== undefined}
              aria-describedby={fieldErrors.name ? `${baseId}-name-error` : undefined}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
            />
            {fieldErrors.name ? (
              <p id={`${baseId}-name-error`} role="alert" className="text-xs text-red-700">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1">
          <label
            htmlFor={`${baseId}-email`}
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            E-mail
          </label>
          <input
            id={`${baseId}-email`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-required="true"
            aria-invalid={fieldErrors.email !== undefined}
            aria-describedby={fieldErrors.email ? `${baseId}-email-error` : undefined}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          />
          {fieldErrors.email ? (
            <p id={`${baseId}-email-error`} role="alert" className="text-xs text-red-700">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        {isRegister ? (
          <div className="grid grid-cols-[1fr_4.5rem] gap-2">
            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-cro-number`}
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                CRO (nº)
              </label>
              <input
                id={`${baseId}-cro-number`}
                type="text"
                inputMode="numeric"
                value={croNumber}
                onChange={(event) => setCroNumber(event.target.value)}
                aria-required="true"
                aria-invalid={fieldErrors.cro_number !== undefined}
                aria-describedby={
                  fieldErrors.cro_number ? `${baseId}-cro-number-error` : undefined
                }
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
              />
              {fieldErrors.cro_number ? (
                <p
                  id={`${baseId}-cro-number-error`}
                  role="alert"
                  className="text-xs text-red-700"
                >
                  {fieldErrors.cro_number}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-cro-state`}
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                UF
              </label>
              <input
                id={`${baseId}-cro-state`}
                type="text"
                maxLength={2}
                value={croState}
                onChange={(event) => setCroState(event.target.value)}
                aria-required="true"
                aria-invalid={fieldErrors.cro_state !== undefined}
                aria-describedby={
                  fieldErrors.cro_state ? `${baseId}-cro-state-error` : undefined
                }
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm uppercase text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
              />
              {fieldErrors.cro_state ? (
                <p
                  id={`${baseId}-cro-state-error`}
                  role="alert"
                  className="text-xs text-red-700"
                >
                  {fieldErrors.cro_state}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-1">
          <label
            htmlFor={`${baseId}-password`}
            className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            Senha
          </label>
          <input
            id={`${baseId}-password`}
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-required="true"
            aria-invalid={fieldErrors.password !== undefined}
            aria-describedby={
              fieldErrors.password ? `${baseId}-password-error` : undefined
            }
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          />
          {fieldErrors.password ? (
            <p
              id={`${baseId}-password-error`}
              role="alert"
              className="text-xs text-red-700"
            >
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        {apiError ? (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-800 ring-1 ring-inset ring-red-200">
            {apiError.message}
          </p>
        ) : null}

        {rateLimited ? (
          <p role="alert" className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-300">
            Muitas tentativas de acesso. Aguarde um instante e tente novamente.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 motion-reduce:transition-none"
        >
          {submitting
            ? "Enviando…"
            : isRegister
              ? "Criar conta"
              : "Entrar"}
        </button>

        <p className="text-[11px] leading-relaxed text-slate-500">
          Seus dados de acesso ficam sob seu controle. A imagem analisada não é
          armazenada.
        </p>
      </form>
    </div>
  );
}
