"""Repositórios concretos (SQLModel). ORM parametrizado — nunca SQL concatenado.

Toda consulta de paciente/análise é escopada por `user_id`, de modo que recursos
de outro usuário simplesmente "não existem" (404 na API).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.application.errors import DuplicateEmailError
from app.application.ports import (
    UNSET,
    AnalysisData,
    NewAnalysis,
    PatientData,
    RefreshTokenData,
    UserData,
)
from app.infrastructure.persistence.models import (
    Analysis,
    Patient,
    RefreshToken,
    User,
    utcnow,
)


def _as_int(value: int | None) -> int:
    if value is None:
        raise RuntimeError("Identificador ausente após persistência.")
    return value


# ---------------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------------


def _user_to_data(user: User) -> UserData:
    return UserData(
        id=_as_int(user.id),
        name=user.name,
        email=user.email,
        cro_number=user.cro_number,
        cro_state=user.cro_state,
        password_hash=user.password_hash,
        created_at=user.created_at,
    )


class SqlUserRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        *,
        name: str,
        email: str,
        cro_number: str,
        cro_state: str,
        password_hash: str,
    ) -> UserData:
        user = User(
            name=name,
            email=email,
            cro_number=cro_number,
            cro_state=cro_state,
            password_hash=password_hash,
        )
        self._session.add(user)
        try:
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise DuplicateEmailError() from exc
        self._session.refresh(user)
        return _user_to_data(user)

    def get_by_email(self, email: str) -> UserData | None:
        user = self._session.exec(select(User).where(User.email == email)).first()
        return _user_to_data(user) if user else None

    def get_by_id(self, user_id: int) -> UserData | None:
        user = self._session.get(User, user_id)
        return _user_to_data(user) if user else None


# ---------------------------------------------------------------------------
# Pacientes
# ---------------------------------------------------------------------------


def _patient_to_data(patient: Patient) -> PatientData:
    return PatientData(
        id=_as_int(patient.id),
        user_id=patient.user_id,
        name=patient.name,
        notes=patient.notes,
        created_at=patient.created_at,
    )


class SqlPatientRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list(self, user_id: int) -> list[PatientData]:
        statement = (
            select(Patient)
            .where(Patient.user_id == user_id)
            .order_by(Patient.created_at.desc(), Patient.id.desc())
        )
        return [_patient_to_data(row) for row in self._session.exec(statement).all()]

    def create(self, user_id: int, *, name: str, notes: str | None) -> PatientData:
        patient = Patient(user_id=user_id, name=name, notes=notes)
        self._session.add(patient)
        self._session.commit()
        self._session.refresh(patient)
        return _patient_to_data(patient)

    def get(self, user_id: int, patient_id: int) -> PatientData | None:
        patient = self._session.exec(
            select(Patient).where(Patient.id == patient_id, Patient.user_id == user_id)
        ).first()
        return _patient_to_data(patient) if patient else None

    def delete(self, user_id: int, patient_id: int) -> bool:
        patient = self._session.exec(
            select(Patient).where(Patient.id == patient_id, Patient.user_id == user_id)
        ).first()
        if patient is None:
            return False
        self._session.exec(
            delete(Analysis).where(
                Analysis.user_id == user_id,
                Analysis.patient_id == patient_id,
            )
        )
        self._session.delete(patient)
        self._session.commit()
        return True


# ---------------------------------------------------------------------------
# Análises (histórico)
# ---------------------------------------------------------------------------


def _analysis_to_data(
    row: Analysis, patient_name: str | None = None
) -> AnalysisData:
    return AnalysisData(
        id=_as_int(row.id),
        user_id=row.user_id,
        patient_id=row.patient_id,
        analysis_id=row.analysis_id,
        created_at=row.created_at,
        image_sha256=row.image_sha256,
        image_width=row.image_width,
        image_height=row.image_height,
        image_format=row.image_format,
        crop=json.loads(row.crop_json) if row.crop_json else None,
        model_version=row.model_version,
        model_runtime=row.model_runtime,
        threshold=row.threshold,
        nms_iou=row.nms_iou,
        summary=json.loads(row.summary_json),
        findings=json.loads(row.findings_json),
        plan=json.loads(row.plan_json) if row.plan_json else None,
        notes=row.notes,
        patient_name=patient_name,
    )


class SqlAnalysisRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, user_id: int, data: NewAnalysis) -> AnalysisData:
        row = Analysis(
            user_id=user_id,
            patient_id=data.patient_id,
            analysis_id=data.analysis_id,
            image_sha256=data.image_sha256,
            image_width=data.image_width,
            image_height=data.image_height,
            image_format=data.image_format,
            crop_json=json.dumps(data.crop) if data.crop is not None else None,
            model_version=data.model_version,
            model_runtime=data.model_runtime,
            threshold=data.threshold,
            nms_iou=data.nms_iou,
            summary_json=json.dumps(data.summary, ensure_ascii=False),
            findings_json=json.dumps(data.findings, ensure_ascii=False),
            plan_json=None,
        )
        self._session.add(row)
        self._session.commit()
        self._session.refresh(row)
        return _analysis_to_data(row, self._patient_name(data.patient_id))

    def list(self, user_id: int, patient_id: int | None = None) -> list[AnalysisData]:
        statement = select(Analysis, Patient).join(
            Patient,
            Analysis.patient_id == Patient.id,
            isouter=True,
        ).where(Analysis.user_id == user_id)
        if patient_id is not None:
            statement = statement.where(Analysis.patient_id == patient_id)
        statement = statement.order_by(
            Analysis.created_at.desc(), Analysis.id.desc()
        )
        return [
            _analysis_to_data(row, patient.name if patient else None)
            for row, patient in self._session.exec(statement).all()
        ]

    def get(self, user_id: int, record_id: int) -> AnalysisData | None:
        found = self._get_row_with_patient(user_id, record_id)
        if found is None:
            return None
        row, patient = found
        return _analysis_to_data(row, patient.name if patient else None)

    def update(
        self,
        user_id: int,
        record_id: int,
        *,
        patient_id: Any = UNSET,
        notes: Any = UNSET,
        plan: Any = UNSET,
    ) -> AnalysisData | None:
        row = self._get_row(user_id, record_id)
        if row is None:
            return None

        if patient_id is not UNSET:
            row.patient_id = patient_id
        if notes is not UNSET:
            row.notes = notes
        if plan is not UNSET:
            row.plan_json = json.dumps(plan, ensure_ascii=False) if plan is not None else None

        self._session.add(row)
        self._session.commit()
        self._session.refresh(row)
        return _analysis_to_data(row, self._patient_name(row.patient_id))

    def delete(self, user_id: int, record_id: int) -> bool:
        row = self._get_row(user_id, record_id)
        if row is None:
            return False
        self._session.delete(row)
        self._session.commit()
        return True

    def _get_row(self, user_id: int, record_id: int) -> Analysis | None:
        return self._session.exec(
            select(Analysis).where(
                Analysis.id == record_id,
                Analysis.user_id == user_id,
            )
        ).first()

    def _get_row_with_patient(
        self, user_id: int, record_id: int
    ) -> tuple[Analysis, Patient | None] | None:
        return self._session.exec(
            select(Analysis, Patient)
            .join(Patient, Analysis.patient_id == Patient.id, isouter=True)
            .where(Analysis.id == record_id, Analysis.user_id == user_id)
        ).first()

    def _patient_name(self, patient_id: int | None) -> str | None:
        if patient_id is None:
            return None
        patient = self._session.get(Patient, patient_id)
        return patient.name if patient else None


# ---------------------------------------------------------------------------
# Refresh tokens
# ---------------------------------------------------------------------------


def _refresh_to_data(row: RefreshToken) -> RefreshTokenData:
    return RefreshTokenData(
        id=_as_int(row.id),
        user_id=row.user_id,
        token_hash=row.token_hash,
        expires_at=row.expires_at,
        revoked_at=row.revoked_at,
        created_at=row.created_at,
    )


class SqlRefreshTokenStore:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, user_id: int, token_hash: str, expires_at: datetime) -> None:
        row = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self._session.add(row)
        self._session.commit()

    def get(self, token_hash: str) -> RefreshTokenData | None:
        row = self._session.exec(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        ).first()
        return _refresh_to_data(row) if row else None

    def revoke(self, token_hash: str) -> None:
        row = self._session.exec(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        ).first()
        if row is not None and row.revoked_at is None:
            row.revoked_at = utcnow()
            self._session.add(row)
            self._session.commit()

    def revoke_all_for_user(self, user_id: int) -> int:
        """Revoga todos os refresh ainda ativos do usuário (detecção de roubo)."""
        rows = self._session.exec(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
        ).all()
        if not rows:
            return 0
        now = utcnow()
        for row in rows:
            row.revoked_at = now
            self._session.add(row)
        self._session.commit()
        return len(rows)
