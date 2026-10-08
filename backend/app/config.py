"""Configuração da aplicação via pydantic-settings (lê `.env` quando presente)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Parâmetros do servidor, alinhados a `docs/api-contract.md` (seção Parâmetros)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    max_upload_mb: int = Field(15, ge=1)
    conf_threshold: float = Field(0.40, ge=0, le=1)
    nms_iou: float = Field(0.45, ge=0, le=1)
    max_concurrency: int = Field(2, ge=1)
    model_path: str = ""
    allow_stub_fallback: bool = True
    cors_origins: str = "http://localhost:3000"

    image_size: int = Field(640, gt=0)
    max_image_dimension: int = Field(10_000, gt=0)
    max_frames: int = Field(1, ge=1)
    labels_path: str = "models/labels.json"

    # Reforço contra "quadros de laudo": recorta a faixa da panorâmica antes da inferência.
    auto_crop_panorama: bool = True
    crop_min_gain: float = Field(0.05, ge=0.0, le=0.9)

    # Descarta detecções sobre material radiopaco (restauração/implante/coroa).
    # DESLIGADO por padrão: medido no val do DENTEX, o filtro remove mais
    # verdadeiros positivos que falsos positivos (recall 0,48 -> 0,40). Mantido
    # para experimentação/calibração com um modelo de caixas mais precisas.
    suppress_radiopaque: bool = False
    radiopaque_threshold: float = Field(0.35, ge=0.0, le=1.0)
    radiopaque_intensity: int = Field(200, ge=0, le=255)

    # --- Etapa 4: autenticação + histórico (ADR-0007) ---
    # SQLite na v1; a migração a Postgres troca DATABASE_URL e adiciona Alembic.
    database_url: str = "sqlite:///./data/odontoscan.db"
    # OBRIGATÓRIO: sem default; falha rápido na inicialização se ausente/fraco.
    jwt_secret: str = Field(..., min_length=16)
    access_token_minutes: int = Field(15, ge=1, le=60)
    refresh_token_days: int = Field(7, ge=1, le=60)
    login_rate_limit: int = Field(5, ge=1)
    # Limite isolado por IP (impede burlar o limite por (IP, e-mail) rotacionando o e-mail).
    login_ip_rate_limit: int = Field(20, ge=1)
    jwt_algorithm: str = "HS256"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
