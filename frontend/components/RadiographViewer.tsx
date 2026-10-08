"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Finding } from "@/lib/types";
import { clamp, fitContain, normToStage } from "@/lib/coords";
import type { StageRect } from "@/lib/coords";
import {
  annotationStrokePx,
  createAnnotationId,
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_ANNOTATION_STROKE_WIDTH,
  isDot,
  pointerToNormalized,
  useAnnotationHistory,
} from "@/lib/annotations";
import type {
  Annotation,
  AnnotationPoint,
  AnnotationTool,
  DrawingTool,
} from "@/lib/annotations";
import { toUrgency, urgencyFill, urgencyStroke } from "@/lib/urgency";
import { formatConfidence } from "@/lib/format";
import AnnotationToolbar from "@/components/AnnotationToolbar";

// Konva acessa `window`; este modulo so e carregado via `dynamic(..., { ssr: false })`.
// Ajusta a densidade do canvas para nitidez em telas nao-retina.
if (typeof window !== "undefined") {
  const konvaWithPixelRatio = Konva as unknown as { pixelRatio?: number };
  konvaWithPixelRatio.pixelRatio = Math.min(
    Math.max(window.devicePixelRatio || 1, 2),
    3,
  );
}

export interface RadiographViewerHandle {
  /**
   * PNG da radiografia inteira com as caixas desenhadas, na resolucao real da
   * imagem e INDEPENDENTE do zoom/pan atual (render offscreen, sem letterbox).
   * Usado pelo PDF.
   */
  toDataURL: (pixelRatio?: number) => string | null;
}

export interface RadiographViewerProps {
  imageUrl: string | null;
  findings: Finding[];
  hoveredFindingId: string | null;
  pinnedFindingId: string | null;
  onHoverFinding: (findingId: string | null) => void;
  onSelectFinding: (findingId: string) => void;
  className?: string;
}

interface Size {
  width: number;
  height: number;
}

interface Viewport {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.2;
const IDENTITY_VIEW: Viewport = { scale: 1, x: 0, y: 0 };

// Distancia minima (normalizada) entre amostras do traco a mao livre. Evita
// acumular milhares de pontos quase identicos a cada `mousemove`.
const MIN_POINT_DISTANCE = 0.0015;
const MIN_POINT_DISTANCE_SQ = MIN_POINT_DISTANCE * MIN_POINT_DISTANCE;

const RadiographViewer = forwardRef<RadiographViewerHandle, RadiographViewerProps>(
  function RadiographViewer(
    {
      imageUrl,
      findings,
      hoveredFindingId,
      pinnedFindingId,
      onHoverFinding,
      onSelectFinding,
      className,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const stageRef = useRef<Konva.Stage | null>(null);
    const annotationLayerRef = useRef<Konva.Layer | null>(null);

    const [container, setContainer] = useState<Size>({ width: 0, height: 0 });
    const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
    const [natural, setNatural] = useState<Size | null>(null);
    const [loadState, setLoadState] = useState<"empty" | "loading" | "ready" | "error">(
      "empty",
    );
    const [view, setView] = useState<Viewport>(IDENTITY_VIEW);

    // --- Lousa digital (anotacoes) -----------------------------------------
    const [tool, setTool] = useState<AnnotationTool>("pan");
    const [color, setColor] = useState<string>(DEFAULT_ANNOTATION_COLOR);
    const [strokeWidth, setStrokeWidth] = useState<number>(
      DEFAULT_ANNOTATION_STROKE_WIDTH,
    );
    // Rascunho do traco em andamento (estado separado do historico).
    const [draft, setDraft] = useState<Annotation | null>(null);
    const draftSourceRef = useRef<Annotation | null>(null);
    const isDrawingRef = useRef(false);

    const {
      annotations,
      canUndo,
      canRedo,
      canClear,
      addAnnotation,
      undo,
      redo,
      clear,
    } = useAnnotationHistory();

    // --- Medicao responsiva do container -----------------------------------
    useEffect(() => {
      const node = containerRef.current;
      if (!node) return;

      const measure = () => {
        const rect = node.getBoundingClientRect();
        setContainer((prev) =>
          Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
            ? prev
            : { width: rect.width, height: rect.height },
        );
      };

      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }, []);

    // --- Carregamento da imagem --------------------------------------------
    useEffect(() => {
      if (!imageUrl) {
        setImageElement(null);
        setNatural(null);
        setLoadState("empty");
        return;
      }

      let disposed = false;
      setLoadState("loading");

      const image = new window.Image();
      image.decoding = "async";
      image.onload = () => {
        if (disposed) return;
        setImageElement(image);
        setNatural({ width: image.naturalWidth, height: image.naturalHeight });
        setLoadState("ready");
      };
      image.onerror = () => {
        if (disposed) return;
        setImageElement(null);
        setNatural(null);
        setLoadState("error");
      };
      image.src = imageUrl;

      return () => {
        disposed = true;
        image.onload = null;
        image.onerror = null;
      };
    }, [imageUrl]);

    // Reset de zoom/pan quando a imagem ou o container mudam de dimensao.
    useEffect(() => {
      setView(IDENTITY_VIEW);
    }, [natural, container.width, container.height]);

    // --- Geometria base (imagem ajustada ao container) ----------------------
    const baseRect = useMemo(() => {
      if (!natural) return null;
      const rect = fitContain(natural.width, natural.height, container.width, container.height);
      return rect.width > 0 && rect.height > 0 ? rect : null;
    }, [natural, container.width, container.height]);

    const normalizedToBase = useCallback(
      (bbox: Finding["bbox_normalized"]) =>
        baseRect ? normToStage(bbox, baseRect.width, baseRect.height) : null,
      [baseRect],
    );

    const hasImage = loadState === "ready" && baseRect !== null && imageElement !== null;
    // Desenho somente quando ha imagem e a ferramenta nao e "pan".
    const drawingEnabled = tool !== "pan" && hasImage;

    // Nova imagem = lousa limpa (o historico pertencia a imagem anterior).
    useEffect(() => {
      clear();
      setDraft(null);
      draftSourceRef.current = null;
      isDrawingRef.current = false;
      setTool("pan");
    }, [imageUrl, clear]);

    // --- Conversao ponteiro -> ponto normalizado ---------------------------
    const getNormalizedPoint = useCallback((): AnnotationPoint | null => {
      const stage = stageRef.current;
      if (!stage || !baseRect) return null;
      const pointer = stage.getPointerPosition();
      if (!pointer) return null;
      // `getPointerPosition` ja vem em pixels do container do Stage; a funcao
      // pura desconta zoom/pan (`view`) e o letterbox (`baseRect`).
      return pointerToNormalized([pointer.x, pointer.y], baseRect, view);
    }, [baseRect, view]);

    const beginStroke = useCallback(() => {
      if (tool === "pan" || !hasImage) return;
      const point = getNormalizedPoint();
      if (!point) return;

      const activeTool: DrawingTool = tool;
      const next: Annotation = {
        id: createAnnotationId(),
        tool: activeTool,
        color,
        strokeWidth,
        // Formas comecam com dois pontos identicos ate o arraste definir o fim.
        points: activeTool === "pen" ? [point] : [point, point],
      };

      isDrawingRef.current = true;
      draftSourceRef.current = next;
      setDraft(next);
    }, [tool, hasImage, getNormalizedPoint, color, strokeWidth]);

    const extendStroke = useCallback(() => {
      if (!isDrawingRef.current) return;
      const current = draftSourceRef.current;
      if (!current) return;
      const point = getNormalizedPoint();
      if (!point) return;

      let next: Annotation;
      if (current.tool === "pen") {
        const last = current.points[current.points.length - 1];
        if (last) {
          const dx = point[0] - last[0];
          const dy = point[1] - last[1];
          if (dx * dx + dy * dy < MIN_POINT_DISTANCE_SQ) return;
        }
        next = { ...current, points: [...current.points, point] };
      } else {
        const first = current.points[0];
        if (!first) return;
        next = { ...current, points: [first, point] };
      }

      draftSourceRef.current = next;
      setDraft(next);
    }, [getNormalizedPoint]);

    const finishStroke = useCallback(() => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      const finished = draftSourceRef.current;
      draftSourceRef.current = null;
      setDraft(null);
      if (!finished) return;

      // Clique solto sem arraste nao cria retangulo/elipse/seta vazios; no
      // lapis vira um ponto (tratado no render como `isDot`).
      if (finished.tool !== "pen" && isDot(finished)) return;
      addAnnotation(finished);
    }, [addAnnotation]);

    // Finaliza o traco mesmo se o botao for solto fora do canvas.
    useEffect(() => {
      if (typeof window === "undefined") return;
      const stop = () => finishStroke();
      window.addEventListener("mouseup", stop);
      window.addEventListener("touchend", stop);
      window.addEventListener("blur", stop);
      return () => {
        window.removeEventListener("mouseup", stop);
        window.removeEventListener("touchend", stop);
        window.removeEventListener("blur", stop);
      };
    }, [finishStroke]);

    // --- Interacao de desenho (mouse/toque) --------------------------------
    // Em modo de desenho o Stage NAO arrasta: o ponteiro e convertido para
    // coordenadas normalizadas e o traco em andamento vive em `draft`.
    const handlePointerDown = useCallback(
      (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (!drawingEnabled) return;
        if (event.evt instanceof MouseEvent && event.evt.button !== 0) return;
        if (event.evt.cancelable) event.evt.preventDefault();
        beginStroke();
      },
      [drawingEnabled, beginStroke],
    );

    const handlePointerMove = useCallback(
      (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (!isDrawingRef.current) return;
        if (event.evt.cancelable) event.evt.preventDefault();
        extendStroke();
      },
      [extendStroke],
    );

    // Renderiza (imperativamente) o historico + rascunho na camada de anotacoes.
    // Reutiliza `createAnnotationNode`, a MESMA funcao usada no export do PDF,
    // garantindo paridade visual entre tela e relatorio.
    useEffect(() => {
      const layer = annotationLayerRef.current;
      if (!layer || !baseRect) return;

      layer.destroyChildren();
      const pending = draft ? [...annotations, draft] : annotations;
      for (const annotation of pending) {
        const node = createAnnotationNode(annotation, baseRect);
        if (node) layer.add(node);
      }
      layer.batchDraw();
    }, [annotations, draft, baseRect]);

    // --- Ordenacao: destaque sempre por ultimo (fica no topo) ---------------
    const orderedFindings = useMemo(() => {
      const isHighlighted = (findingId: string) =>
        findingId === hoveredFindingId || findingId === pinnedFindingId;

      return findings
        .map((finding, index) => ({ finding, index }))
        .sort((a, b) => {
          const diff =
            Number(isHighlighted(a.finding.finding_id)) -
            Number(isHighlighted(b.finding.finding_id));
          return diff !== 0 ? diff : a.index - b.index;
        });
    }, [findings, hoveredFindingId, pinnedFindingId]);

    // --- Interacoes de zoom/pan --------------------------------------------
    const zoomAt = useCallback(
      (factor: number, center?: { x: number; y: number }) => {
        const focus = center ?? {
          x: container.width / 2,
          y: container.height / 2,
        };
        setView((previous) => {
          const nextScale = clamp(previous.scale * factor, MIN_SCALE, MAX_SCALE);
          if (nextScale === previous.scale) return previous;
          const pointTo = {
            x: (focus.x - previous.x) / previous.scale,
            y: (focus.y - previous.y) / previous.scale,
          };
          return {
            scale: nextScale,
            x: focus.x - pointTo.x * nextScale,
            y: focus.y - pointTo.y * nextScale,
          };
        });
      },
      [container.width, container.height],
    );

    const handleWheel = useCallback(
      (event: KonvaEventObject<WheelEvent>) => {
        event.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;
        const pointer = stage.getPointerPosition();
        const factor = event.evt.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
        zoomAt(factor, pointer ?? undefined);
      },
      [zoomAt],
    );

    const handleDragEnd = useCallback((event: KonvaEventObject<DragEvent>) => {
      const stage = event.target;
      setView((previous) => ({ ...previous, x: stage.x(), y: stage.y() }));
    }, []);

    const resetView = useCallback(() => setView(IDENTITY_VIEW), []);

    // --- API imperativa para o PDF -----------------------------------------
    // Export OFFLINE em um Stage dedicado, criado fora da arvore visivel e
    // dimensionado nas dimensoes REAIS da imagem. Assim o PDF nao depende do
    // zoom/pan do usuario, nao inclui as barras de letterbox e preserva o
    // aspecto original (sem distorcao).
    const exportStageImage = useCallback(
      (pixelRatio: number): string | null => {
        if (!imageElement || !natural || typeof document === "undefined") return null;

        const host = document.createElement("div");
        host.setAttribute("aria-hidden", "true");
        host.style.position = "absolute";
        host.style.left = "-100000px";
        host.style.top = "0";
        host.style.width = `${natural.width}px`;
        host.style.height = `${natural.height}px`;
        host.style.pointerEvents = "none";
        document.body.appendChild(host);

        let stage: Konva.Stage | null = null;
        try {
          stage = new Konva.Stage({
            container: host,
            width: natural.width,
            height: natural.height,
          });

          const imageLayer = new Konva.Layer({ listening: false });
          imageLayer.add(
            new Konva.Image({
              image: imageElement,
              x: 0,
              y: 0,
              width: natural.width,
              height: natural.height,
              listening: false,
            }),
          );

          const boxLayer = new Konva.Layer({ listening: false });
          // Escala a espessura do traco com a resolucao para permanecer visivel
          // quando a imagem e reduzida no PDF.
          const strokeWidth = Math.max(2, Math.round(natural.width / 320));
          for (const finding of findings) {
            const rect = normToStage(finding.bbox_normalized, natural.width, natural.height);
            const urgency = toUrgency(finding.urgency);
            boxLayer.add(
              new Konva.Rect({
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                stroke: urgencyStroke(urgency),
                strokeWidth,
                fill: urgencyFill(urgency, 0.12),
                listening: false,
                perfectDrawEnabled: false,
              }),
            );
          }

          stage.add(imageLayer);
          stage.add(boxLayer);

          // Anotacoes por ULTIMO: ficam acima das bboxes, como tinta no papel.
          // Renderizadas na resolucao NATURAL com espessura proporcional.
          const annotationLayer = new Konva.Layer({ listening: false });
          const annotationRect: StageRect = {
            x: 0,
            y: 0,
            width: natural.width,
            height: natural.height,
          };
          for (const annotation of annotations) {
            const node = createAnnotationNode(annotation, annotationRect);
            if (node) annotationLayer.add(node);
          }
          stage.add(annotationLayer);

          return stage.toDataURL({ pixelRatio, mimeType: "image/png" });
        } catch {
          return null;
        } finally {
          stage?.destroy();
          host.remove();
        }
      },
      [imageElement, natural, findings, annotations],
    );

    useImperativeHandle(
      ref,
      () => ({
        toDataURL: (pixelRatio = 1) => exportStageImage(pixelRatio),
      }),
      [exportStageImage],
    );

    // --- Tooltip DOM (nitido e nao escala junto com o Stage) ----------------
    const activeFindingId = hoveredFindingId ?? pinnedFindingId;
    const activeFinding = useMemo(
      () => findings.find((item) => item.finding_id === activeFindingId) ?? null,
      [findings, activeFindingId],
    );

    const tooltipPosition = useMemo(() => {
      if (!activeFinding || !baseRect) return null;
      const rect = normToStage(activeFinding.bbox_normalized, baseRect.width, baseRect.height);
      return {
        left: baseRect.x + view.x + view.scale * rect.x,
        top: baseRect.y + view.y + view.scale * rect.y,
      };
    }, [activeFinding, baseRect, view]);

    const viewerLabel =
      findings.length > 0
        ? `Radiografia com ${findings.length} achado(s) demarcado(s). Use a barra de ferramentas para desenhar sobre a imagem; detalhes na legenda ao lado.`
        : "Radiografia enviada para análise. Use a barra de ferramentas para desenhar sobre a imagem.";

    return (
      <figure className={["relative", className ?? ""].join(" ")}>
        <div
          onMouseLeave={() => onHoverFinding(null)}
          className="relative h-[320px] w-full overflow-hidden rounded-xl border border-slate-300 bg-slate-900 sm:h-[420px] lg:h-[520px]"
        >
          {/*
            `role="img"` fica restrito ao canvas (seus descendentes sao
            presentacionais). Os controles de zoom e o tooltip sao IRMAOS deste
            no — nunca filhos — para permanecerem expostos a leitores de tela.
          */}
          <div
            ref={containerRef}
            role={hasImage ? "img" : undefined}
            aria-label={hasImage ? viewerLabel : undefined}
            className="absolute inset-0"
          >
            {hasImage ? (
              <Stage
                ref={stageRef}
                width={container.width}
                height={container.height}
                scaleX={view.scale}
                scaleY={view.scale}
                x={view.x}
                y={view.y}
                draggable={tool === "pan"}
                onDragEnd={handleDragEnd}
                onWheel={handleWheel}
                onMouseDown={handlePointerDown}
                onTouchStart={handlePointerDown}
                onMouseMove={handlePointerMove}
                onTouchMove={handlePointerMove}
                onMouseUp={finishStroke}
                onTouchEnd={finishStroke}
                style={{ cursor: drawingEnabled ? "crosshair" : "grab" }}
              >
                <Layer listening>
                  <KonvaImage
                    image={imageElement ?? undefined}
                    x={baseRect.x}
                    y={baseRect.y}
                    width={baseRect.width}
                    height={baseRect.height}
                    listening={false}
                  />
                </Layer>

                <Layer listening={!drawingEnabled}>
                  {orderedFindings.map(({ finding }) => {
                    const rect = normalizedToBase(finding.bbox_normalized);
                    if (!rect) return null;

                    const urgency = toUrgency(finding.urgency);
                    const stroke = urgencyStroke(urgency);
                    const isHovered = finding.finding_id === hoveredFindingId;
                    const isPinned = finding.finding_id === pinnedFindingId;
                    const isActive = isHovered || isPinned;

                    return (
                      <Rect
                        key={finding.finding_id}
                        x={baseRect.x + rect.x}
                        y={baseRect.y + rect.y}
                        width={rect.width}
                        height={rect.height}
                        stroke={stroke}
                        strokeWidth={isActive ? 4 : 2}
                        strokeScaleEnabled={false}
                        dash={isPinned && !isHovered ? [8, 5] : undefined}
                        fill={urgencyFill(urgency, isActive ? 0.25 : 0.1)}
                        fillEnabled
                        shadowColor={stroke}
                        shadowBlur={isActive ? 12 : 0}
                        shadowOpacity={isActive ? 0.7 : 0}
                        hitStrokeWidth={16}
                        perfectDrawEnabled={false}
                        onMouseEnter={() => onHoverFinding(finding.finding_id)}
                        onMouseLeave={() => onHoverFinding(null)}
                        onClick={() => onSelectFinding(finding.finding_id)}
                        onTap={() => onSelectFinding(finding.finding_id)}
                      />
                    );
                  })}
                </Layer>

                {/*
                  Anotacoes por ULTIMO (acima das bboxes). `listening` so liga no
                  modo de desenho para nao roubar o hover das bboxes no modo pan.
                */}
                <Layer ref={annotationLayerRef} listening={drawingEnabled} />
              </Stage>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-300">
                {loadState === "loading" ? (
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    />
                    Carregando imagem…
                  </span>
                ) : loadState === "error" ? (
                  "Não foi possível carregar a imagem selecionada."
                ) : findings.length > 0 ? (
                  "Pré-visualização indisponível para este formato (DICOM). " +
                  "Os achados detectados estão listados na legenda."
                ) : (
                  "Envie uma radiografia para visualizar os achados aqui."
                )}
              </div>
            )}
          </div>

          {/* Lousa digital (fora do role="img"; controles acessiveis por teclado) */}
          {hasImage ? (
            <AnnotationToolbar
              tool={tool}
              onToolChange={setTool}
              color={color}
              onColorChange={setColor}
              strokeWidth={strokeWidth}
              onStrokeWidthChange={setStrokeWidth}
              canUndo={canUndo}
              canRedo={canRedo}
              canClear={canClear}
              onUndo={undo}
              onRedo={redo}
              onClear={clear}
            />
          ) : null}

          {/* Tooltip do achado ativo (fora do role="img") */}
          {activeFinding && tooltipPosition && hasImage ? (
            <div
              role="tooltip"
              style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
              className="pointer-events-none absolute z-10 max-w-[220px] -translate-y-[110%] rounded-md bg-slate-900/95 px-2.5 py-1.5 text-xs text-white shadow-lg"
            >
              <p className="font-semibold">{activeFinding.label_pt}</p>
              <p className="text-slate-300">
                {formatConfidence(activeFinding.confidence)} de confiança
              </p>
            </div>
          ) : null}

          {/* Controles de zoom (fora do role="img"; acessiveis por teclado) */}
          {hasImage ? (
            <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
              <ViewerButton label="Aproximar" onClick={() => zoomAt(ZOOM_STEP)}>
                +
              </ViewerButton>
              <ViewerButton label="Afastar" onClick={() => zoomAt(1 / ZOOM_STEP)}>
                −
              </ViewerButton>
              <ViewerButton label="Restaurar zoom" onClick={resetView}>
                ⤾
              </ViewerButton>
            </div>
          ) : null}
        </div>

        <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {hasImage && natural
              ? `Imagem ${natural.width}×${natural.height}px · zoom ${Math.round(view.scale * 100)}%`
              : "Sem imagem carregada"}
          </span>
          <span>
            {tool === "pan"
              ? "Arraste para mover · use +/− para dar zoom"
              : "Lousa ativa · desenhe sobre a radiografia para marcar"}
          </span>
        </figcaption>

        {/* Alternativa textual para leitores de tela (o canvas nao e acessivel). */}
        <p className="sr-only">
          {findings.length === 0
            ? "Nenhum achado demarcado."
            : `Achados demarcados: ${findings
                .map(
                  (finding) =>
                    `${finding.label_pt} com ${formatConfidence(finding.confidence)} de confiança`,
                )
                .join("; ")}.`}
          {annotations.length > 0
            ? ` ${annotations.length} anotação(ões) na lousa digital.`
            : " Selecione a ferramenta de desenho para marcar a radiografia."}
        </p>
      </figure>
    );
  },
);

interface AnnotationNodeOptions {
  listening?: boolean;
}

/**
 * Constroi o no Konva de uma anotacao a partir das coordenadas NORMALIZADAS.
 *
 * `rect` e o retangulo ocupado pela imagem no espaco de destino: `baseRect` no
 * viewer (com zoom/pan) ou `{0,0,natural}` no Stage offscreen do PDF. Assim a
 * MESMA funcao alimenta tela e relatorio, sem divergencia visual.
 *
 * A espessura (`strokeWidth`) e uma fracao da largura e vira pixels pela
 * `annotationStrokePx`; como `strokeScaleEnabled` fica no default (`true`), a
 * tinta escala junto com a imagem — como caneta no papel.
 */
function createAnnotationNode(
  annotation: Annotation,
  rect: StageRect,
  options: AnnotationNodeOptions = {},
): Konva.Shape | null {
  const { points } = annotation;
  if (points.length === 0 || rect.width <= 0 || rect.height <= 0) return null;

  const listening = options.listening ?? false;
  const stroke = annotationStrokePx(annotation.strokeWidth, rect.width);
  const toStage = ([nx, ny]: AnnotationPoint): [number, number] => [
    rect.x + nx * rect.width,
    rect.y + ny * rect.height,
  ];

  const common = {
    stroke: annotation.color,
    strokeWidth: stroke,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    perfectDrawEnabled: false,
    listening,
  };

  if (annotation.tool === "pen") {
    const stagePoints = points.map(toStage);
    const first = stagePoints[0];
    // Clique solto (ou traco minusculo) vira um ponto, nao uma linha invisivel.
    if (isDot(annotation)) {
      if (!first) return null;
      return new Konva.Circle({
        x: first[0],
        y: first[1],
        radius: Math.max(stroke / 2, 0.5),
        fill: annotation.color,
        perfectDrawEnabled: false,
        listening,
      });
    }
    return new Konva.Line({ points: stagePoints.flat(), ...common });
  }

  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  if (!startPoint || !endPoint) return null;
  const start = toStage(startPoint);
  const end = toStage(endPoint);

  if (annotation.tool === "arrow") {
    return new Konva.Arrow({
      points: [start[0], start[1], end[0], end[1]],
      fill: annotation.color,
      pointerLength: Math.max(stroke * 3, 3),
      pointerWidth: Math.max(stroke * 3, 3),
      ...common,
    });
  }

  if (annotation.tool === "rect") {
    return new Konva.Rect({
      x: Math.min(start[0], end[0]),
      y: Math.min(start[1], end[1]),
      width: Math.abs(end[0] - start[0]),
      height: Math.abs(end[1] - start[1]),
      ...common,
    });
  }

  return new Konva.Ellipse({
    x: (start[0] + end[0]) / 2,
    y: (start[1] + end[1]) / 2,
    radiusX: Math.abs(end[0] - start[0]) / 2,
    radiusY: Math.abs(end[1] - start[1]) / 2,
    ...common,
  });
}

interface ViewerButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
}

function ViewerButton({ label, onClick, children }: ViewerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-white/30 bg-slate-900/70 text-base font-bold text-white transition-colors hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

export default RadiographViewer;
