"""Fixtures compartilhadas dos testes."""

from __future__ import annotations

import io
import os

# Deve ser definido ANTES de importar `app.main` (Settings.jwt_secret é obrigatório).
os.environ.setdefault("JWT_SECRET", "test-secret-para-testes-com-mais-de-32-chars")

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app

TEST_JWT_SECRET = "test-secret-para-testes-com-mais-de-32-chars"


def make_settings(**overrides) -> Settings:
    defaults = dict(
        max_upload_mb=15,
        conf_threshold=0.40,
        nms_iou=0.45,
        max_concurrency=2,
        model_path="",
        allow_stub_fallback=True,
        cors_origins="http://localhost:3000",
        image_size=640,
        max_image_dimension=10_000,
        jwt_secret=TEST_JWT_SECRET,
    )
    defaults.update(overrides)
    return Settings(**defaults)


def make_png_bytes(width: int = 2880, height: int = 1440) -> bytes:
    image = Image.new("RGB", (width, height), (170, 170, 170))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


DEFAULT_PASSWORD = "segredo-forte"


def register(
    client: TestClient,
    email: str = "ana@clinica.com",
    name: str = "Dra. Ana",
    cro_number: str = "12345",
    cro_state: str = "SP",
    password: str = DEFAULT_PASSWORD,
) -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": name,
            "email": email,
            "cro_number": cro_number,
            "cro_state": cro_state,
            "password": password,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def login(
    client: TestClient,
    email: str = "ana@clinica.com",
    password: str = DEFAULT_PASSWORD,
) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def create_patient(
    client: TestClient,
    headers: dict[str, str],
    name: str = "Maria S.",
    notes: str | None = "opcional",
) -> dict:
    response = client.post(
        "/api/v1/patients",
        json={"name": name, "notes": notes},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def analyze_image(
    client: TestClient,
    image_bytes: bytes,
    headers: dict[str, str] | None = None,
    patient_id: int | None = None,
):
    data = {}
    if patient_id is not None:
        data["patient_id"] = str(patient_id)
    return client.post(
        "/api/v1/analyze",
        files={"image": ("radiografia.png", image_bytes, "image/png")},
        data=data,
        headers=headers or {},
    )


@pytest.fixture
def png_bytes() -> bytes:
    return make_png_bytes()


@pytest.fixture
def app(tmp_path):
    db_url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    return create_app(make_settings(database_url=db_url))


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
