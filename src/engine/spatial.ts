import type { ComponentNode, DecoderProject, Vec3 } from './types';

export interface SpatialBounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
}

export interface ExplosionPlan {
  /** Final world-space offset per component for normalized explosion t in [0, 1] */
  offsets: Record<string, Vec3>;
  /** Topological disassembly order (1..N) */
  order: string[];
  /** Subsystem centroid groups */
  subsystems: Record<string, { centroid: Vec3; direction: Vec3; componentIds: string[] }>;
}

export function estimateGeometryLocalBounds(comp: ComponentNode): SpatialBounds {
  const g = comp.geometry;
  if (!g) {
    return { min: [-0.05, -0.05, -0.05], max: [0.05, 0.05, 0.05], center: [0, 0, 0], size: [0.1, 0.1, 0.1] };
  }
  const p = g.params;
  const num = (k: string, def: number) =>
    typeof p[k] === 'number' && Number.isFinite(p[k] as number) ? (p[k] as number) : def;

  let hx = 0.25;
  let hy = 0.25;
  let hz = 0.25;

  switch (g.type) {
    case 'box':
    case 'rounded_box':
    case 'thin_shell':
    case 'circuit_board':
    case 'processor_die': {
      hx = num('width', 0.5) / 2;
      hy = num('height', 0.5) / 2;
      hz = num('depth', 0.5) / 2;
      break;
    }
    case 'cylinder':
    case 'tapered_cylinder':
    case 'hollow_vessel':
    case 'thread':
    case 'spring':
    case 'piston_cylinder': {
      const r = Math.max(
        num('radius', 0.25),
        num('radiusTop', 0.25),
        num('radiusBottom', 0.25),
        num('outerRadius', 0.25),
      );
      const h = num('height', num('length', 0.6));
      hx = r;
      hz = r;
      hy = h / 2;
      break;
    }
    case 'sphere':
    case 'dome': {
      const r = num('radius', 0.3);
      hx = r;
      hy = g.type === 'dome' ? r / 2 : r;
      hz = r;
      break;
    }
    case 'ellipsoid': {
      hx = num('rx', 0.3);
      hy = num('ry', 0.4);
      hz = num('rz', 0.3);
      break;
    }
    case 'cone': {
      const r = num('radius', 0.3);
      const h = num('height', 0.6);
      hx = r;
      hz = r;
      hy = h / 2;
      break;
    }
    case 'torus':
    case 'bearing': {
      const r = num('radius', num('outerRadius', 0.35)) + num('tube', 0.08);
      hx = r;
      hz = r;
      hy = num('tube', num('width', 0.12));
      break;
    }
    case 'gear': {
      const r = (num('teeth', 16) * num('module', 0.04)) / 2 + num('module', 0.04);
      const t = num('thickness', 0.12);
      hx = r;
      hy = r;
      hz = t / 2;
      break;
    }
    default: {
      hx = num('width', 0.4) / 2;
      hy = num('height', 0.4) / 2;
      hz = num('depth', 0.4) / 2;
    }
  }

  return {
    min: [-hx, -hy, -hz],
    max: [hx, hy, hz],
    center: [0, 0, 0],
    size: [hx * 2, hy * 2, hz * 2],
  };
}

export function computeWorldPositionMap(project: DecoderProject): Record<string, Vec3> {
  const byId = new Map(project.components.map((c) => [c.id, c]));
  const memo = new Map<string, Vec3>();

  function resolve(id: string, visiting = new Set<string>()): Vec3 {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return [0, 0, 0];
    visiting.add(id);

    const c = byId.get(id);
    if (!c) return [0, 0, 0];

    const local = c.transform?.position ?? [0, 0, 0];
    if (!c.parentId || !byId.has(c.parentId)) {
      memo.set(id, [...local]);
      return memo.get(id)!;
    }

    const parentPos = resolve(c.parentId, visiting);
    const world: Vec3 = [parentPos[0] + local[0], parentPos[1] + local[1], parentPos[2] + local[2]];
    memo.set(id, world);
    return world;
  }

  const result: Record<string, Vec3> = {};
  for (const c of project.components) {
    result[c.id] = resolve(c.id);
  }
  return result;
}

export function computeModelBounds(project: DecoderProject): SpatialBounds {
  const positions = computeWorldPositionMap(project);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (const c of project.components) {
    const pos = positions[c.id] ?? [0, 0, 0];
    const lb = estimateGeometryLocalBounds(c);
    const s = c.transform?.scale ?? [1, 1, 1];
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], pos[i] + lb.min[i] * Math.abs(s[i]));
      max[i] = Math.max(max[i], pos[i] + lb.max[i] * Math.abs(s[i]));
    }
  }

  if (!Number.isFinite(min[0])) {
    return { min: [-1, -1, -1], max: [1, 1, 1], center: [0, 0, 0], size: [2, 2, 2] };
  }

  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const size: Vec3 = [Math.max(0.1, max[0] - min[0]), Math.max(0.1, max[1] - min[1]), Math.max(0.1, max[2] - min[2])];
  return { min, max, center, size };
}

/**
 * Computes hierarchical explosion vectors preserving intelligible subsystem & component relationships.
 * Stage 1 (explosion 0..0.45): Subsystems separate along coherent group axes.
 * Stage 2 (explosion 0.35..1.0): Individual components separate along their assembly/disassembly axes.
 */
export function computeHierarchicalExplosionOffset(
  comp: ComponentNode,
  explosionAmount: number,
  plan: ExplosionPlan,
): Vec3 {
  if (explosionAmount <= 0.0001) return [0, 0, 0];

  const subsystem = comp.disassembly?.subsystem ?? comp.subsystem;
  const subGroup = subsystem ? plan.subsystems[subsystem] : undefined;

  // Two-stage smooth ramp
  const stage1 = Math.min(1, explosionAmount / 0.55);
  const stage2 = Math.max(0, Math.min(1, (explosionAmount - 0.25) / 0.75));

  const subVec = subGroup ? subGroup.direction : ([0, 0, 0] as Vec3);
  const compVec = plan.offsets[comp.id] ?? ([0, 0, 0] as Vec3);

  return [
    subVec[0] * stage1 + compVec[0] * stage2,
    subVec[1] * stage1 + compVec[1] * stage2,
    subVec[2] * stage1 + compVec[2] * stage2,
  ];
}

export function buildExplosionPlan(project: DecoderProject): ExplosionPlan {
  const worldPos = computeWorldPositionMap(project);
  const bounds = computeModelBounds(project);
  const byId = new Map(project.components.map((c) => [c.id, c]));

  // Group into subsystems
  const subsystems: ExplosionPlan['subsystems'] = {};
  for (const c of project.components) {
    const sub = c.disassembly?.subsystem ?? c.subsystem;
    if (!sub) continue;
    if (!subsystems[sub]) {
      subsystems[sub] = { centroid: [0, 0, 0], direction: [0, 0, 0], componentIds: [] };
    }
    subsystems[sub].componentIds.push(c.id);
    const wp = worldPos[c.id];
    subsystems[sub].centroid[0] += wp[0];
    subsystems[sub].centroid[1] += wp[1];
    subsystems[sub].centroid[2] += wp[2];
  }

  for (const [, group] of Object.entries(subsystems)) {
    const n = group.componentIds.length || 1;
    group.centroid = [group.centroid[0] / n, group.centroid[1] / n, group.centroid[2] / n];
    const dx = group.centroid[0] - bounds.center[0];
    const dy = group.centroid[1] - bounds.center[1];
    const dz = group.centroid[2] - bounds.center[2];
    const len = Math.hypot(dx, dy, dz);
    if (len > 0.05) {
      const scale = Math.max(0.6, Math.min(1.4, len * 0.65));
      group.direction = [(dx / len) * scale, (dy / len) * scale * 0.6, (dz / len) * scale];
    }
  }

  // Compute component local disassembly vector
  const offsets: Record<string, Vec3> = {};
  for (const c of project.components) {
    if (c.disassembly) {
      const d = c.disassembly.direction;
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      const dist = c.disassembly.distance;
      offsets[c.id] = [(d[0] / len) * dist, (d[1] / len) * dist, (d[2] / len) * dist];
    } else {
      const wp = worldPos[c.id];
      const dx = wp[0] - bounds.center[0];
      const dy = wp[1] - bounds.center[1];
      const dz = wp[2] - bounds.center[2];
      // Snap to dominant principal axis so parts separate cleanly along engineering axes
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const az = Math.abs(dz);
      if (ax >= ay && ax >= az && ax > 0.01) {
        offsets[c.id] = [Math.sign(dx) * 0.8, 0, 0];
      } else if (az >= ax && az >= ay && az > 0.01) {
        offsets[c.id] = [0, 0, Math.sign(dz) * 0.8];
      } else {
        offsets[c.id] = [0, dy >= 0 ? 0.8 : -0.8, 0];
      }
    }
  }

  // Topological disassembly order
  const order: string[] = [];
  const visited = new Set<string>();
  const sortedByExplicit = [...project.components].sort(
    (a, b) => (a.disassembly?.order ?? 999) - (b.disassembly?.order ?? 999),
  );

  function visit(id: string, stack = new Set<string>()) {
    if (visited.has(id) || stack.has(id)) return;
    stack.add(id);
    const c = byId.get(id);
    if (c?.disassembly?.dependsOn) {
      for (const dep of c.disassembly.dependsOn) {
        if (byId.has(dep)) visit(dep, stack);
      }
    }
    visited.add(id);
    order.push(id);
  }

  for (const c of sortedByExplicit) {
    visit(c.id);
  }

  return { offsets, order, subsystems };
}

export interface ProjectedLabel {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Simple iterative repulsion solver to prevent overlapping 2D callout labels.
 */
export function resolveLabelOverlaps(
  labels: ProjectedLabel[],
  boundsWidth: number,
  boundsHeight: number,
  iterations = 18,
): ProjectedLabel[] {
  const out = labels.map((l) => ({ ...l }));
  const pad = 6;

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const minX = (a.width + b.width) / 2 + pad;
        const minY = (a.height + b.height) / 2 + pad;
        if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
          const pushY = (minY - Math.abs(dy)) * 0.52 * (dy >= 0 ? 1 : -1 || 1);
          const pushX = (minX - Math.abs(dx)) * 0.18 * (dx >= 0 ? 1 : -1 || 1);
          a.y += pushY;
          b.y -= pushY;
          a.x += pushX;
          b.x -= pushX;
        }
      }
      // Clamp within viewport margins
      const a = out[i];
      a.x = Math.max(a.width / 2 + 12, Math.min(boundsWidth - a.width / 2 - 12, a.x));
      a.y = Math.max(a.height / 2 + 12, Math.min(boundsHeight - a.height / 2 - 12, a.y));
    }
  }
  return out;
}
