"""Rotas do histórico de análises do usuário autenticado (Etapa 4)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_analysis_use_cases, get_current_user
from app.api.schemas import (
    AnalysisListItemOut,
    AnalysisRecordOut,
    AnalysisUpdateRequest,
    analysis_list_item_out,
    analysis_record_out,
)
from app.application.ports import UserData
from app.application.records import AnalysisUseCases

router = APIRouter(prefix="/api/v1/analyses", tags=["analyses"])


@router.get("", response_model=list[AnalysisListItemOut])
def list_analyses(
    patient_id: int | None = Query(default=None),
    user: UserData = Depends(get_current_user),
    use_cases: AnalysisUseCases = Depends(get_analysis_use_cases),
) -> list[AnalysisListItemOut]:
    records = use_cases.list(user.id, patient_id)
    return [analysis_list_item_out(record) for record in records]


@router.get("/{record_id}", response_model=AnalysisRecordOut)
def get_analysis(
    record_id: int,
    user: UserData = Depends(get_current_user),
    use_cases: AnalysisUseCases = Depends(get_analysis_use_cases),
) -> AnalysisRecordOut:
    return analysis_record_out(use_cases.get(user.id, record_id))


@router.put("/{record_id}", response_model=AnalysisRecordOut)
def update_analysis(
    record_id: int,
    payload: AnalysisUpdateRequest,
    user: UserData = Depends(get_current_user),
    use_cases: AnalysisUseCases = Depends(get_analysis_use_cases),
) -> AnalysisRecordOut:
    provided = payload.model_dump(exclude_unset=True)
    record = use_cases.update(user.id, record_id, **provided)
    return analysis_record_out(record)


@router.delete("/{record_id}", status_code=204)
def delete_analysis(
    record_id: int,
    user: UserData = Depends(get_current_user),
    use_cases: AnalysisUseCases = Depends(get_analysis_use_cases),
) -> Response:
    use_cases.delete(user.id, record_id)
    return Response(status_code=204)
