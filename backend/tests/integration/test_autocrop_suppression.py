"""Integração: recorte automático de panorâmica + supressão de material radiopaco."""

from __future__ import annotations

import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.domain.models import BBox, Detection
from app.main import create_app
from tests.conftest import make_settings


def _suppression_client() -> TestClient:
    """A supressão radiopaca vem DESLIGADA por padrão; aqui é habilitada explicitamente."""

    return TestClient(create_app(make_settings(suppress_radiopaque=True)))


def _png(array: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format="PNG")
    return buffer.getvalue()


def _board_image() -> np.ndarray:
    image = np.zeros((400, 1000, 3), dtype=np.uint8)
    image[40:60, 100:900] = 255  # cabeçalho
    image[120:300, 50:950] = 150  # faixa da panorâmica
    image[330:390, 200:400] = 200  # insets
    return image


def _detector_returning(client, detections):
    client.app.state.detector.infer = lambda *args, **kwargs: detections


def test_payload_expoe_o_recorte_da_panoramica(client):
    response = client.post(
        "/api/v1/analyze",
        files={"image": ("laudo.png", _png(_board_image()), "image/png")},
    )

    assert response.status_code == 200
    body = response.json()

    assert body["image"]["width"] == 1000
    assert body["image"]["height"] == 400
    assert body["image"]["crop"] == {"x": 50, "y": 120, "width": 900, "height": 180}


def test_payload_sem_recorte_quando_imagem_uniforme(client):
    array = np.full((300, 600, 3), 120, dtype=np.uint8)

    response = client.post(
        "/api/v1/analyze",
        files={"image": ("pano.png", _png(array), "image/png")},
    )

    assert response.status_code == 200
    assert response.json()["image"]["crop"] is None
    assert response.json()["summary"]["suppressed"] == 0


def test_suprime_deteccao_sobre_area_radiopaca():
    array = np.full((640, 640, 3), 100, dtype=np.uint8)
    array[100:300, 100:300] = 255  # restauração/implante (muito claro)

    with _suppression_client() as client:
        _detector_returning(
            client,
            [
                Detection(
                    class_id=0, confidence=0.9, bbox=BBox(x1=100, y1=100, x2=300, y2=300)
                )
            ],
        )
        response = client.post(
            "/api/v1/analyze",
            files={"image": ("pano.png", _png(array), "image/png")},
        )

    body = response.json()
    assert body["findings"] == []
    assert body["summary"]["suppressed"] == 1
    assert body["summary"]["total"] == 0


def test_mantem_deteccao_fora_de_area_radiopaca():
    array = np.full((640, 640, 3), 100, dtype=np.uint8)

    with _suppression_client() as client:
        _detector_returning(
            client,
            [
                Detection(
                    class_id=0, confidence=0.9, bbox=BBox(x1=400, y1=400, x2=500, y2=500)
                )
            ],
        )
        response = client.post(
            "/api/v1/analyze",
            files={"image": ("pano.png", _png(array), "image/png")},
        )

    body = response.json()
    assert len(body["findings"]) == 1
    assert body["summary"]["suppressed"] == 0
    assert body["findings"][0]["finding_id"] == "f1"
