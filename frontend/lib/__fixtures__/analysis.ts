import type { AnalysisResponse, Finding } from "@/lib/types";

/**
 * Fixtures tipadas que espelham o payload real de `docs/api-contract.md`.
 * Centralizadas para que os testes nao divirjam do contrato.
 */

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    finding_id: "f1",
    class_id: 3,
    class_name: "periapical_lesion",
    label_pt: "Lesão/Infecção Periapical",
    confidence: 0.83,
    urgency: "urgente",
    conduct:
      "Avaliar tratamento endodôntico; em casos avançados com fratura radicular, considerar exodontia.",
    bbox_order: "xyxy",
    bbox_normalized: [0.412, 0.531, 0.47, 0.602],
    bbox_pixels: [1186, 764, 1353, 867],
    ...overrides,
  };
}

export function makeAnalysisResponse(
  overrides: Partial<AnalysisResponse> = {},
): AnalysisResponse {
  return {
    analysis_id: "0f6c2b1e-3a1d-4b2c-9f1e-7d6a5c4b3a21",
    request_id: "a1b2c3d4e5f6",
    disclaimer:
      "Protótipo de pesquisa. Relatório sugestivo gerado por IA para apoio à decisão.",
    model: { version: "stub-0.1.0", runtime: "stub", threshold: 0.4, nms_iou: 0.45 },
    inference_ms: 12,
    image: {
      width: 2880,
      height: 1440,
      format: "png",
      original_format: "png",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      bytes: 1048576,
      crop: null,
    },
    summary: {
      total: 1,
      by_class: { periapical_lesion: 1 },
      max_urgency: "urgente",
      suppressed: 0,
    },
    findings: [makeFinding()],
    persisted: false,
    record_id: null,
    ...overrides,
  };
}
