"""Testes do caminho ONNX real (pulados se o modelo/sample não estiverem presentes).

Valida que o adaptador carrega um `.onnx` de verdade, que `/readyz` reporta
`runtime=onnxruntime` e que a análise ponta a ponta produz bbox normalizada válida.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import make_png_bytes, make_settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
# Modelo padrão do projeto (panorâmico): caries, periapical_lesion, impacted_tooth.
MODEL_PATH = BACKEND_DIR / "models" / "liodon_dental_panoramic.onnx"
SAMPLE_IMAGE = BACKEND_DIR / "models" / "sample_panoramic.jpg"

pytestmark = pytest.mark.skipif(
    not MODEL_PATH.is_file(),
    reason="Modelo ONNX padrão ausente (backend/models/liodon_dental_panoramic.onnx).",
)


def _client() -> TestClient:
    app = create_app(
        make_settings(model_path=str(MODEL_PATH), allow_stub_fallback=False),
    )
    return TestClient(app)


def test_readyz_reporta_runtime_onnx() -> None:
    with _client() as client:
        response = client.get("/readyz")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["model"]["runtime"] == "onnxruntime"


def test_analyze_com_radiografia_real() -> None:
    if not SAMPLE_IMAGE.is_file():
        pytest.skip("Radiografia de exemplo ausente.")

    with _client() as client:
        response = client.post(
            "/api/v1/analyze",
            files={
                "image": (
                    "panoramica.jpg",
                    SAMPLE_IMAGE.read_bytes(),
                    "image/jpeg",
                )
            },
        )

    assert response.status_code == 200
    body = response.json()

    assert body["model"]["runtime"] == "onnxruntime"
    assert body["disclaimer"]

    findings = body["findings"]
    assert body["summary"]["total"] == len(findings)

    for finding in findings:
        assert finding["bbox_order"] == "xyxy"
        assert all(0.0 <= value <= 1.0 for value in finding["bbox_normalized"])
        assert all(isinstance(value, int) for value in finding["bbox_pixels"])
        assert finding["label_pt"]
        assert finding["conduct"]


def test_analyze_imagem_sintetica_nao_quebra() -> None:
    """Imagem sem patologias pode retornar 0 achados — deve continuar 200."""

    with _client() as client:
        response = client.post(
            "/api/v1/analyze",
            files={"image": ("sintetica.png", make_png_bytes(640, 480), "image/png")},
        )

    assert response.status_code == 200
    assert response.json()["findings"] == []
