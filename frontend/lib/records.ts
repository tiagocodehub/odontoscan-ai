import { jsonInit, requestJson } from "@/lib/http";
import type {
  AnalysisRecordDetail,
  AnalysisRecordSummary,
  Patient,
  UpdateAnalysisInput,
} from "@/lib/types";

/**
 * Acesso autenticado a pacientes e historico de analises.
 * Espelha a secao "Autenticacao e historico (Etapa 4)" de `docs/api-contract.md`.
 */

/**
 * Normaliza a lista devolvida por `GET /patients`/`GET /analyses`.
 * O contrato define uma lista; aceitamos tambem o formato envelopado por
 * robustez, sem mascarar ausencia de dados (retorna `[]`).
 */
function normalizeList<T>(value: unknown, keys: readonly string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value !== null && typeof value === "object") {
    for (const key of keys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate as T[];
    }
  }
  return [];
}

export async function listPatients(): Promise<Patient[]> {
  const data = await requestJson<unknown>("/patients");
  return normalizeList<Patient>(data, ["patients", "items", "data"]);
}

export function createPatient(input: {
  name: string;
  notes?: string;
}): Promise<Patient> {
  return requestJson<Patient>("/patients", jsonInit("POST", input));
}

export function deletePatient(id: number): Promise<void> {
  return requestJson<void>(`/patients/${id}`, { method: "DELETE" });
}

export async function listAnalyses(
  patientId?: number | null,
): Promise<AnalysisRecordSummary[]> {
  const query = patientId != null ? `?patient_id=${patientId}` : "";
  const data = await requestJson<unknown>(`/analyses${query}`);
  return normalizeList<AnalysisRecordSummary>(data, ["analyses", "items", "data"]);
}

export function getAnalysis(recordId: number): Promise<AnalysisRecordDetail> {
  return requestJson<AnalysisRecordDetail>(`/analyses/${recordId}`);
}

export function updateAnalysis(
  recordId: number,
  input: UpdateAnalysisInput,
): Promise<AnalysisRecordDetail> {
  return requestJson<AnalysisRecordDetail>(
    `/analyses/${recordId}`,
    jsonInit("PUT", input),
  );
}

export function deleteAnalysis(recordId: number): Promise<void> {
  return requestJson<void>(`/analyses/${recordId}`, { method: "DELETE" });
}
