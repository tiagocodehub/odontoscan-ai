"""Testes da persistência do /api/v1/analyze (público, persiste com token)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import (
    analyze_image,
    auth_headers,
    create_patient,
    login,
    register,
)


def _login(client: TestClient, email: str) -> dict:
    register(client, email=email, name="Dr. Teste")
    return auth_headers(login(client, email=email))


def test_analyze_anonimo_nao_persiste(client, png_bytes):
    response = analyze_image(client, png_bytes)

    assert response.status_code == 200
    body = response.json()
    assert body["persisted"] is False
    assert body["record_id"] is None

    assert client.get("/api/v1/analyses").status_code == 401


def test_analyze_com_token_persiste_e_aparece_no_historico(client, png_bytes):
    headers = _login(client, "ana@clinica.com")

    response = analyze_image(client, png_bytes, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["persisted"] is True
    assert isinstance(body["record_id"], int)

    listing = client.get("/api/v1/analyses", headers=headers)
    assert [r["record_id"] for r in listing.json()] == [body["record_id"]]


def test_analyze_token_invalido_trata_como_anonimo(client, png_bytes):
    response = analyze_image(
        client, png_bytes, headers={"Authorization": "Bearer token-invalido"}
    )

    assert response.status_code == 200
    assert response.json()["persisted"] is False


def test_analyze_persiste_com_paciente(client, png_bytes):
    headers = _login(client, "ana@clinica.com")
    patient = create_patient(client, headers, name="Maria S.")

    response = analyze_image(
        client, png_bytes, headers=headers, patient_id=patient["id"]
    )
    assert response.status_code == 200
    record_id = response.json()["record_id"]

    detail = client.get(f"/api/v1/analyses/{record_id}", headers=headers).json()
    assert detail["patient"] == {"id": patient["id"], "name": "Maria S."}


def test_analyze_patient_id_de_outro_usuario_404(client, png_bytes):
    headers_a = _login(client, "ana@clinica.com")
    headers_b = _login(client, "bruno@clinica.com")
    patient_a = create_patient(client, headers_a, name="Paciente A")

    response = analyze_image(
        client, png_bytes, headers=headers_b, patient_id=patient_a["id"]
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_historico_nao_armazena_imagem(client, png_bytes):
    headers = _login(client, "ana@clinica.com")
    record_id = analyze_image(client, png_bytes, headers=headers).json()["record_id"]

    detail = client.get(f"/api/v1/analyses/{record_id}", headers=headers).json()

    assert set(detail["image"]) == {"width", "height", "format", "sha256"}
    assert "bytes" not in detail["image"]
    assert "data" not in detail["image"]
