"""Testes de integração das rotas /api/v1/analyses (histórico)."""

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


def _create_analysis(
    client: TestClient,
    headers: dict[str, str],
    png_bytes: bytes,
    patient_id: int | None = None,
) -> dict:
    response = analyze_image(client, png_bytes, headers=headers, patient_id=patient_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["persisted"] is True
    assert isinstance(body["record_id"], int)
    return body


def test_historico_list_get_put_delete(client, png_bytes):
    headers = _login(client, "ana@clinica.com")
    analyzed = _create_analysis(client, headers, png_bytes)
    record_id = analyzed["record_id"]

    listing = client.get("/api/v1/analyses", headers=headers)
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    item = items[0]
    assert item["record_id"] == record_id
    assert item["analysis_id"] == analyzed["analysis_id"]
    assert item["summary"]["total"] == len(analyzed["findings"])
    assert "findings" not in item
    assert "plan" not in item
    assert item["image"]["sha256"] == analyzed["image"]["sha256"]
    assert item["patient"] is None

    detail = client.get(f"/api/v1/analyses/{record_id}", headers=headers)
    assert detail.status_code == 200
    detail_body = detail.json()
    assert len(detail_body["findings"]) == len(analyzed["findings"])
    assert detail_body["plan"] is None

    updated = client.put(
        f"/api/v1/analyses/{record_id}",
        json={"notes": "Acompanhar em 6 meses", "plan": [{"step": "restauracao"}]},
        headers=headers,
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["notes"] == "Acompanhar em 6 meses"
    assert updated_body["plan"] == [{"step": "restauracao"}]

    deleted = client.delete(f"/api/v1/analyses/{record_id}", headers=headers)
    assert deleted.status_code == 204

    missing = client.get(f"/api/v1/analyses/{record_id}", headers=headers)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"


def test_put_vincula_paciente(client, png_bytes):
    headers = _login(client, "ana@clinica.com")
    patient = create_patient(client, headers, name="Maria S.")
    analyzed = _create_analysis(client, headers, png_bytes)

    updated = client.put(
        f"/api/v1/analyses/{analyzed['record_id']}",
        json={"patient_id": patient["id"]},
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["patient"] == {"id": patient["id"], "name": "Maria S."}


def test_put_plan_tipado_tolera_extras(client, png_bytes):
    headers = _login(client, "ana@clinica.com")
    analyzed = _create_analysis(client, headers, png_bytes)

    item = {
        "title": "Restauração",
        "detail": "Dente 26",
        "urgency": "eletiva",
        "note": "retorno em 30 dias",
        "included": True,
        "extra_do_frontend": "preservado",
    }
    updated = client.put(
        f"/api/v1/analyses/{analyzed['record_id']}",
        json={"plan": [item]},
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["plan"] == [item]


def test_put_plan_aceita_contrato_minimo_do_frontend(client, png_bytes):
    headers = _login(client, "ana@clinica.com")
    analyzed = _create_analysis(client, headers, png_bytes)

    updated = client.put(
        f"/api/v1/analyses/{analyzed['record_id']}",
        json={"plan": [{"title": "Profilaxia", "detail": "Semestral"}]},
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["plan"] == [{"title": "Profilaxia", "detail": "Semestral"}]


def test_put_plan_tipo_invalido_422(client, png_bytes):
    headers = _login(client, "ana@clinica.com")
    analyzed = _create_analysis(client, headers, png_bytes)

    response = client.put(
        f"/api/v1/analyses/{analyzed['record_id']}",
        json={"plan": "nao-e-uma-lista"},
        headers=headers,
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"


def test_filtro_por_patient_id(client, png_bytes):
    headers = _login(client, "ana@clinica.com")
    patient = create_patient(client, headers, name="Maria S.")

    com_paciente = _create_analysis(client, headers, png_bytes, patient_id=patient["id"])
    _create_analysis(client, headers, png_bytes)

    filtered = client.get(
        "/api/v1/analyses", params={"patient_id": patient["id"]}, headers=headers
    )
    assert filtered.status_code == 200
    assert [r["record_id"] for r in filtered.json()] == [com_paciente["record_id"]]

    all_records = client.get("/api/v1/analyses", headers=headers).json()
    assert len(all_records) == 2


def test_delete_paciente_remove_analises_em_cascata(client, png_bytes):
    headers = _login(client, "ana@clinica.com")
    patient = create_patient(client, headers, name="Maria S.")
    analyzed = _create_analysis(client, headers, png_bytes, patient_id=patient["id"])

    assert (
        client.delete(f"/api/v1/patients/{patient['id']}", headers=headers).status_code
        == 204
    )

    assert client.get("/api/v1/analyses", headers=headers).json() == []
    assert (
        client.get(f"/api/v1/analyses/{analyzed['record_id']}", headers=headers).status_code
        == 404
    )


def test_isolamento_entre_usuarios(client, png_bytes):
    headers_a = _login(client, "ana@clinica.com")
    headers_b = _login(client, "bruno@clinica.com")
    analyzed = _create_analysis(client, headers_a, png_bytes)

    assert client.get("/api/v1/analyses", headers=headers_b).json() == []
    assert (
        client.get(
            f"/api/v1/analyses/{analyzed['record_id']}", headers=headers_b
        ).status_code
        == 404
    )
    assert (
        client.put(
            f"/api/v1/analyses/{analyzed['record_id']}",
            json={"notes": "hack"},
            headers=headers_b,
        ).status_code
        == 404
    )


def test_analises_exigem_autenticacao(client):
    assert client.get("/api/v1/analyses").status_code == 401
    assert client.get("/api/v1/analyses/1").status_code == 401
    assert client.delete("/api/v1/analyses/1").status_code == 401
