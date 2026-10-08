"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getAuthState,
  login,
  logout,
  register,
  restoreSession,
  subscribe,
} from "@/lib/auth";
import type { AuthState } from "@/lib/auth";

/**
 * Hook de sessao. Consome o store externo de `lib/auth.ts` via
 * `useSyncExternalStore` e dispara a restauracao automatica no primeiro mount
 * (renova o refresh token persistido, se houver).
 */

/** Snapshot deterministico no servidor: evita mismatch de hidratacao. */
const SERVER_STATE: AuthState = { status: "loading", user: null, error: null };

function getServerSnapshot(): AuthState {
  return SERVER_STATE;
}

export function useAuth(): AuthState & {
  login: typeof login;
  register: typeof register;
  logout: typeof logout;
} {
  const state = useSyncExternalStore(subscribe, getAuthState, getServerSnapshot);

  useEffect(() => {
    void restoreSession();
  }, []);

  return { ...state, login, register, logout };
}
