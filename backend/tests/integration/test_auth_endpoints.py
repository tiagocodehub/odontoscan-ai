"""Testes de integração das rotas /api/v1/auth."""

from __future__ import annotations

import logging

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import auth_headers, login, make_settings, register


def test_register_201(client):
    body = register(client, name="Dra. Ana", email="ana@clinica.com")

    assert body["id"] == 1
    assert body["name"] == "Dra. Ana"
    assert body["email"] == "ana@clinica.com"
    assert body["cro_number"] == "12345"
    assert body["cro_state"] == "SP"
    assert "password" not in body
    assert "password_hash" not in body


def test_register_email_duplicado_409(client):
    register(client, email="ana@clinica.com")

    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Outra",
            "email": "ANA@clinica.com",
            "cro_number": "54321",
            "cro_state": "RJ",
            "password": "outra-senha-forte",
        },
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"


def test_register_senha_curta_422(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Dra. Ana",
            "email": "ana@clinica.com",
            "cro_number": "12345",
            "cro_state": "SP",
            "password": "curta",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"


def test_register_validacoes_invalidas_422(client):
    base = {
        "name": "Dra. Ana",
        "email": "ana@clinica.com",
        "cro_number": "12345",
        "cro_state": "SP",
        "password": "segredo-forte",
    }

    for override in (
        {"email": "nao-e-email"},
        {"cro_state": "SAO"},
        {"cro_number": "12ab"},
        {"name": "A"},
    ):
        response = client.post("/api/v1/auth/register", json={**base, **override})
        assert response.status_code == 422, override


def test_login_200(client):
    register(client)

    body = login(client)

    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "ana@clinica.com"


def test_login_senha_errada_401(client):
    register(client)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "ana@clinica.com", "password": "senha-errada"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_me_com_e_sem_token(client):
    register(client)
    tokens = login(client)

    ok = client.get("/api/v1/auth/me", headers=auth_headers(tokens))
    assert ok.status_code == 200
    assert ok.json()["email"] == "ana@clinica.com"

    sem_token = client.get("/api/v1/auth/me")
    assert sem_token.status_code == 401

    invalido = client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer token-invalido"}
    )
    assert invalido.status_code == 401


def test_refresh_rotaciona_e_invalida_antigo(client):
    register(client)
    tokens = login(client)

    refreshed = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert refreshed.status_code == 200
    new_tokens = refreshed.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    reused = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert reused.status_code == 401
    assert reused.json()["error"]["code"] == "UNAUTHENTICATED"


def test_reuso_de_refresh_revoga_familia_e_exige_novo_login(client):
    register(client)
    r1 = login(client)["refresh_token"]

    r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": r1})
    assert r2.status_code == 200
    r2_token = r2.json()["refresh_token"]

    # R1 já rotacionado é reapresentado -> roubo detectado.
    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": r1})
    assert reused.status_code == 401
    assert reused.json()["error"]["code"] == "UNAUTHENTICATED"

    # O token ativo da mesma família (R2) também é invalidado.
    family = client.post("/api/v1/auth/refresh", json={"refresh_token": r2_token})
    assert family.status_code == 401
    assert family.json()["error"]["code"] == "UNAUTHENTICATED"

    # Um novo login reabre a sessão.
    fresh = login(client)
    alive = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": fresh["refresh_token"]}
    )
    assert alive.status_code == 200


def test_logout_revoga_access_token_apresentado(client):
    register(client)
    tokens = login(client)
    headers = auth_headers(tokens)

    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200

    logout = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": tokens["refresh_token"]},
        headers=headers,
    )
    assert logout.status_code == 204

    # O MESMO access apresentado no logout deixa de valer imediatamente.
    revoked = client.get("/api/v1/auth/me", headers=headers)
    assert revoked.status_code == 401
    assert revoked.json()["error"]["code"] == "UNAUTHENTICATED"

    # Um novo login volta a funcionar.
    new_headers = auth_headers(login(client))
    assert client.get("/api/v1/auth/me", headers=new_headers).status_code == 200


def test_logout_sem_authorization_continua_204(client):
    register(client)
    tokens = login(client)

    response = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": tokens["refresh_token"]},
    )

    assert response.status_code == 204


def test_logout_revoga_refresh(client):
    register(client)
    tokens = login(client)

    logout = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert logout.status_code == 204

    after = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert after.status_code == 401


def test_rate_limit_429(client):
    register(client)

    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "ana@clinica.com", "password": "senha-errada"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": "ana@clinica.com", "password": "senha-errada"},
    )
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"


def test_rate_limit_por_ip_bloqueia_rotacionando_email():
    app = create_app(make_settings(login_rate_limit=100, login_ip_rate_limit=3))

    with TestClient(app) as client:
        for i in range(3):
            response = client.post(
                "/api/v1/auth/login",
                json={"email": f"user{i}@clinica.com", "password": "senha-errada"},
            )
            assert response.status_code == 401, (i, response.text)

        blocked = client.post(
            "/api/v1/auth/login",
            json={"email": "user3@clinica.com", "password": "senha-errada"},
        )

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"


def test_login_falho_emite_log_e_nao_vaza_senha(client, caplog):
    register(client)
    caplog.clear()
    segredo = "senha-que-nao-pode-vazar"

    with caplog.at_level(logging.WARNING, logger="odontoscan.auth"):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "ana@clinica.com", "password": segredo},
        )

    assert response.status_code == 401
    mensagens = [record.getMessage() for record in caplog.records]
    assert any(
        "auth.login_failed" in msg and "ana@clinica.com" in msg for msg in mensagens
    )
    assert segredo not in caplog.text


def test_login_sucesso_loga_user_id(client, caplog):
    register(client)
    caplog.clear()

    with caplog.at_level(logging.INFO, logger="odontoscan.auth"):
        login(client)

    assert any(
        "auth.login user_id=1" in record.getMessage() for record in caplog.records
    )


def test_logout_loga_user_id(client, caplog):
    register(client)
    tokens = login(client)
    caplog.clear()

    with caplog.at_level(logging.INFO, logger="odontoscan.auth"):
        response = client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": tokens["refresh_token"]},
        )

    assert response.status_code == 204
    assert any(
        "auth.logout user_id=1" in record.getMessage() for record in caplog.records
    )


def test_refresh_reuse_emite_warning_sem_vazar_token(client, caplog):
    register(client)
    tokens = login(client)

    first = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert first.status_code == 200

    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="odontoscan.auth"):
        reused = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
        )

    assert reused.status_code == 401
    assert any(
        "auth.refresh_reuse_detected user_id=1" in record.getMessage()
        for record in caplog.records
    )
    assert any(
        "auth.refresh_family_revoked user_id=1" in record.getMessage()
        for record in caplog.records
    )
    assert tokens["refresh_token"] not in caplog.text
