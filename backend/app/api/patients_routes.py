"""Rotas de pacientes do usuário autenticado (Etapa 4)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.api.deps import get_current_user, get_patient_use_cases
from app.api.schemas import PatientCreateRequest, PatientOut, patient_out
from app.application.ports import UserData
from app.application.records import PatientUseCases

router = APIRouter(prefix="/api/v1/patients", tags=["patients"])


@router.get("", response_model=list[PatientOut])
def list_patients(
    user: UserData = Depends(get_current_user),
    use_cases: PatientUseCases = Depends(get_patient_use_cases),
) -> list[PatientOut]:
    return [patient_out(patient) for patient in use_cases.list(user.id)]


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(
    payload: PatientCreateRequest,
    user: UserData = Depends(get_current_user),
    use_cases: PatientUseCases = Depends(get_patient_use_cases),
) -> PatientOut:
    patient = use_cases.create(user.id, name=payload.name, notes=payload.notes)
    return patient_out(patient)


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(
    patient_id: int,
    user: UserData = Depends(get_current_user),
    use_cases: PatientUseCases = Depends(get_patient_use_cases),
) -> PatientOut:
    return patient_out(use_cases.get(user.id, patient_id))


@router.delete("/{patient_id}", status_code=204)
def delete_patient(
    patient_id: int,
    user: UserData = Depends(get_current_user),
    use_cases: PatientUseCases = Depends(get_patient_use_cases),
) -> Response:
    use_cases.delete(user.id, patient_id)
    return Response(status_code=204)
