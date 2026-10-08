"""Engine/sessão SQLModel, criação do schema e diretório do SQLite.

`create_all()` é chamado no lifespan (ADR-0007). Migrações versionadas (Alembic)
ficam para a ida a Postgres — a v1 não tem dado de produção a migrar.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel

# Importa os modelos para registrá-los em `SQLModel.metadata` antes do create_all.
from app.infrastructure.persistence import models as _models  # noqa: F401


def _ensure_sqlite_directory(database_url: str) -> None:
    """Garante a pasta do arquivo SQLite (ex.: `./data/`)."""
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        return
    raw_path = database_url[len(prefix) :]
    if not raw_path or raw_path == ":memory:":
        return

    path = Path(raw_path)
    if path.parent and str(path.parent) not in ("", "."):
        path.parent.mkdir(parents=True, exist_ok=True)


def build_engine(database_url: str) -> Engine:
    _ensure_sqlite_directory(database_url)

    connect_args: dict[str, object] = {}
    kwargs: dict[str, object] = {"future": True}

    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        if ":memory:" in database_url or database_url in ("sqlite://", "sqlite:///"):
            # Mesma conexão para todas as sessões (testes com banco em memória).
            kwargs["poolclass"] = StaticPool

    return create_engine(database_url, connect_args=connect_args, **kwargs)


def init_db(engine: Engine) -> None:
    SQLModel.metadata.create_all(engine)


@dataclass
class Database:
    """Agrupa engine + fábrica de sessões para injeção no `app.state`."""

    engine: Engine

    @classmethod
    def from_url(cls, database_url: str) -> "Database":
        return cls(engine=build_engine(database_url))

    def create_all(self) -> None:
        init_db(self.engine)

    def session(self) -> Session:
        return Session(self.engine, expire_on_commit=False)

    def dispose(self) -> None:
        self.engine.dispose()
