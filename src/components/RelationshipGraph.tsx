import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Maximize, Minus, Plus, RotateCcw, X } from 'lucide-react';
import {
  computeCausalGraphLayout,
  traceComponentRelationships,
  type CausalGraphEdgeLayout,
  type CausalGraphNodeLayout,
} from '../engine/relationships';
import type { DecoderProject, EvaluatedSimulationState } from '../engine/types';
import { FlowKey } from './FlowKey';
import { findLoops, linkQuantity, relationshipTypesIn, type FlowFilter } from './flows';
import { exhibitTitle, humanise, lineDash, partName, RELATIONSHIP_LABELS, RELATIONSHIP_LINE } from './ui/labels';

interface RelationshipGraphProps {
  project: DecoderProject;
  selectedComponentId: string | null;
  simState: EvaluatedSimulationState | null;
  onSelectComponent: (componentId: string) => void;
  onTraceIn3D?: () => void;
}

const CARD_W = 142;
const CARD_H = 46;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3.2;

const INK = '#f5f5f5';
const PANEL = '#0f0e12';
const ACCENT = '#ff4f9a';

function buildEdgePath(
  edge: CausalGraphEdgeLayout,
  nodes: CausalGraphNodeLayout[],
  graphHeight: number,
): {
  d: string;
  labelX: number;
  labelY: number;
} {
  const { from, to, isFeedback, laneOffset } = edge;

  if (from.componentId === to.componentId) {
    const x = from.x;
    const y = from.y - CARD_H / 2;
    return {
      d: `M ${x - 20} ${y} C ${x - 32} ${y - 40}, ${x + 32} ${y - 40}, ${x + 20} ${y}`,
      labelX: x,
      labelY: y - 34,
    };
  }

  const minRank = Math.min(from.rank, to.rank);
  const maxRank = Math.max(from.rank, to.rank);
  const spanNodes = nodes.filter((n) => n.rank >= minRank && n.rank <= maxRank);
  const minSpanY = spanNodes.reduce((m, n) => Math.min(m, n.y), Math.min(from.y, to.y));
  const maxSpanY = spanNodes.reduce((m, n) => Math.max(m, n.y), Math.max(from.y, to.y));

  if (!isFeedback && to.rank > from.rank) {
    const x1 = from.x + CARD_W / 2;
    const y1 = from.y;
    const x2 = to.x - CARD_W / 2 - 5;
    const y2 = to.y;
    const dx = Math.max(32, (x2 - x1) * 0.45);
    let laneBend = laneOffset === 0 ? 0 : (laneOffset % 2 === 1 ? 1 : -1) * Math.ceil(laneOffset / 2) * 30;
    if (to.rank - from.rank > 1 && laneBend === 0) {
      const midY = (y1 + y2) / 2;
      const blocked = spanNodes.some(
        (n) => n.rank > from.rank && n.rank < to.rank && Math.abs(n.y - midY) < CARD_H * 0.9,
      );
      if (blocked) {
        laneBend = midY <= graphHeight * 0.5 ? -50 : 50;
      }
    }
    const cy1 = y1 + laneBend;
    const cy2 = y2 + laneBend;
    return {
      d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${cy1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${cy2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      labelX: (x1 + x2) / 2,
      labelY: 0.125 * y1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y2,
    };
  }

  // Feedback / cyclic return arc routed cleanly outside all intermediate nodes
  const topSpace = minSpanY - CARD_H / 2 - 28;
  const bottomSpace = graphHeight - (maxSpanY + CARD_H / 2) - 24;
  const goTop = topSpace >= bottomSpace;
  const dir = goTop ? -1 : 1;
  const x1 = from.x;
  const y1 = from.y + dir * (CARD_H / 2);
  const x2 = to.x;
  const y2 = to.y + dir * (CARD_H / 2 + 5);
  const targetEdgeY = goTop ? minSpanY - CARD_H / 2 : maxSpanY + CARD_H / 2;
  const clearance = 42 + laneOffset * 24 + Math.min(30, Math.abs(from.rank - to.rank) * 5);
  const ctrlY = Math.max(24, Math.min(graphHeight - 18, targetEdgeY + dir * clearance));
  return {
    d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${ctrlY.toFixed(1)}, ${x2.toFixed(1)} ${ctrlY.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    labelX: (x1 + x2) / 2,
    labelY: 0.125 * y1 + 0.75 * ctrlY + 0.125 * y2,
  };
}

interface ViewBoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clampViewBox(vb: ViewBoxRect, fullW: number, fullH: number): ViewBoxRect {
  const minX = -fullW * 0.45;
  const maxX = fullW * 1.45 - vb.w;
  const minY = -fullH * 0.45;
  const maxY = fullH * 1.45 - vb.h;
  return {
    x: Math.max(minX, Math.min(Math.max(minX, maxX), vb.x)),
    y: Math.max(minY, Math.min(Math.max(minY, maxY), vb.y)),
    w: vb.w,
    h: vb.h,
  };
}

function GraphCanvas({
  project,
  filterType,
  selectedComponentId,
  selectedEdgeId,
  simState,
  width,
  height,
  svgHeightClass,
  markerScope,
  onSelectComponent,
  onSelectEdge,
}: {
  project: DecoderProject;
  filterType: FlowFilter;
  selectedComponentId: string | null;
  selectedEdgeId: string | null;
  simState: EvaluatedSimulationState | null;
  width: number;
  height: number;
  svgHeightClass: string;
  markerScope: string;
  onSelectComponent: (id: string) => void;
  onSelectEdge: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    didPan: boolean;
    startX: number;
    startY: number;
    startVb: ViewBoxRect;
  } | null>(null);

  const trace = useMemo(() => {
    if (!selectedComponentId) return null;
    return traceComponentRelationships(project, selectedComponentId, filterType);
  }, [project, selectedComponentId, filterType]);

  const layout = useMemo(
    () => computeCausalGraphLayout(project, filterType, width, height),
    [project, filterType, width, height],
  );
  const loops = useMemo(() => findLoops(project, filterType), [project, filterType]);
  const compMap = useMemo(() => new Map(project.components.map((c) => [c.id, c])), [project.components]);

  const [viewBox, setViewBox] = useState<ViewBoxRect>(() => ({
    x: 0,
    y: 0,
    w: layout.width,
    h: layout.height,
  }));

  // Reset zoom/pan when exhibit, filter, or base layout dimensions change
  useEffect(() => {
    setViewBox({ x: 0, y: 0, w: layout.width, h: layout.height });
  }, [project.id, filterType, layout.width, layout.height]);

  const zoomRatio = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, layout.width / Math.max(1, viewBox.w)));

  const zoomAtPoint = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      setViewBox((prev) => {
        const currentZoom = layout.width / Math.max(1, prev.w);
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * factor));
        if (Math.abs(nextZoom - currentZoom) < 1e-4) return prev;

        const nextW = layout.width / nextZoom;
        const nextH = layout.height / nextZoom;

        let anchorX = prev.x + prev.w * 0.5;
        let anchorY = prev.y + prev.h * 0.5;

        const svg = svgRef.current;
        if (svg && clientX !== undefined && clientY !== undefined) {
          const ctm = svg.getScreenCTM();
          if (ctm) {
            const pt = svg.createSVGPoint();
            pt.x = clientX;
            pt.y = clientY;
            const svgPt = pt.matrixTransform(ctm.inverse());
            anchorX = svgPt.x;
            anchorY = svgPt.y;
          }
        }

        const rx = (anchorX - prev.x) / prev.w;
        const ry = (anchorY - prev.y) / prev.h;
        return clampViewBox(
          {
            x: anchorX - rx * nextW,
            y: anchorY - ry * nextH,
            w: nextW,
            h: nextH,
          },
          layout.width,
          layout.height,
        );
      });
    },
    [layout.width, layout.height],
  );

  const resetZoom = useCallback(() => {
    setViewBox({ x: 0, y: 0, w: layout.width, h: layout.height });
  }, [layout.width, layout.height]);

  // Non-passive wheel listener so scrolling zooms the graph instead of the surrounding panel
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      zoomAtPoint(factor, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAtPoint]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      active: true,
      didPan: false,
      startX: e.clientX,
      startY: e.clientY,
      startVb: viewBox,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.active) return;
    const dxPx = e.clientX - drag.startX;
    const dyPx = e.clientY - drag.startY;
    if (!drag.didPan && Math.hypot(dxPx, dyPx) < 4) return;
    drag.didPan = true;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const scaleX = drag.startVb.w / rect.width;
    const scaleY = drag.startVb.h / rect.height;
    const scale = Math.max(scaleX, scaleY);

    setViewBox(
      clampViewBox(
        {
          x: drag.startVb.x - dxPx * scale,
          y: drag.startVb.y - dyPx * scale,
          w: drag.startVb.w,
          h: drag.startVb.h,
        },
        layout.width,
        layout.height,
      ),
    );
  };

  const handlePointerUp = () => {
    if (!dragRef.current) return;
    const wasPan = dragRef.current.didPan;
    dragRef.current.active = false;
    if (wasPan) {
      window.setTimeout(() => {
        if (dragRef.current) dragRef.current.didPan = false;
      }, 0);
    }
  };

  const rankPositions = useMemo(() => {
    const map = new Map<number, number>();
    for (const n of layout.nodes) {
      if (!map.has(n.rank)) map.set(n.rank, n.x);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [layout.nodes]);

  return (
    <div
      ref={containerRef}
      data-testid={`causal-graph-viewport-${markerScope}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative w-full overflow-hidden select-none cursor-grab active:cursor-grabbing"
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-2 right-2 z-10 flex items-center gap-0.5 bg-panel border border-ink/12 rounded-full p-0.5 text-[11px]"
      >
        <button
          type="button"
          onClick={() => zoomAtPoint(1 / 1.22)}
          aria-label="Zoom out"
          className="dc-btn w-7 h-7 justify-center"
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
        <span
          data-testid={`causal-graph-zoom-${markerScope}`}
          className="font-mono text-ink/72 tabular-nums min-w-[38px] text-center"
        >
          {Math.round(zoomRatio * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomAtPoint(1.22)}
          aria-label="Zoom in"
          className="dc-btn w-7 h-7 justify-center"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
        <button type="button" onClick={resetZoom} aria-label="Reset zoom" className="dc-btn w-7 h-7 justify-center">
          <RotateCcw size={14} strokeWidth={1.5} />
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${viewBox.x.toFixed(1)} ${viewBox.y.toFixed(1)} ${viewBox.w.toFixed(1)} ${viewBox.h.toFixed(1)}`}
        className={`w-full ${svgHeightClass} block select-none`}
      >
        <defs>
          {[
            { id: 'ink', color: INK },
            { id: 'loop', color: ACCENT },
          ].map((m) => (
            <marker
              key={m.id}
              id={`arrow-${m.id}-${markerScope}`}
              viewBox="0 0 10 10"
              refX="8.2"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={m.color} />
            </marker>
          ))}
        </defs>

        {rankPositions.map(([rk, x]) => (
          <g key={rk}>
            <line
              x1={x}
              y1={28}
              x2={x}
              y2={layout.height - 14}
              stroke={INK}
              strokeOpacity={0.05}
              strokeDasharray="3 4"
            />
            <text
              x={x}
              y={17}
              textAnchor="middle"
              fontSize="9"
              fontFamily="Geist Mono, ui-monospace, monospace"
              fill={INK}
              fillOpacity={0.4}
              letterSpacing="0.14em"
            >
              STEP {rk + 1}
            </text>
          </g>
        ))}

        {layout.edges.map((edge) => {
          const rel = edge.relationship;
          const isEdgeSelected = rel.id === selectedEdgeId;
          const isHighlighted = isEdgeSelected || !trace || trace.highlightedRelationshipIds.has(rel.id);
          const activity = simState?.relationshipActivity[rel.id];
          const isActive = activity ? activity.active : true;
          const inLoop = loops.relIds.has(rel.id);
          const style = RELATIONSHIP_LINE[rel.type] ?? 'solid';
          const color = inLoop ? ACCENT : INK;
          const baseOpacity = style === 'faint' ? 0.4 : 0.72;
          const opacity = isEdgeSelected ? 1 : isHighlighted ? (isActive ? baseOpacity : baseOpacity * 0.55) : 0.16;
          const width = isEdgeSelected ? 2.4 : 1.5;
          const { d, labelX, labelY } = buildEdgePath(edge, layout.nodes, layout.height);
          const qtyText = linkQuantity(rel, simState);

          return (
            <g
              key={rel.id}
              onClick={(e) => {
                if (dragRef.current?.didPan) return;
                e.stopPropagation();
                onSelectEdge(rel.id === selectedEdgeId ? null : rel.id);
              }}
              className="cursor-pointer"
            >
              <title>{`${edge.from.label} → ${edge.to.label}: ${rel.label}`}</title>
              <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
              {style === 'double' ? (
                <>
                  <path d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={width + 3} />
                  <path
                    d={d}
                    fill="none"
                    stroke={PANEL}
                    strokeWidth={width}
                    markerEnd={`url(#arrow-${inLoop ? 'loop' : 'ink'}-${markerScope})`}
                  />
                </>
              ) : (
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={width}
                  strokeOpacity={opacity}
                  strokeDasharray={lineDash(style)}
                  strokeLinecap={style === 'dotted' ? 'round' : undefined}
                  markerEnd={`url(#arrow-${inLoop ? 'loop' : 'ink'}-${markerScope})`}
                />
              )}
              {qtyText && isHighlighted && (
                <g transform={`translate(${labelX.toFixed(1)}, ${labelY.toFixed(1)})`}>
                  <rect
                    x={-32}
                    y={-9}
                    width={64}
                    height={18}
                    rx={9}
                    fill={PANEL}
                    stroke={INK}
                    strokeOpacity={isActive ? 0.18 : 0.08}
                  />
                  <text
                    x={0}
                    y={3.4}
                    textAnchor="middle"
                    fontSize="9"
                    fontFamily="Geist Mono, ui-monospace, monospace"
                    fill={INK}
                    fillOpacity={isActive ? 0.85 : 0.4}
                  >
                    {qtyText}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {layout.nodes.map((node: CausalGraphNodeLayout) => {
          const isSelected = node.componentId === selectedComponentId;
          const isUpstream = trace?.upstreamIds.has(node.componentId);
          const isDownstream = trace?.downstreamIds.has(node.componentId);
          const isDimmed = Boolean(trace && !isSelected && !isUpstream && !isDownstream);
          const comp = compMap.get(node.componentId);
          const name = comp ? partName(comp) : node.label;
          const shortName = name.length > 20 ? `${name.slice(0, 19)}…` : name;

          return (
            <g
              key={node.componentId}
              transform={`translate(${(node.x - CARD_W / 2).toFixed(1)}, ${(node.y - CARD_H / 2).toFixed(1)})`}
              onClick={(e) => {
                if (dragRef.current?.didPan) return;
                e.stopPropagation();
                onSelectComponent(node.componentId);
              }}
              opacity={isDimmed ? 0.4 : 1}
              className="cursor-pointer"
            >
              <title>{`${node.label} (${node.subsystem})`}</title>
              <rect
                width={CARD_W}
                height={CARD_H}
                rx={8}
                fill={isSelected ? '#1c1b20' : PANEL}
                stroke={isSelected ? ACCENT : INK}
                strokeOpacity={isSelected ? 1 : isUpstream || isDownstream ? 0.5 : 0.18}
                strokeWidth={isSelected ? 1.6 : 1}
              />
              {loops.nodeIds.has(node.componentId) && <circle cx={CARD_W - 10} cy={10} r={3} fill={ACCENT} />}
              <text
                x={10}
                y={19}
                fontSize="11"
                fontFamily="Geist, ui-sans-serif, sans-serif"
                fontWeight={isSelected ? '600' : '500'}
                fill={INK}
              >
                {shortName}
              </text>
              <text
                x={10}
                y={35}
                fontSize="9"
                fontFamily="Geist, ui-sans-serif, sans-serif"
                fill={INK}
                fillOpacity={0.5}
              >
                {(project.subsystemLabels?.[node.subsystem] ?? humanise(node.subsystem)).slice(0, 14)} · in{' '}
                {node.inDegree} · out {node.outDegree}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FilterChips({
  project,
  value,
  onChange,
}: {
  project: DecoderProject;
  value: FlowFilter;
  onChange: (v: FlowFilter) => void;
}) {
  const types = relationshipTypesIn(project);
  return (
    <div role="radiogroup" aria-label="Show links" className="flex flex-wrap gap-1.5">
      {(['all', ...types] as FlowFilter[]).map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(t)}
            className={`dc-btn h-8 px-3 text-[13px] ${active ? 'bg-ink text-chrome hover:bg-ink hover:text-chrome' : 'dc-btn-outline'}`}
          >
            {t === 'all' ? 'All' : RELATIONSHIP_LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}

export { FilterChips as FlowFilterChips };

function LinkDetail({
  project,
  relId,
  simState,
  onSelectComponent,
  onClear,
}: {
  project: DecoderProject;
  relId: string;
  simState: EvaluatedSimulationState | null;
  onSelectComponent: (id: string) => void;
  onClear: () => void;
}) {
  const rel = project.relationships.find((r) => r.id === relId);
  if (!rel) return null;
  const compMap = new Map(project.components.map((c) => [c.id, c]));
  const src = compMap.get(rel.sourceId);
  const dst = compMap.get(rel.targetId);
  const qty = linkQuantity(rel, simState);
  const act = simState?.relationshipActivity[rel.id];

  return (
    <div className="p-3 rounded-lg bg-ink/3 border border-ink/8 text-[13px] flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center flex-wrap gap-1.5 text-ink">
          <button
            type="button"
            onClick={() => onSelectComponent(rel.sourceId)}
            className="underline decoration-ink/20 hover:decoration-ink"
          >
            {src ? partName(src) : rel.sourceId}
          </button>
          <ArrowRight size={14} strokeWidth={1.5} className="text-ink/50" />
          <button
            type="button"
            onClick={() => onSelectComponent(rel.targetId)}
            className="underline decoration-ink/20 hover:decoration-ink"
          >
            {dst ? partName(dst) : rel.targetId}
          </button>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selected link"
          className="dc-btn w-7 h-7 justify-center"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink/60">
        <span>{RELATIONSHIP_LABELS[rel.type]}</span>
        <span>{rel.label}</span>
        {qty && <span className="font-mono text-ink">{qty}</span>}
        {act && <span>{act.active ? 'Flowing now' : 'Idle now'}</span>}
      </div>
      {rel.mechanism && <p className="text-ink/72">{rel.mechanism}</p>}
      <div className="text-[12px] text-ink/50">Evidence: {humanise(rel.evidence.classification)}</div>
    </div>
  );
}

/** Full-screen graph of every link, opened from the Flows panel or the studio Flows tab. */
export function FlowGraphDialog({
  project,
  selectedComponentId,
  simState,
  initialFilter = 'all',
  onSelectComponent,
  onClose,
}: {
  project: DecoderProject;
  selectedComponentId: string | null;
  simState: EvaluatedSimulationState | null;
  initialFilter?: FlowFilter;
  onSelectComponent: (id: string) => void;
  onClose: () => void;
}) {
  const [filterType, setFilterType] = useState<FlowFilter>(initialFilter);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const types = relationshipTypesIn(project);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Full flow graph"
      className="fixed inset-0 z-50 bg-chrome/80 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="dc-popover dc-anim-pop w-full max-w-6xl p-5 flex flex-col gap-4 max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="dc-label">Flows · {project.relationships.length} links</div>
            <h2 className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ink">{exhibitTitle(project)}</h2>
            <p className="text-[13px] text-ink/60">
              Scroll to zoom, drag to pan, click a part or a link to see what it carries.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close full graph"
            className="dc-btn w-9 h-9 justify-center"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <FilterChips
          project={project}
          value={filterType}
          onChange={(v) => {
            setFilterType(v);
            setSelectedEdgeId(null);
          }}
        />
        <div className="bg-stage border border-ink/12 rounded-xl overflow-hidden">
          <GraphCanvas
            project={project}
            filterType={filterType}
            selectedComponentId={selectedComponentId}
            selectedEdgeId={selectedEdgeId}
            simState={simState}
            width={940}
            height={520}
            svgHeightClass="h-[56vh]"
            markerScope="expanded"
            onSelectComponent={onSelectComponent}
            onSelectEdge={setSelectedEdgeId}
          />
        </div>
        <div className="flex flex-col md:flex-row gap-4 md:items-start">
          <div className="md:w-80 shrink-0">
            <FlowKey types={types} />
          </div>
          {selectedEdgeId && (
            <div className="flex-1">
              <LinkDetail
                project={project}
                relId={selectedEdgeId}
                simState={simState}
                onSelectComponent={onSelectComponent}
                onClear={() => setSelectedEdgeId(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact flow graph for the studio's Flows tab. */
export function RelationshipGraph({
  project,
  selectedComponentId,
  simState,
  onSelectComponent,
  onTraceIn3D,
}: RelationshipGraphProps) {
  const [filterType, setFilterType] = useState<FlowFilter>('all');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const types = relationshipTypesIn(project);

  const trace = useMemo(() => {
    if (!selectedComponentId) return null;
    return traceComponentRelationships(project, selectedComponentId, filterType);
  }, [project, selectedComponentId, filterType]);

  return (
    <div className="flex flex-col gap-3">
      <FilterChips
        project={project}
        value={filterType}
        onChange={(v) => {
          setFilterType(v);
          setSelectedEdgeId(null);
        }}
      />

      <div className="bg-stage border border-ink/12 rounded-xl overflow-hidden">
        <GraphCanvas
          project={project}
          filterType={filterType}
          selectedComponentId={selectedComponentId}
          selectedEdgeId={selectedEdgeId}
          simState={simState}
          width={680}
          height={370}
          svgHeightClass="h-64"
          markerScope="inline"
          onSelectComponent={onSelectComponent}
          onSelectEdge={setSelectedEdgeId}
        />
      </div>

      {selectedEdgeId ? (
        <LinkDetail
          project={project}
          relId={selectedEdgeId}
          simState={simState}
          onSelectComponent={onSelectComponent}
          onClear={() => setSelectedEdgeId(null)}
        />
      ) : (
        <p className="text-[12px] text-ink/50">Click a part or a link to see what it carries.</p>
      )}

      {trace && (
        <div className="text-[13px] text-ink/60 flex flex-wrap items-center justify-between gap-2">
          <span>
            Fed by {trace.upstreamIds.size} · feeds {trace.downstreamIds.size} · {trace.feedbackCycles.length}{' '}
            {trace.feedbackCycles.length === 1 ? 'loop' : 'loops'}
          </span>
          {onTraceIn3D && (
            <button type="button" onClick={onTraceIn3D} className="dc-btn dc-btn-outline h-8 px-3 text-[13px]">
              Trace in 3D
            </button>
          )}
        </div>
      )}

      <div>
        <div className="dc-label mb-2">Key</div>
        <FlowKey types={types} />
      </div>

      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="dc-btn dc-btn-outline h-9 px-3.5 self-start text-ink"
      >
        <Maximize size={16} strokeWidth={1.5} />
        Open full graph
      </button>

      {expanded && (
        <FlowGraphDialog
          project={project}
          selectedComponentId={selectedComponentId}
          simState={simState}
          initialFilter={filterType}
          onSelectComponent={onSelectComponent}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
