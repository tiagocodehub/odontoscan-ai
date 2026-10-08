"""Testes de integração do endpoint /api/v1/analyze e health checks."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.domain.clinical_rules import DISCLAIMER
from app.main import create_app
from tests.conftest import make_png_bytes, make_settings

URGENCIES = {"informativa", "eletiva", "prioritária", "urgente"}


def test_healthz(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readyz_apos_startup(client):
    response = client.get("/readyz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["model"]["runtime"] == "stub"


def test_analyze_200_com_png_sintetico(client, png_bytes):
    response = client.post(
        "/api/v1/analyze",
        files={"image": ("radiografia.png", png_bytes, "image/png")},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == response.json()["request_id"]
    assert response.headers["X-Content-Type-Options"] == "nosniff"

    body = response.json()
    assert set(body) == {
        "analysis_id",
        "request_id",
        "disclaimer",
        "model",
        "inference_ms",
        "image",
        "summary",
        "findings",
        "persisted",
        "record_id",
    }

    assert body["persisted"] is False
    assert body["record_id"] is None
    assert body["analysis_id"]
    assert body["disclaimer"] == DISCLAIMER

    model = body["model"]
    assert model["runtime"] == "stub"
    assert model["version"] == "stub-0.1.0"
    assert model["threshold"] == pytest.approx(0.40)
    assert model["nms_iou"] == pytest.approx(0.45)

    image = body["image"]
    assert image["width"] == 2880
    assert image["height"] == 1440
    assert image["format"] == "png"
    assert image["original_format"] == "png"
    assert image["bytes"] == len(png_bytes)
    assert len(image["sha256"]) == 64

    findings = body["findings"]
    assert 1 <= len(findings) <= 3
    assert body["summary"]["total"] == len(findings)

    for finding in findings:
        assert set(finding) == {
            "finding_id",
            "class_id",
            "class_name",
            "label_pt",
            "confidence",
            "urgency",
            "conduct",
            "bbox_order",
            "bbox_normalized",
            "bbox_pixels",
        }
        assert finding["bbox_order"] == "xyxy"
        assert len(finding["bbox_normalized"]) == 4
        assert len(finding["bbox_pixels"]) == 4
        assert all(0.0 <= value <= 1.0 for value in finding["bbox_normalized"])
        assert all(isinstance(value, int) for value in finding["bbox_pixels"])
        assert all(
            isinstance(value, float) and round(value, 6) == value
            for value in finding["bbox_normalized"]
        )
        assert finding["urgency"] in URGENCIES
        assert 0.5 <= finding["confidence"] <= 0.95
        assert finding["label_pt"]
        assert finding["conduct"]

    assert sum(body["summary"]["by_class"].values()) == len(findings)


def test_analyze_findings_vazio_retorna_200(client, png_bytes, monkeypatch):
    monkeypatch.setattr(
        client.app.state.detector,
        "infer",
        lambda *args, **kwargs: [],
    )

    response = client.post(
        "/api/v1/analyze",
        files={"image": ("radiografia.png", png_bytes, "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["findings"] == []
    assert body["summary"] == {
        "total": 0,
        "by_class": {},
        "max_urgency": "informativa",
        "suppressed": 0,
    }


def test_analyze_400_bytes_corrompidos(client):
    corrupt = b"\x89PNG\r\n\x1a\n" + b"garbage-bytes"
    response = client.post(
        "/api/v1/analyze",
        files={"image": ("corrompida.png", corrupt, "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_FILE"
    assert response.json()["error"]["request_id"]


def test_analyze_413_arquivo_grande():
    app = create_app(make_settings(max_upload_mb=1))
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (1_200_000)

    with TestClient(app) as test_client:
        response = test_client.post(
            "/api/v1/analyze",
            files={"image": ("gigante.png", big, "image/png")},
        )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_analyze_415_formato_nao_suportado(client):
    response = client.post(
        "/api/v1/analyze",
        files={"image": ("anotacao.gif", b"GIF89a-animado", "image/gif")},
    )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_analyze_422_sem_campo_image(client):
    response = client.post("/api/v1/analyze", data={"foo": "bar"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"


@pytest.mark.parametrize("patient_id", ["0", "-1"])
def test_analyze_422_patient_id_invalido(client, png_bytes, patient_id):
    response = client.post(
        "/api/v1/analyze",
        files={"image": ("radiografia.png", png_bytes, "image/png")},
        data={"patient_id": patient_id},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"


def test_readyz_503_quando_nao_carregado():
    app = create_app(make_settings())
    with TestClient(app) as test_client:
        test_client.app.state.ready = False
        response = test_client.get("/readyz")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "MODEL_NOT_READY"
