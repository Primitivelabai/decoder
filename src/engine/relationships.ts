import type { DecoderProject, RelationshipSpec, RelationshipType } from './types';

export interface TraceResult {
  focusComponentId: string;
  upstreamIds: Set<string>;
  downstreamIds: Set<string>;
  highlightedRelationshipIds: Set<string>;
  feedbackCycles: string[][];
}

/** How each kind of link is drawn, in the flow key, the flow map and the 3D view alike. */
export type LineStyle = 'solid' | 'dashed' | 'double' | 'dotted' | 'faint';

export const RELATIONSHIP_LINE: Record<RelationshipType, LineStyle> = {
  force: 'solid',
  torque: 'solid',
  rotation: 'solid',
  translation: 'solid',
  liquid_flow: 'solid',
  chemical_exchange: 'solid',
  optical_transmission: 'solid',
  feedback: 'solid',
  logical_dependency: 'solid',
  heat: 'dashed',
  control: 'double',
  signal: 'dotted',
  information: 'dotted',
  electrical_power: 'dotted',
  gas_flow: 'faint',
};

export const RELATIONSHIP_COLORS: Record<RelationshipType, string> = {
  force: '#f59e0b',
  torque: '#f97316',
  rotation: '#eab308',
  translation: '#84cc16',
  electrical_power: '#3b82f6',
  information: '#06b6d4',
  signal: '#38bdf8',
  liquid_flow: '#0ea5e9',
  gas_flow: '#94a3b8',
  heat: '#ef4444',
  chemical_exchange: '#10b981',
  optical_transmission: '#fef08a',
  control: '#a855f7',
  feedback: '#ec4899',
  logical_dependency: '#64748b',
};

export function traceComponentRelationships(
  project: DecoderProject,
  componentId: string,
  filterType?: RelationshipType | 'all',
): TraceResult {
  const rels =
    filterType && filterType !== 'all'
      ? project.relationships.filter((r) => r.type === filterType)
      : project.relationships;

  const upstreamIds = new Set<string>();
  const downstreamIds = new Set<string>();
  const highlightedRelationshipIds = new Set<string>();

  // BFS upstream
  const upQueue = [componentId];
  const upVisited = new Set<string>([componentId]);
  while (upQueue.length > 0) {
    const curr = upQueue.shift()!;
    for (const rel of rels) {
      if (rel.targetId === curr || (rel.bidirectional && rel.sourceId === curr)) {
        const other = rel.targetId === curr ? rel.sourceId : rel.targetId;
        highlightedRelationshipIds.add(rel.id);
        if (!upVisited.has(other)) {
          upVisited.add(other);
          upstreamIds.add(other);
          upQueue.push(other);
        }
      }
    }
  }

  // BFS downstream
  const downQueue = [componentId];
  const downVisited = new Set<string>([componentId]);
  while (downQueue.length > 0) {
    const curr = downQueue.shift()!;
    for (const rel of rels) {
      if (rel.sourceId === curr || (rel.bidirectional && rel.targetId === curr)) {
        const other = rel.sourceId === curr ? rel.targetId : rel.sourceId;
        highlightedRelationshipIds.add(rel.id);
        if (!downVisited.has(other)) {
          downVisited.add(other);
          downstreamIds.add(other);
          downQueue.push(other);
        }
      }
    }
  }

  const feedbackCycles = findFeedbackCycles(rels);

  return {
    focusComponentId: componentId,
    upstreamIds,
    downstreamIds,
    highlightedRelationshipIds,
    feedbackCycles,
  };
}

export function findFeedbackCycles(relationships: RelationshipSpec[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const r of relationships) {
    if (!adj.has(r.sourceId)) adj.set(r.sourceId, []);
    adj.get(r.sourceId)!.push(r.targetId);
  }

  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];

  function dfs(node: string) {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      const s = state.get(next);
      if (!s) {
        dfs(next);
      } else if (s === 'visiting') {
        const idx = stack.indexOf(next);
        if (idx !== -1) {
          cycles.push([...stack.slice(idx), next]);
        }
      }
    }
    stack.pop();
    state.set(node, 'visited');
  }

  for (const key of adj.keys()) {
    if (!state.has(key)) dfs(key);
  }
  return cycles;
}

/** Ids of the links that run along a feedback loop (either way round for two-way links). */
export function findLoopRelationshipIds(relationships: RelationshipSpec[]): Set<string> {
  const pairs = new Set<string>();
  for (const cycle of findFeedbackCycles(relationships)) {
    for (let i = 0; i + 1 < cycle.length; i++) pairs.add(`${cycle[i]}>${cycle[i + 1]}`);
  }
  const ids = new Set<string>();
  for (const r of relationships) {
    if (pairs.has(`${r.sourceId}>${r.targetId}`) || (r.bidirectional && pairs.has(`${r.targetId}>${r.sourceId}`))) {
      ids.add(r.id);
    }
  }
  return ids;
}

export function getComponentRelationships(
  project: DecoderProject,
  componentId: string,
): { incoming: RelationshipSpec[]; outgoing: RelationshipSpec[] } {
  return {
    incoming: project.relationships.filter(
      (r) => r.targetId === componentId || (r.bidirectional && r.sourceId === componentId),
    ),
    outgoing: project.relationships.filter(
      (r) => r.sourceId === componentId || (r.bidirectional && r.targetId === componentId),
    ),
  };
}

export interface CausalGraphNodeLayout {
  componentId: string;
  label: string;
  subsystem: string;
  layer: string;
  rank: number;
  row: number;
  x: number;
  y: number;
  inDegree: number;
  outDegree: number;
}

export interface CausalGraphEdgeLayout {
  relationship: RelationshipSpec;
  from: CausalGraphNodeLayout;
  to: CausalGraphNodeLayout;
  isFeedback: boolean;
  laneOffset: number;
}

export interface CausalGraphLayout {
  width: number;
  height: number;
  maxRank: number;
  nodes: CausalGraphNodeLayout[];
  edges: CausalGraphEdgeLayout[];
  cycles: string[][];
}

/**
 * Deterministic Sugiyama-inspired left-to-right topological layout for relationship graphs.
 * Detects cycle back-edges via DFS, ranks remaining DAG longest-paths left-to-right,
 * and orders nodes within columns to keep causal chains and feedback loops legible.
 */
export function computeCausalGraphLayout(
  project: DecoderProject,
  filterType: RelationshipType | 'all' = 'all',
  width = 760,
  height = 420,
): CausalGraphLayout {
  const activeRels =
    filterType === 'all' ? project.relationships : project.relationships.filter((r) => r.type === filterType);

  const participantIds = new Set<string>();
  for (const r of activeRels) {
    participantIds.add(r.sourceId);
    participantIds.add(r.targetId);
  }

  const participants = project.components.filter((c) => participantIds.has(c.id));
  const displayComps = participants.length > 0 ? participants : project.components.slice(0, 8);
  const compIds = new Set(displayComps.map((c) => c.id));
  const filteredRels = activeRels.filter((r) => compIds.has(r.sourceId) && compIds.has(r.targetId));

  // Detect back-edges so ranking runs on an acyclic subgraph
  const adj = new Map<string, RelationshipSpec[]>();
  for (const id of compIds) adj.set(id, []);
  for (const r of filteredRels) {
    adj.get(r.sourceId)?.push(r);
  }

  const state = new Map<string, 'visiting' | 'visited'>();
  const backEdgeIds = new Set<string>();

  function dfsBackEdges(u: string) {
    state.set(u, 'visiting');
    for (const r of adj.get(u) ?? []) {
      const st = state.get(r.targetId);
      if (r.type === 'feedback') {
        backEdgeIds.add(r.id);
        continue;
      }
      if (!st) {
        dfsBackEdges(r.targetId);
      } else if (st === 'visiting') {
        backEdgeIds.add(r.id);
      }
    }
    state.set(u, 'visited');
  }

  for (const c of displayComps) {
    if (!state.has(c.id)) dfsBackEdges(c.id);
  }

  // Longest-path rank assignment over non-back-edges
  const rankMap = new Map<string, number>();
  for (const c of displayComps) rankMap.set(c.id, 0);

  for (let pass = 0; pass < displayComps.length; pass++) {
    let changed = false;
    for (const r of filteredRels) {
      if (backEdgeIds.has(r.id)) continue;
      const sr = rankMap.get(r.sourceId) ?? 0;
      const tr = rankMap.get(r.targetId) ?? 0;
      if (sr + 1 > tr) {
        rankMap.set(r.targetId, sr + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const columns = new Map<number, typeof displayComps>();
  let maxRank = 0;
  for (const c of displayComps) {
    const rk = rankMap.get(c.id) ?? 0;
    maxRank = Math.max(maxRank, rk);
    if (!columns.has(rk)) columns.set(rk, []);
    columns.get(rk)!.push(c);
  }

  // Sort nodes within each column by subsystem then component order for clean visual lanes
  const orderIdx = new Map(project.components.map((c, i) => [c.id, i]));
  for (const col of columns.values()) {
    col.sort((a, b) => {
      const sa = a.subsystem ?? '';
      const sb = b.subsystem ?? '';
      if (sa !== sb) return sa.localeCompare(sb);
      return (orderIdx.get(a.id) ?? 0) - (orderIdx.get(b.id) ?? 0);
    });
  }

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const r of filteredRels) {
    outDeg.set(r.sourceId, (outDeg.get(r.sourceId) ?? 0) + 1);
    inDeg.set(r.targetId, (inDeg.get(r.targetId) ?? 0) + 1);
  }

  let maxColRows = 1;
  for (const col of columns.values()) {
    maxColRows = Math.max(maxColRows, col.length);
  }

  const effectiveWidth = Math.max(width, (maxRank + 1) * 216 + 72);
  const effectiveHeight = Math.max(height, maxColRows * 84 + 114);

  const padX = Math.min(118, Math.max(92, effectiveWidth * 0.095));
  const padY = 56;
  const usableW = Math.max(140, effectiveWidth - padX * 2);
  const usableH = Math.max(140, effectiveHeight - padY * 2);

  const nodeLayouts = new Map<string, CausalGraphNodeLayout>();
  for (let rk = 0; rk <= maxRank; rk++) {
    const col = columns.get(rk) ?? [];
    const x = maxRank === 0 ? effectiveWidth / 2 : padX + (rk / maxRank) * usableW;
    col.forEach((comp, rowIdx) => {
      const y = col.length === 1 ? effectiveHeight / 2 : padY + ((rowIdx + 0.5) / col.length) * usableH;
      nodeLayouts.set(comp.id, {
        componentId: comp.id,
        label: comp.name,
        subsystem: comp.subsystem ?? 'system',
        layer: comp.layer ?? 'internal',
        rank: rk,
        row: rowIdx,
        x,
        y,
        inDegree: inDeg.get(comp.id) ?? 0,
        outDegree: outDeg.get(comp.id) ?? 0,
      });
    });
  }

  // Track parallel edges between same pair so arcs separate cleanly
  const pairCount = new Map<string, number>();
  const edges: CausalGraphEdgeLayout[] = [];
  for (const rel of filteredRels) {
    const from = nodeLayouts.get(rel.sourceId);
    const to = nodeLayouts.get(rel.targetId);
    if (!from || !to) continue;
    const isFeedback = backEdgeIds.has(rel.id) || to.rank <= from.rank;
    const pairKey = `${rel.sourceId}->${rel.targetId}`;
    const laneOffset = pairCount.get(pairKey) ?? 0;
    pairCount.set(pairKey, laneOffset + 1);
    edges.push({ relationship: rel, from, to, isFeedback, laneOffset });
  }

  return {
    width: effectiveWidth,
    height: effectiveHeight,
    maxRank,
    nodes: Array.from(nodeLayouts.values()),
    edges,
    cycles: findFeedbackCycles(filteredRels),
  };
}
