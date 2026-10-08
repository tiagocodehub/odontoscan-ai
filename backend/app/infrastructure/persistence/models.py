"""Modelos ORM (SQLModel) do histórico e da autenticação.

SQLite na v1 (ADR-0007). O `create_all` roda no lifespan; **Alembic fica para a
migração a Postgres**. Campos JSON (`crop`, `summary`, `findings`, `plan`) são
guardados como TEXT e (de)serializados na camada de repositório, mantendo o
modelo portável sem depender do tipo JSON específico do dialeto.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Instante atual em UTC (aware); o SQLModel normaliza para UTC na leitura."""
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)
    email: str = Field(index=True, unique=True, max_length=320)
    cro_number: str = Field(max_length=20)
    cro_state: str = Field(max_length=2)
    password_hash: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=utcnow)


class Patient(SQLModel, table=True):
    __tablename__ = "patients"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=200)
    notes: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class Analysis(SQLModel, table=True):
    """Histórico de análise. A imagem NÃO é armazenada (LGPD): só metadados."""

    __tablename__ = "analyses"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    patient_id: int | None = Field(default=None, foreign_key="patients.id", index=True)
    analysis_id: str = Field(index=True, max_length=64)
    created_at: datetime = Field(default_factory=utcnow)
    image_sha256: str = Field(max_length=64)
    image_width: int
    image_height: int
    image_format: str = Field(max_length=16)
    crop_json: str | None = Field(default=None)
    model_version: str = Field(max_length=64)
    model_runtime: str = Field(max_length=32)
    threshold: float
    nms_iou: float
    summary_json: str
    findings_json: str
    plan_json: str | None = Field(default=None)
    notes: str | None = Field(default=None)


class RefreshToken(SQLModel, table=True):
    """Refresh token opaco: guarda apenas o hash sha256, nunca o valor em claro."""

    __tablename__ = "refresh_tokens"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(index=True, unique=True, max_length=64)
    expires_at: datetime
    revoked_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
