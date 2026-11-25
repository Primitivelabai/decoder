import { computeCausalGraphLayout, findFeedbackCycles, findLoopRelationshipIds } from '../engine/relationships';
import type { DecoderProject, EvaluatedSimulationState, RelationshipSpec, RelationshipType } from '../engine/types';
import { unitText } from './ui/labels';

export type FlowFilter = RelationshipType | 'all';

export interface FlowLoops {
  cycles: string[][];
  /** Parts that sit in at least one feedback loop. */
  nodeIds: Set<string>;
  /** Links that close or run along a feedback loop. */
  relIds: Set<string>;
  /** The link in each loop that runs back against the main direction. */
  backLinks: RelationshipSpec[];
}

function filtered(project: DecoderProject, filter: FlowFilter): RelationshipSpec[] {
  return filter === 'all' ? project.relationships : project.relationships.filter((r) => r.type === filter);
}

export function findLoops(project: DecoderProject, filter: FlowFilter = 'all'): FlowLoops {
  const rels = filtered(project, filter);
  const cycles = findFeedbackCycles(rels);
  const nodeIds = new Set<string>();
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length; i++) {
      nodeIds.add(cycle[i]);
    }
  }
  const relIds = findLoopRelationshipIds(rels);
  const layout = computeCausalGraphLayout(project, filter, 680, 390);
  const backLinks = layout.edges
    .filter((e) => e.isFeedback && relIds.has(e.relationship.id))
    .map((e) => e.relationship);
  return { cycles, nodeIds, relIds, backLinks };
}

/** The longest forward chain of links: the exhibit's main path from source to sink. */
export function findMainPath(
  project: DecoderProject,
  filter: FlowFilter = 'all',
): { nodeIds: string[]; links: RelationshipSpec[] } {
  const layout = computeCausalGraphLayout(project, filter, 680, 390);
  const forward = layout.edges.filter((e) => !e.isFeedback && e.from.componentId !== e.to.componentId);
  if (forward.length === 0) return { nodeIds: [], links: [] };

  const order = [...layout.nodes].sort((a, b) => a.rank - b.rank).map((n) => n.componentId);
  const best = new Map<string, { len: number; prev: string | null; link: RelationshipSpec | null }>();
  for (const id of order) best.set(id, { len: 0, prev: null, link: null });
  for (const id of order) {
    const here = best.get(id)!;
    for (const e of forward) {
      if (e.from.componentId !== id) continue;
      const next = best.get(e.to.componentId);
      if (next && here.len + 1 > next.len) {
        best.set(e.to.componentId, { len: here.len + 1, prev: id, link: e.relationship });
      }
    }
  }

  let end: string | null = null;
  let endLen = -1;
  for (const id of order) {
    const b = best.get(id)!;
    if (b.len > endLen) {
      end = id;
      endLen = b.len;
    }
  }
  const nodeIds: string[] = [];
  const links: RelationshipSpec[] = [];
  let cur = end;
  while (cur) {
    nodeIds.unshift(cur);
    const b = best.get(cur)!;
    if (b.link) links.unshift(b.link);
    cur = b.prev;
  }
  return { nodeIds, links };
}

/** Live quantity carried by a link, if the exhibit defines one ("9.0 bar"). */
export function linkQuantity(rel: RelationshipSpec, simState: EvaluatedSimulationState | null): string | null {
  if (!rel.quantityExpr || !simState) return null;
  const act = simState.relationshipActivity[rel.id];
  if (!act || !Number.isFinite(act.quantity)) return null;
  const val = Math.abs(act.quantity) >= 100 ? act.quantity.toFixed(0) : act.quantity.toFixed(1);
  const unit = unitText(rel.unit);
  return unit ? `${val} ${unit}` : val;
}

export function relationshipTypesIn(project: DecoderProject): RelationshipType[] {
  const seen = new Set<RelationshipType>();
  project.relationships.forEach((r) => seen.add(r.type));
  return Array.from(seen);
}
