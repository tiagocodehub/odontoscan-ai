"use client";

import { useCallback, useState } from "react";
import type { jsPDF } from "jspdf";
import type { AnalysisResponse } from "@/lib/types";
import { toUrgency, urgencyLabel, urgencyStroke } from "@/lib/urgency";
import { FALLBACK_DISCLAIMER } from "@/lib/disclaimer";
import { formatConfidence } from "@/lib/format";
import { includedItems } from "@/lib/treatment-plan";
import type { TreatmentPlanItem } from "@/lib/treatment-plan";

interface ReportPdfProps {
  analysis: AnalysisResponse | null;
  /** Plano sugerido e editavel; somente os itens incluidos entram no PDF. */
  plan: TreatmentPlanItem[];
  /**
   * Retorna o PNG da radiografia INTEIRA com as caixas desenhadas, exportado
   * offscreen nas dimensoes reais da imagem (independente do zoom/pan do usuario).
   */
  getStageImage: () => string | null;
  className?: string;
}

type PdfStatus = "idle" | "generating" | "error";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_SPACE = 16;

/**
 * jsPDF usa fontes padrao com encoding WinAnsi (Latin-1), que cobre acentos PT-BR
 * (á, ã, ç, é...). Substituimos apenas os caracteres graficos fora do Latin-1
 * para garantir ausencia de mojibake.
 */
function pdfSafe(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u00B7]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u00A0/g, " ");
}

interface ImageSize {
  width: number;
  height: number;
}

/**
 * Le as dimensoes REAIS do PNG exportado (naturalWidth/naturalHeight).
 * E a unica forma confiavel de preservar o aspecto: as dimensoes do `Stage`
 * (viewport) nao correspondem ao recorte efetivamente gerado.
 */
function loadImageSize(dataUrl: string): Promise<ImageSize | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const image = new window.Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function drawPageHeader(doc: jsPDF, analysis: AnalysisResponse): number {
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafe("OdontoScan AI - Relatório Sugestivo"), MARGIN, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    pdfSafe("Documento gerado para apoio à decisão. Não constitui diagnóstico."),
    MARGIN,
    y,
  );
  y += 5;

  const generatedAt = new Date().toLocaleString("pt-BR");
  const meta = [
    `Emissão: ${generatedAt}`,
    `Análise: ${analysis.analysis_id}`,
    `Modelo: ${analysis.model.version} (${analysis.model.runtime})`,
    `Limiar: ${analysis.model.threshold.toFixed(2)} · NMS IoU: ${analysis.model.nms_iou.toFixed(2)}`,
    `Inferência: ${analysis.inference_ms} ms`,
  ];

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  for (const line of meta) {
    doc.text(pdfSafe(line), MARGIN, y);
    y += 3.8;
  }

  y += 1.5;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  return y + 6;
}

function drawSummary(doc: jsPDF, analysis: AnalysisResponse, startY: number): number {
  const { total, max_urgency } = analysis.summary;
  let y = startY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafe("Resumo"), MARGIN, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(
    pdfSafe(
      `Total de achados: ${total} · Urgência máxima: ${urgencyLabel(toUrgency(max_urgency))}`,
    ),
    MARGIN,
    y,
  );
  y += 6;

  return y;
}

function drawImage(
  doc: jsPDF,
  dataUrl: string | null,
  imageSize: ImageSize | null,
  startY: number,
): number {
  if (!dataUrl) return startY;

  const maxWidth = CONTENT_WIDTH;
  const maxHeight = 105;

  let width = maxWidth;
  let height = maxHeight;
  const ratio =
    imageSize && imageSize.width > 0 && imageSize.height > 0
      ? imageSize.width / imageSize.height
      : 4 / 3;

  if (maxWidth / ratio <= maxHeight) {
    width = maxWidth;
    height = maxWidth / ratio;
  } else {
    height = maxHeight;
    width = maxHeight * ratio;
  }

  // Evita estourar a pagina antes da tabela.
  if (startY + height + 12 > PAGE_HEIGHT - FOOTER_SPACE) {
    doc.addPage();
    startY = MARGIN;
  }

  try {
    const format = dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(dataUrl, format, MARGIN, startY, width, height, undefined, "FAST");
  } catch {
    return startY;
  }

  let y = startY + height + 3;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    pdfSafe("Imagem original com demarcações geradas pelo modelo (caixas normalizadas)."),
    MARGIN,
    y,
  );
  y += 6;

  doc.setFont("helvetica", "normal");
  return y;
}

const COLUMN_WIDTHS = [40, 20, 25, CONTENT_WIDTH - 40 - 20 - 25] as const;
const COLUMN_TITLES = ["Classe", "Confiança", "Urgência", "Conduta sugerida"] as const;

function columnOffsets(): number[] {
  const offsets: number[] = [];
  let running = MARGIN;
  for (const width of COLUMN_WIDTHS) {
    offsets.push(running);
    running += width;
  }
  return offsets;
}

function drawTableHeader(doc: jsPDF, y: number): number {
  const height = 8;
  const offsets = columnOffsets();

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, CONTENT_WIDTH, height, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  COLUMN_TITLES.forEach((title, index) => {
    const x = offsets[index];
    if (x === undefined) return;
    doc.text(pdfSafe(title), x + 2, y + 5.4);
  });

  return y + height;
}

function drawFindingsTable(
  doc: jsPDF,
  analysis: AnalysisResponse,
  startY: number,
): number {
  const offsets = columnOffsets();
  const conductWidth = (COLUMN_WIDTHS[3] ?? 80) - 4;

  let y = startY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafe("Achados"), MARGIN, y);
  y += 5;

  y = drawTableHeader(doc, y);

  if (analysis.findings.length === 0) {
    const height = 9;
    doc.setDrawColor(203, 213, 225);
    doc.rect(MARGIN, y, CONTENT_WIDTH, height);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      pdfSafe("Nenhum achado acima do limiar de confiança configurado."),
      MARGIN + 2,
      y + 5.6,
    );
    return y + height + 4;
  }

  doc.setFontSize(8);
  analysis.findings.forEach((finding, index) => {
    const labelLines = doc.splitTextToSize(
      pdfSafe(finding.label_pt),
      (COLUMN_WIDTHS[0] ?? 40) - 4,
    ) as string[];
    const classLines = doc.splitTextToSize(
      pdfSafe(finding.class_name),
      (COLUMN_WIDTHS[0] ?? 40) - 4,
    ) as string[];
    const conductLines = doc.splitTextToSize(
      pdfSafe(finding.conduct || "-"),
      conductWidth,
    ) as string[];

    const lines = Math.max(labelLines.length + classLines.length, conductLines.length, 2);
    const rowHeight = Math.max(9, lines * 3.6 + 3);

    if (y + rowHeight > PAGE_HEIGHT - FOOTER_SPACE) {
      doc.addPage();
      y = MARGIN;
      y = drawTableHeader(doc, y);
    }

    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, "F");
    }

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight);

    // Coluna 1: rótulo PT + nome técnico da classe
    const x0 = (offsets[0] ?? MARGIN) + 2;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    let textY = y + 4.4;
    for (const line of labelLines) {
      doc.text(line, x0, textY);
      textY += 3.6;
    }
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    for (const line of classLines) {
      doc.text(line, x0, textY);
      textY += 3.4;
    }

    // Coluna 2: confiança
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(formatConfidence(finding.confidence), (offsets[1] ?? MARGIN) + 2, y + 4.4);

    // Coluna 3: urgência
    doc.text(urgencyLabel(toUrgency(finding.urgency)), (offsets[2] ?? MARGIN) + 2, y + 4.4);

    // Coluna 4: conduta
    let conductY = y + 4.4;
    for (const line of conductLines) {
      doc.text(line, (offsets[3] ?? MARGIN) + 2, conductY);
      conductY += 3.6;
    }

    y += rowHeight;
  });

  return y + 6;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * Secao "Plano de tratamento sugerido": lista apenas os itens incluidos
 * (titulo + urgencia) e a observacao quando houver. Usa a mesma logica de
 * paginacao da tabela de achados (quebra antes de estourar o rodape).
 */
function drawTreatmentPlan(
  doc: jsPDF,
  plan: readonly TreatmentPlanItem[],
  startY: number,
): number {
  const items = includedItems(plan);
  let y = startY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfSafe("Plano de tratamento sugerido"), MARGIN, y);
  y += 4.5;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    pdfSafe(
      "Sugestão editável de apoio à decisão. Conduta final sob responsabilidade do profissional.",
    ),
    MARGIN,
    y,
  );
  y += 6;

  if (items.length === 0) {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(pdfSafe("Nenhum item incluído no plano."), MARGIN + 2, y + 5.6);
    return y + 9 + 6;
  }

  items.forEach((item) => {
    const heading = `${item.title} (${urgencyLabel(toUrgency(item.urgency))})`;
    const headingLines = doc.splitTextToSize(
      pdfSafe(heading),
      CONTENT_WIDTH - 8,
    ) as string[];
    const noteLines =
      item.note.trim().length > 0
        ? (doc.splitTextToSize(pdfSafe(item.note), CONTENT_WIDTH - 12) as string[])
        : [];

    const headingHeight = headingLines.length * 4.2;
    const noteHeight = noteLines.length * 3.6;
    const blockHeight = 4 + headingHeight + (noteLines.length > 0 ? 3 + noteHeight : 0);

    if (y + blockHeight > PAGE_HEIGHT - FOOTER_SPACE) {
      doc.addPage();
      y = MARGIN;
    }

    // Faixa lateral colorida pela urgencia (mesma semantica do badge/viewer).
    const [red, green, blue] = hexToRgb(urgencyStroke(toUrgency(item.urgency)));
    doc.setFillColor(red, green, blue);
    doc.rect(MARGIN, y + 1, 1.2, Math.max(blockHeight - 2, 3), "F");

    let textY = y + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    for (const line of headingLines) {
      doc.text(line, MARGIN + 4, textY);
      textY += 4.2;
    }

    if (noteLines.length > 0) {
      textY += 1.5;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      for (const line of noteLines) {
        doc.text(line, MARGIN + 6, textY);
        textY += 3.6;
      }
    }

    y += blockHeight;
  });

  return y + 6;
}

function drawDisclaimer(doc: jsPDF, analysis: AnalysisResponse, startY: number): void {
  const disclaimer = pdfSafe(analysis.disclaimer || FALLBACK_DISCLAIMER);
  const lines = doc.splitTextToSize(disclaimer, CONTENT_WIDTH - 8) as string[];
  const boxHeight = lines.length * 3.8 + 10;

  let y = startY;
  if (y + boxHeight > PAGE_HEIGHT - FOOTER_SPACE) {
    doc.addPage();
    y = MARGIN;
  }

  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(252, 211, 77);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, CONTENT_WIDTH, boxHeight, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(146, 64, 14);
  doc.text(pdfSafe("Aviso legal"), MARGIN + 4, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(69, 26, 3);
  let lineY = y + 9;
  for (const line of lines) {
    doc.text(line, MARGIN + 4, lineY);
    lineY += 3.8;
  }

  // Rodapé em todas as páginas
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      pdfSafe(`OdontoScan AI · protótipo de pesquisa · página ${page}/${pageCount}`),
      MARGIN,
      PAGE_HEIGHT - 8,
    );
  }
}

function buildAnalysisPdf(
  doc: jsPDF,
  analysis: AnalysisResponse,
  plan: readonly TreatmentPlanItem[],
  stageImage: string | null,
  stageImageSize: ImageSize | null,
): jsPDF {
  let y = drawPageHeader(doc, analysis);
  y = drawSummary(doc, analysis, y);
  y = drawImage(
    doc,
    stageImage,
    stageImageSize ?? { width: analysis.image.width, height: analysis.image.height },
    y,
  );
  y = drawFindingsTable(doc, analysis, y);
  y = drawTreatmentPlan(doc, plan, y);
  drawDisclaimer(doc, analysis, y);
  return doc;
}

export default function ReportPdf({
  analysis,
  plan,
  getStageImage,
  className,
}: ReportPdfProps) {
  const [status, setStatus] = useState<PdfStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!analysis || status === "generating") return;

    setStatus("generating");
    setErrorMessage(null);

    try {
      // Import dinamico: jspdf nao entra no bundle inicial.
      const { jsPDF: JsPdf } = await import("jspdf");
      // O PNG e exportado offscreen pelo viewer nas dimensoes reais da imagem,
      // independente do zoom/pan. Lemos as dimensoes reais para encaixar no PDF.
      const stageImage = getStageImage();
      const stageImageSize = stageImage ? await loadImageSize(stageImage) : null;

      const doc = new JsPdf({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
        compress: true,
      });

      buildAnalysisPdf(doc, analysis, plan, stageImage, stageImageSize);
      doc.save(`odontoscan-${analysis.analysis_id}.pdf`);
      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMessage("Não foi possível gerar o PDF. Tente novamente.");
    }
  }, [analysis, plan, getStageImage, status]);

  const isDisabled = !analysis || status === "generating";

  return (
    <div className={["space-y-2", className ?? ""].join(" ")}>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isDisabled}
        aria-busy={status === "generating"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
      >
        {status === "generating" ? (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
            />
            Gerando PDF…
          </>
        ) : (
          <>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M12 3v10.6l3.3-3.3 1.4 1.4L11 17.4l-5.7-5.7 1.4-1.4L10 13.6V3h2ZM5 19h14v2H5v-2Z" />
            </svg>
            Baixar relatório em PDF
          </>
        )}
      </button>

      {status === "error" && errorMessage ? (
        <p role="alert" className="text-xs text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
