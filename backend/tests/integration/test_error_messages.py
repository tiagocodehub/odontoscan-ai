"""Mensagens de erro 422 devem ser específicas do endpoint (não vazar 'image' fora do /analyze)."""

from __future__ import annotations


def test_422_fora_do_analyze_lista_os_campos(client):
    response = client.post("/api/v1/auth/register", json={"name": "Sem o resto"})

    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "INVALID_INPUT"
    assert "image" not in body["message"]
    assert any(
        field in body["message"] for field in ("email", "password", "cro_number", "cro_state")
    )


def test_422_do_login_menciona_campos(client):
    response = client.post("/api/v1/auth/login", json={})

    assert response.status_code == 422
    assert "image" not in response.json()["error"]["message"]


def test_422_do_analyze_mantem_a_mensagem_de_imagem(client):
    response = client.post("/api/v1/analyze", data={"foo": "bar"})

    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "INVALID_INPUT"
    assert "image" in body["message"]
