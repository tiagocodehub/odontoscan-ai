"""Casos de uso do histórico: pacientes e análises (sem FastAPI/ORM)."""

from __future__ import annotations

from typing import Any

from app.application.errors import RecordNotFoundError
from app.application.ports import (
    UNSET,
    AnalysisData,
    AnalysisRepository,
    NewAnalysis,
    PatientData,
    PatientRepository,
)


class PatientUseCases:
    def __init__(
        self,
        *,
        patients: PatientRepository,
        analyses: AnalysisRepository,
    ) -> None:
        self._patients = patients
        self._analyses = analyses

    def list(self, user_id: int) -> list[PatientData]:
        return self._patients.list(user_id)

    def create(self, user_id: int, *, name: str, notes: str | None) -> PatientData:
        return self._patients.create(user_id, name=name.strip(), notes=notes)

    def get(self, user_id: int, patient_id: int) -> PatientData:
        patient = self._patients.get(user_id, patient_id)
        if patient is None:
            raise RecordNotFoundError()
        return patient

    def delete(self, user_id: int, patient_id: int) -> None:
        if not self._patients.delete(user_id, patient_id):
            raise RecordNotFoundError()


class AnalysisUseCases:
    def __init__(
        self,
        *,
        analyses: AnalysisRepository,
        patients: PatientRepository,
    ) -> None:
        self._analyses = analyses
        self._patients = patients

    def persist(self, user_id: int, data: NewAnalysis) -> AnalysisData:
        if data.patient_id is not None:
            self._ensure_patient(user_id, data.patient_id)
        return self._analyses.create(user_id, data)

    def list(
        self, user_id: int, patient_id: int | None = None
    ) -> list[AnalysisData]:
        return self._analyses.list(user_id, patient_id)

    def get(self, user_id: int, record_id: int) -> AnalysisData:
        record = self._analyses.get(user_id, record_id)
        if record is None:
            raise RecordNotFoundError()
        return record

    def update(
        self,
        user_id: int,
        record_id: int,
        *,
        patient_id: Any = UNSET,
        notes: Any = UNSET,
        plan: Any = UNSET,
    ) -> AnalysisData:
        if patient_id is not UNSET and patient_id is not None:
            self._ensure_patient(user_id, patient_id)

        record = self._analyses.update(
            user_id,
            record_id,
            patient_id=patient_id,
            notes=notes,
            plan=plan,
        )
        if record is None:
            raise RecordNotFoundError()
        return record

    def delete(self, user_id: int, record_id: int) -> None:
        if not self._analyses.delete(user_id, record_id):
            raise RecordNotFoundError()

    def _ensure_patient(self, user_id: int, patient_id: int) -> None:
        if self._patients.get(user_id, patient_id) is None:
            raise RecordNotFoundError()
