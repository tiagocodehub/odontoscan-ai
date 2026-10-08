"""Testes de integração das rotas /api/v1/patients (CRUD + isolamento)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import auth_headers, create_patient, login, register


def _login(client: TestClient, email: str) -> dict:
    register(client, email=email, name="Dr. Teste")
    return login(client, email=email)


def test_crud_pacientes(client):
    headers = auth_headers(_login(client, "ana@clinica.com"))

    created = create_patient(client, headers, name="Maria S.", notes="Alergia")
    assert created["name"] == "Maria S."
    assert created["notes"] == "Alergia"
    assert created["created_at"].endswith("Z")

    listing = client.get("/api/v1/patients", headers=headers)
    assert listing.status_code == 200
    assert [p["id"] for p in listing.json()] == [created["id"]]

    fetched = client.get(f"/api/v1/patients/{created['id']}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json() == created

    deleted = client.delete(f"/api/v1/patients/{created['id']}", headers=headers)
    assert deleted.status_code == 204

    missing = client.get(f"/api/v1/patients/{created['id']}", headers=headers)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"


def test_pacientes_exigem_autenticacao(client):
    assert client.get("/api/v1/patients").status_code == 401
    assert client.post("/api/v1/patients", json={"name": "X"}).status_code == 401


def test_isolamento_entre_usuarios(client):
    headers_a = auth_headers(_login(client, "ana@clinica.com"))
    headers_b = auth_headers(_login(client, "bruno@clinica.com"))

    patient_a = create_patient(client, headers_a, name="Paciente A")

    assert client.get("/api/v1/patients", headers=headers_b).json() == []
    assert (
        client.get(f"/api/v1/patients/{patient_a['id']}", headers=headers_b).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/v1/patients/{patient_a['id']}", headers=headers_b
        ).status_code
        == 404
    )

    still_there = client.get(
        f"/api/v1/patients/{patient_a['id']}", headers=headers_a
    )
    assert still_there.status_code == 200
