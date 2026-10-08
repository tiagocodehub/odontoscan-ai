"""Testes dos validadores de Settings (pydantic.Field)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_defaults_validos():
    settings = Settings(jwt_secret="test-secret-para-testes")

    assert settings.max_upload_bytes == 15 * 1024 * 1024
    assert settings.max_frames == 1
    assert settings.cors_origins_list == ["http://localhost:3000"]
    assert settings.database_url == "sqlite:///./data/odontoscan.db"
    assert settings.access_token_minutes == 15
    assert settings.refresh_token_days == 7
    assert settings.login_rate_limit == 5
    assert settings.login_ip_rate_limit == 20
    assert settings.jwt_algorithm == "HS256"


def test_jwt_secret_obrigatorio(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(ValidationError):
        Settings()


def test_jwt_secret_curto_rejeitado():
    with pytest.raises(ValidationError):
        Settings(jwt_secret="curto")


@pytest.mark.parametrize(
    "overrides",
    [
        {"max_concurrency": 0},
        {"conf_threshold": -0.1},
        {"conf_threshold": 1.1},
        {"nms_iou": -0.1},
        {"nms_iou": 1.5},
        {"image_size": 0},
        {"max_upload_mb": 0},
        {"max_image_dimension": 0},
        {"max_frames": 0},
        {"login_rate_limit": 0},
        {"login_ip_rate_limit": 0},
    ],
)
def test_valores_invalidos_rejeitados(overrides):
    with pytest.raises(ValidationError):
        Settings(**overrides)
