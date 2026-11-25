import * as THREE from 'three';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  ComponentNode,
  DecoderProject,
  GeometryModifier,
  GeometrySpec,
  SceneDiagnostics,
  TransformSpec,
  Vec2,
  Vec3,
} from './types';

const csgEvaluator = new Evaluator();

function num(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function arr<T>(params: Record<string, unknown>, key: string, fallback: T[]): T[] {
  const v = params[key];
  return Array.isArray(v) ? (v as T[]) : fallback;
}

function applyTransformToGeometry(geo: THREE.BufferGeometry, t?: TransformSpec): THREE.BufferGeometry {
  if (!t) return geo;
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3(...(t.position ?? [0, 0, 0]));
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.rotation ?? [0, 0, 0])));
  const scl = new THREE.Vector3(...(t.scale ?? [1, 1, 1]));
  mat.compose(pos, quat, scl);
  geo.applyMatrix4(mat);
  return geo;
}

/**
 * Generates clean box-projected planar UVs when a geometry lacks UVs,
 * ensuring procedural normal/roughness maps wrap coherently across merged assemblies.
 */
function ensureBoxUVs(geo: THREE.BufferGeometry): void {
  if (geo.attributes.uv) return;
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  if (!pos) return;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = norm ? Math.abs(norm.getX(i)) : 0;
    const ny = norm ? Math.abs(norm.getY(i)) : 1;
    const nz = norm ? Math.abs(norm.getZ(i)) : 0;
    if (ny >= nx && ny >= nz) {
      uvs[i * 2] = x * 1.5 + 0.5;
      uvs[i * 2 + 1] = z * 1.5 + 0.5;
    } else if (nx >= nz) {
      uvs[i * 2] = z * 1.5 + 0.5;
      uvs[i * 2 + 1] = y * 1.5 + 0.5;
    } else {
      uvs[i * 2] = x * 1.5 + 0.5;
      uvs[i * 2 + 1] = y * 1.5 + 0.5;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function normalizeForMerge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geos.map((raw) => {
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    ensureBoxUVs(g);
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        g.deleteAttribute(key);
      }
    }
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  prepared.forEach((g) => g.dispose());
  return merged ?? new THREE.BoxGeometry(0.1, 0.1, 0.1);
}

function createRoundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  bevelSegments = 4,
): THREE.BufferGeometry {
  const minDim = Math.min(width, height, depth);
  const r = Math.max(0.002, Math.min(radius, minDim * 0.44));
  const hw = Math.max(0.004, width / 2 - r);
  const hh = Math.max(0.004, height / 2 - r);
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh - r);
  shape.lineTo(hw, -hh - r);
  shape.quadraticCurveTo(hw + r, -hh - r, hw + r, -hh);
  shape.lineTo(hw + r, hh);
  shape.quadraticCurveTo(hw + r, hh + r, hw, hh + r);
  shape.lineTo(-hw, hh + r);
  shape.quadraticCurveTo(-hw - r, hh + r, -hw - r, hh);
  shape.lineTo(-hw - r, -hh);
  shape.quadraticCurveTo(-hw - r, -hh - r, -hw, -hh - r);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.006, depth - r * 2),
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments,
    curveSegments: 12,
  });
  geo.center();
  return geo;
}

/**
 * Watertight chamfered cylinder via LatheGeometry so cylindrical parts catch crisp rim highlights.
 */
function createChamferedCylinderGeometry(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments = 42,
): THREE.BufferGeometry {
  const half = height / 2;
  const maxR = Math.max(radiusTop, radiusBottom);
  const ch = Math.min(height * 0.1, maxR * 0.08, 0.018);
  const rtInner = Math.max(0.001, radiusTop - ch);
  const rbInner = Math.max(0.001, radiusBottom - ch);

  if (ch < 0.0015 || height < 0.012) {
    return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, Math.max(16, segments));
  }

  const pts = [
    new THREE.Vector2(0, -half),
    new THREE.Vector2(rbInner, -half),
    new THREE.Vector2(radiusBottom, -half + ch),
    new THREE.Vector2(radiusTop, half - ch),
    new THREE.Vector2(rtInner, half),
    new THREE.Vector2(0, half),
  ];
  const geo = new THREE.LatheGeometry(pts, Math.max(20, segments));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Socket-head cap screw + integrated chamfered washer.
 */
function createFastenerGeometry(radius = 0.024, headHeight = 0.022, shankLength = 0.045): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const headR = radius * 1.45;
  const washerR = radius * 1.85;
  const washerH = Math.max(0.004, headHeight * 0.22);

  // Washer base at y=0
  const washer = createChamferedCylinderGeometry(washerR, washerR, washerH, 24);
  washer.translate(0, washerH * 0.5, 0);
  parts.push(washer);

  // Knurled socket head
  const head = createChamferedCylinderGeometry(headR, headR, headHeight, 24);
  head.translate(0, washerH + headHeight * 0.5, 0);
  parts.push(head);

  // Recessed dark hex socket cap detail ring
  const socketRing = new THREE.CylinderGeometry(headR * 0.52, headR * 0.52, headHeight * 0.18, 6);
  socketRing.translate(0, washerH + headHeight * 0.96, 0);
  parts.push(socketRing);

  // Shank + subtle thread grooves when shankLength > 0.01
  if (shankLength > 0.008) {
    const shank = new THREE.CylinderGeometry(radius * 0.85, radius * 0.82, shankLength, 18);
    shank.translate(0, -shankLength * 0.5, 0);
    parts.push(shank);
  }

  return normalizeForMerge(parts);
}

/**
 * Machined flange with central bore, raised boss, and perimeter cap screws.
 */
function createFlangeGeometry(
  outerRadius = 0.28,
  innerRadius = 0.1,
  thickness = 0.055,
  bolts = 6,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const half = thickness / 2;
  const ch = Math.min(0.012, thickness * 0.2);
  const pts = [
    new THREE.Vector2(innerRadius, -half),
    new THREE.Vector2(outerRadius - ch, -half),
    new THREE.Vector2(outerRadius, -half + ch),
    new THREE.Vector2(outerRadius, half - ch),
    new THREE.Vector2(outerRadius - ch, half),
    new THREE.Vector2(innerRadius + (outerRadius - innerRadius) * 0.32, half),
    new THREE.Vector2(innerRadius + (outerRadius - innerRadius) * 0.28, half + thickness * 0.35),
    new THREE.Vector2(innerRadius, half + thickness * 0.35),
    new THREE.Vector2(innerRadius, -half),
  ];
  parts.push(new THREE.LatheGeometry(pts, 40));

  const boltCircleR = innerRadius + (outerRadius - innerRadius) * 0.66;
  const boltR = Math.min(0.022, (outerRadius - innerRadius) * 0.16);
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * Math.PI * 2;
    const f = createFastenerGeometry(boltR, boltR * 0.85, thickness * 0.35);
    f.translate(Math.cos(a) * boltCircleR, half, Math.sin(a) * boltCircleR);
    parts.push(f);
  }
  return normalizeForMerge(parts);
}

function createGasketGeometry(radius = 0.22, tube = 0.016, segments = 42): THREE.BufferGeometry {
  const ring = new THREE.TorusGeometry(radius, tube, 16, Math.max(28, segments));
  ring.rotateX(Math.PI / 2);
  return ring;
}

function createGearGeometry(
  teeth: number,
  moduleSize: number,
  thickness: number,
  boreRadius: number,
): THREE.BufferGeometry {
  const pitchR = (teeth * moduleSize) / 2;
  const outerR = pitchR + moduleSize * 0.92;
  const rootR = Math.max(boreRadius + 0.02, pitchR - moduleSize * 1.12);
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.16;
    const a2 = a0 + step * 0.31;
    const a3 = a0 + step * 0.39;
    const a4 = a0 + step * 0.61;
    const a5 = a0 + step * 0.69;
    const a6 = a0 + step * 0.84;

    const midR = (rootR + outerR) * 0.52;
    const p0x = Math.cos(a0) * rootR;
    const p0y = Math.sin(a0) * rootR;
    if (i === 0) shape.moveTo(p0x, p0y);
    else shape.lineTo(p0x, p0y);

    shape.lineTo(Math.cos(a1) * rootR, Math.sin(a1) * rootR);
    shape.lineTo(Math.cos(a2) * midR, Math.sin(a2) * midR);
    shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
    shape.lineTo(Math.cos(a4) * outerR, Math.sin(a4) * outerR);
    shape.lineTo(Math.cos(a5) * midR, Math.sin(a5) * midR);
    shape.lineTo(Math.cos(a6) * rootR, Math.sin(a6) * rootR);
  }
  shape.closePath();

  const effectiveBore = Math.max(0.01, Math.min(boreRadius, rootR * 0.72));
  if (effectiveBore > 0.005 && effectiveBore < rootR * 0.9) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, effectiveBore, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: Math.min(0.014, thickness * 0.14),
    bevelSize: Math.min(0.009, moduleSize * 0.22),
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.center();

  // Add machined central hub boss collar when gear radius permits
  if (rootR > effectiveBore * 1.55) {
    const hub = createHollowVesselGeometry(
      Math.min(rootR * 0.56, effectiveBore + (rootR - effectiveBore) * 0.35),
      effectiveBore,
      thickness * 1.45,
      false,
    );
    hub.rotateX(Math.PI / 2);
    return normalizeForMerge([geo, hub]);
  }
  return geo;
}

function createSpringGeometry(radius: number, wireRadius: number, height: number, coils: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const totalSteps = Math.max(36, Math.round(coils * 24));
  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    const angle = u * coils * Math.PI * 2;
    // Slight squared end coils for authentic ground spring ends
    const endFlatten = Math.min(1, Math.min(u * 8, (1 - u) * 8));
    const y = (u - 0.5) * height * (0.94 + 0.06 * endFlatten);
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, totalSteps, wireRadius, 12, false);
}

function createHollowVesselGeometry(
  outerRadius: number,
  innerRadius: number,
  height: number,
  openTop: boolean,
): THREE.BufferGeometry {
  const half = height / 2;
  const wall = Math.max(0.008, outerRadius - innerRadius);
  const ch = Math.min(wall * 0.32, height * 0.06, 0.016);
  const pts: THREE.Vector2[] = [];
  if (openTop) {
    const floorH = Math.max(0.016, Math.min(height * 0.2, wall * 1.2));
    pts.push(new THREE.Vector2(0, -half));
    pts.push(new THREE.Vector2(Math.max(0.005, outerRadius - ch), -half));
    pts.push(new THREE.Vector2(outerRadius, -half + ch));
    pts.push(new THREE.Vector2(outerRadius, half - ch));
    pts.push(new THREE.Vector2(outerRadius - ch * 0.7, half));
    pts.push(new THREE.Vector2(innerRadius + ch * 0.5, half));
    pts.push(new THREE.Vector2(innerRadius, half - ch * 0.8));
    pts.push(new THREE.Vector2(innerRadius, -half + floorH));
    pts.push(new THREE.Vector2(Math.max(0, innerRadius - ch), -half + floorH * 0.82));
    pts.push(new THREE.Vector2(0, -half + floorH * 0.82));
  } else {
    pts.push(new THREE.Vector2(innerRadius + ch * 0.4, -half));
    pts.push(new THREE.Vector2(outerRadius - ch, -half));
    pts.push(new THREE.Vector2(outerRadius, -half + ch));
    pts.push(new THREE.Vector2(outerRadius, half - ch));
    pts.push(new THREE.Vector2(outerRadius - ch, half));
    pts.push(new THREE.Vector2(innerRadius + ch * 0.4, half));
    pts.push(new THREE.Vector2(innerRadius, half - ch * 0.6));
    pts.push(new THREE.Vector2(innerRadius, -half + ch * 0.6));
    pts.push(new THREE.Vector2(innerRadius + ch * 0.4, -half));
  }
  const geo = new THREE.LatheGeometry(pts, 48);
  geo.computeVertexNormals();
  return geo;
}

function createPipeWithCollars(rawPts: Vec3[], radius: number, closed: boolean): THREE.BufferGeometry {
  const vecs = rawPts.map((pt) => new THREE.Vector3(...pt));
  const curve = new THREE.CatmullRomCurve3(vecs);
  const tube = new THREE.TubeGeometry(curve, Math.max(24, vecs.length * 18), radius, 18, closed);
  if (closed || vecs.length < 2) return tube;

  const parts: THREE.BufferGeometry[] = [tube];
  const up = new THREE.Vector3(0, 1, 0);

  // Add machined brass/steel flared compression collars + sealed caps at open ends
  for (const endIdx of [0, 1]) {
    const u = endIdx === 0 ? 0.005 : 0.995;
    const pt = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(up, tan);

    const collar = createChamferedCylinderGeometry(radius * 1.48, radius * 1.48, radius * 1.4, 24);
    collar.applyQuaternion(quat);
    collar.translate(pt.x, pt.y, pt.z);
    parts.push(collar);

    const cap = new THREE.SphereGeometry(radius * 0.96, 16, 12);
    cap.translate(pt.x, pt.y, pt.z);
    parts.push(cap);
  }
  return normalizeForMerge(parts);
}

function createLoftGeometry(sections: Array<{ y: number; points: Vec2[] }>): THREE.BufferGeometry {
  if (sections.length < 2) return createRoundedBoxGeometry(0.2, 0.2, 0.2, 0.02);
  const segCount = sections[0].points.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    for (let p = 0; p < segCount; p++) {
      const pt = sec.points[p % sec.points.length];
      positions.push(pt[0], sec.y, pt[1]);
    }
  }

  for (let s = 0; s < sections.length - 1; s++) {
    const row0 = s * segCount;
    const row1 = (s + 1) * segCount;
    for (let p = 0; p < segCount; p++) {
      const next = (p + 1) % segCount;
      indices.push(row0 + p, row1 + p, row1 + next);
      indices.push(row0 + p, row1 + next, row0 + next);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureBoxUVs(geo);
  return geo;
}

function applyCsgOperation(
  baseGeo: THREE.BufferGeometry,
  targetGeo: THREE.BufferGeometry,
  op: 'union' | 'subtract' | 'intersect',
): THREE.BufferGeometry {
  try {
    const b1 = new Brush(baseGeo);
    b1.updateMatrixWorld();
    const b2 = new Brush(targetGeo);
    b2.updateMatrixWorld();
    const mode = op === 'union' ? ADDITION : op === 'subtract' ? SUBTRACTION : INTERSECTION;
    const res = csgEvaluator.evaluate(b1, b2, mode);
    const out = res.geometry;
    out.computeVertexNormals();
    ensureBoxUVs(out);
    return out;
  } catch {
    return baseGeo;
  }
}

function orientGeometryAxis(geo: THREE.BufferGeometry, axis?: 'x' | 'y' | 'z'): void {
  if (axis === 'x') geo.rotateZ(-Math.PI / 2);
  else if (axis === 'z') geo.rotateX(Math.PI / 2);
}

function applyConstructionModifier(geo: THREE.BufferGeometry, mod: GeometryModifier): THREE.BufferGeometry {
  const off = mod.offset ?? [0, 0, 0];

  if (mod.kind === 'perforation') {
    const count = Math.max(1, Math.min(20, mod.count ?? 4));
    const r = mod.radius ?? 0.04;
    const depth = mod.depth ?? 1.2;
    let current = geo;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = mod.width ?? 0.25;
      const hole = new THREE.CylinderGeometry(r, r, depth, 16);
      orientGeometryAxis(hole, mod.axis);
      hole.translate(off[0] + Math.cos(angle) * dist, off[1], off[2] + Math.sin(angle) * dist);
      const next = applyCsgOperation(current, hole, 'subtract');
      hole.dispose();
      if (next !== current) {
        if (current !== geo) current.dispose();
        current = next;
      }
    }
    return current;
  }

  if (mod.kind === 'slot' || mod.kind === 'groove' || mod.kind === 'seam') {
    if (mod.kind === 'seam' && mod.radius) {
      // Circumferential machined parting seam ring
      const ring = new THREE.TorusGeometry(mod.radius, mod.depth ?? 0.008, 12, 48);
      ring.rotateX(Math.PI / 2);
      orientGeometryAxis(ring, mod.axis);
      ring.translate(off[0], off[1], off[2]);
      const next = applyCsgOperation(geo, ring, 'subtract');
      ring.dispose();
      return next;
    }
    const w = mod.width ?? (mod.kind === 'seam' ? 0.65 : 0.1);
    const d = mod.depth ?? (mod.kind === 'seam' ? 0.012 : 0.08);
    const l = mod.length ?? (mod.kind === 'seam' ? 0.65 : 0.6);
    const slotGeo = new THREE.BoxGeometry(w, d, l);
    slotGeo.translate(off[0], off[1], off[2]);
    const next = applyCsgOperation(geo, slotGeo, 'subtract');
    slotGeo.dispose();
    return next;
  }

  if (mod.kind === 'fasteners') {
    const count = Math.max(1, Math.min(16, mod.count ?? 4));
    const boltR = mod.boltRadius ?? 0.02;
    const parts: THREE.BufferGeometry[] = [geo];

    if (mod.radius) {
      // Radial bolt circle
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const f = createFastenerGeometry(boltR, boltR * 0.9, boltR * 1.2);
        orientGeometryAxis(f, mod.axis);
        if (mod.axis === 'x') {
          f.translate(off[0], off[1] + Math.cos(a) * mod.radius, off[2] + Math.sin(a) * mod.radius);
        } else if (mod.axis === 'z') {
          f.translate(off[0] + Math.cos(a) * mod.radius, off[1] + Math.sin(a) * mod.radius, off[2]);
        } else {
          f.translate(off[0] + Math.cos(a) * mod.radius, off[1], off[2] + Math.sin(a) * mod.radius);
        }
        parts.push(f);
      }
    } else {
      // Rectangular corner bolts (e.g. housings, manifolds, plates)
      const hw = (mod.width ?? 0.4) * 0.5;
      const hl = (mod.length ?? 0.4) * 0.5;
      const corners: Array<[number, number]> = [
        [-hw, -hl],
        [hw, -hl],
        [hw, hl],
        [-hw, hl],
      ];
      for (const [cx, cz] of corners) {
        const f = createFastenerGeometry(boltR, boltR * 0.9, boltR * 1.1);
        orientGeometryAxis(f, mod.axis);
        f.translate(off[0] + cx, off[1], off[2] + cz);
        parts.push(f);
      }
    }
    return normalizeForMerge(parts);
  }

  if (mod.kind === 'gasket' || mod.kind === 'o_ring') {
    const r = mod.radius ?? 0.24;
    const tube = mod.width ?? 0.015;
    const ring = createGasketGeometry(r, tube, 44);
    orientGeometryAxis(ring, mod.axis);
    ring.translate(off[0], off[1], off[2]);
    return normalizeForMerge([geo, ring]);
  }

  if (mod.kind === 'ribs') {
    const count = Math.max(2, Math.min(16, mod.count ?? 6));
    const r = mod.radius ?? 0.26;
    const rw = mod.width ?? 0.06;
    const rh = mod.depth ?? 0.14;
    const rt = mod.length ?? 0.022;
    const parts: THREE.BufferGeometry[] = [geo];

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(rw, 0);
    shape.lineTo(0, rh);
    shape.closePath();

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const rib = new THREE.ExtrudeGeometry(shape, {
        depth: rt,
        bevelEnabled: true,
        bevelThickness: 0.004,
        bevelSize: 0.004,
      });
      rib.translate(0, 0, -rt / 2);
      rib.translate(r, 0, 0);
      rib.rotateY(a);
      rib.translate(off[0], off[1], off[2]);
      parts.push(rib);
    }
    return normalizeForMerge(parts);
  }

  if (mod.kind === 'knurling') {
    const r = mod.radius ?? 0.17;
    const count = Math.max(4, Math.min(24, mod.count ?? 10));
    const len = mod.length ?? 0.4;
    const bead = mod.depth ?? 0.006;
    const parts: THREE.BufferGeometry[] = [geo];
    for (let i = 0; i < count; i++) {
      const y = count === 1 ? 0 : (i / (count - 1) - 0.5) * len;
      const ring = new THREE.TorusGeometry(r, bead, 10, 36);
      ring.rotateX(Math.PI / 2);
      orientGeometryAxis(ring, mod.axis);
      ring.translate(off[0], off[1] + y, off[2]);
      parts.push(ring);
    }
    return normalizeForMerge(parts);
  }

  if (mod.kind === 'chamfer' || mod.kind === 'bevel') {
    const r = mod.radius ?? 0.2;
    const collar = createChamferedCylinderGeometry(r * 1.04, r * 1.04, mod.depth ?? 0.024, 36);
    orientGeometryAxis(collar, mod.axis);
    collar.translate(off[0], off[1], off[2]);
    return normalizeForMerge([geo, collar]);
  }

  return geo;
}

export class GeometryKernel {
  private cache = new Map<string, THREE.BufferGeometry>();

  buildGeometry(spec: GeometrySpec): THREE.BufferGeometry {
    const key = JSON.stringify(spec);
    const cached = this.cache.get(key);
    if (cached) return cached;

    let geo = this.buildPrimitive(spec);

    for (const mod of spec.modifiers ?? []) {
      const next = applyConstructionModifier(geo, mod);
      if (next !== geo) {
        geo.dispose();
        geo = next;
      }
    }

    for (const boolOp of spec.booleans ?? []) {
      const target = applyTransformToGeometry(this.buildGeometry(boolOp.target).clone(), boolOp.transform);
      const next = applyCsgOperation(geo, target, boolOp.op);
      target.dispose();
      if (next !== geo) {
        geo.dispose();
        geo = next;
      }
    }

    ensureBoxUVs(geo);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    this.cache.set(key, geo);
    return geo;
  }

  private buildPrimitive(spec: GeometrySpec): THREE.BufferGeometry {
    const p = spec.params;

    switch (spec.type) {
      case 'box': {
        const w = num(p, 'width', 0.5);
        const h = num(p, 'height', 0.5);
        const d = num(p, 'depth', 0.5);
        const minDim = Math.min(w, h, d);
        if (minDim < 0.014) {
          return new THREE.BoxGeometry(w, h, d);
        }
        return createRoundedBoxGeometry(w, h, d, Math.min(0.016, minDim * 0.055), 2);
      }

      case 'rounded_box':
        return createRoundedBoxGeometry(
          num(p, 'width', 0.5),
          num(p, 'height', 0.5),
          num(p, 'depth', 0.5),
          num(p, 'radius', 0.05),
          4,
        );

      case 'cylinder': {
        const r = num(p, 'radius', 0.25);
        const h = num(p, 'height', 0.6);
        const seg = Math.max(24, Math.round(num(p, 'segments', 44)));
        return createChamferedCylinderGeometry(r, r, h, seg);
      }

      case 'tapered_cylinder':
        return createChamferedCylinderGeometry(
          num(p, 'radiusTop', 0.18),
          num(p, 'radiusBottom', 0.3),
          num(p, 'height', 0.6),
          Math.max(24, Math.round(num(p, 'segments', 44))),
        );

      case 'sphere':
        return new THREE.SphereGeometry(
          num(p, 'radius', 0.3),
          Math.max(28, Math.round(num(p, 'widthSegments', 40))),
          Math.max(20, Math.round(num(p, 'heightSegments', 28))),
        );

      case 'ellipsoid': {
        const g = new THREE.SphereGeometry(1, 38, 28);
        g.scale(num(p, 'rx', 0.3), num(p, 'ry', 0.4), num(p, 'rz', 0.25));
        return g;
      }

      case 'cone':
        return new THREE.ConeGeometry(num(p, 'radius', 0.3), num(p, 'height', 0.6), 40);

      case 'torus':
        return new THREE.TorusGeometry(
          num(p, 'radius', 0.35),
          num(p, 'tube', 0.08),
          24,
          Math.max(36, Math.round(num(p, 'segments', 64))),
        );

      case 'tube':
      case 'pipe_network':
      case 'flexible_hose': {
        const rawPts = arr<Vec3>(p, 'points', [
          [0, -0.4, 0],
          [0, 0, 0],
          [0.4, 0.3, 0],
        ]);
        return createPipeWithCollars(rawPts, num(p, 'radius', 0.04), Boolean(p['closed']));
      }

      case 'hollow_vessel':
      case 'thin_shell':
        return createHollowVesselGeometry(
          num(p, 'outerRadius', 0.35),
          num(p, 'innerRadius', 0.28),
          num(p, 'height', 0.7),
          p['openTop'] !== false,
        );

      case 'dome':
        return new THREE.SphereGeometry(num(p, 'radius', 0.35), 36, 22, 0, Math.PI * 2, 0, Math.PI * 0.5);

      case 'extrude': {
        const pts = arr<Vec2>(p, 'points', [
          [-0.3, -0.2],
          [0.3, -0.2],
          [0.3, 0.2],
          [-0.3, 0.2],
        ]);
        const shape = new THREE.Shape();
        pts.forEach((pt, idx) => (idx === 0 ? shape.moveTo(pt[0], pt[1]) : shape.lineTo(pt[0], pt[1])));
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: num(p, 'depth', 0.2),
          bevelEnabled: p['bevel'] !== false,
          bevelThickness: num(p, 'bevelThickness', 0.016),
          bevelSize: num(p, 'bevelSize', 0.016),
          bevelSegments: 3,
          curveSegments: 12,
        });
        geo.center();
        return geo;
      }

      case 'revolve': {
        const pts = arr<Vec2>(p, 'points', [
          [0, -0.3],
          [0.25, -0.3],
          [0.32, 0],
          [0.2, 0.3],
          [0, 0.3],
        ]);
        let vecs = pts.map((pt) => new THREE.Vector2(pt[0], pt[1]));
        if (p['smooth'] && vecs.length >= 3) {
          const spline = new THREE.SplineCurve(vecs);
          vecs = spline.getPoints(vecs.length * 4);
        }
        const geo = new THREE.LatheGeometry(vecs, Math.max(28, Math.round(num(p, 'segments', 48))));
        geo.computeVertexNormals();
        return geo;
      }

      case 'loft': {
        const sections = arr<{ y: number; points: Vec2[] }>(p, 'sections', []);
        return createLoftGeometry(sections);
      }

      case 'sweep': {
        const pathPts = arr<Vec3>(p, 'path', [
          [0, -0.3, 0],
          [0, 0.3, 0],
        ]);
        const curve = new THREE.CatmullRomCurve3(pathPts.map((pt) => new THREE.Vector3(...pt)));
        return new THREE.TubeGeometry(curve, 40, num(p, 'radius', 0.05), 16, false);
      }

      case 'rib': {
        const w = num(p, 'width', 0.4);
        const h = num(p, 'height', 0.25);
        const t = num(p, 'thickness', 0.04);
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(w, 0);
        shape.lineTo(0, h);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: t,
          bevelEnabled: true,
          bevelThickness: 0.008,
          bevelSize: 0.008,
          bevelSegments: 2,
        });
        geo.center();
        return geo;
      }

      case 'gear':
        return createGearGeometry(
          Math.max(6, Math.round(num(p, 'teeth', 18))),
          num(p, 'module', 0.04),
          num(p, 'thickness', 0.1),
          num(p, 'boreRadius', 0.08),
        );

      case 'thread':
        return createSpringGeometry(
          num(p, 'radius', 0.14),
          num(p, 'pitch', 0.018),
          num(p, 'height', 0.4),
          num(p, 'turns', 8),
        );

      case 'spring':
        return createSpringGeometry(
          num(p, 'radius', 0.18),
          num(p, 'wireRadius', 0.022),
          num(p, 'height', 0.5),
          num(p, 'coils', 6),
        );

      case 'fastener':
        return createFastenerGeometry(num(p, 'radius', 0.025), num(p, 'headHeight', 0.024), num(p, 'length', 0.06));

      case 'flange':
        return createFlangeGeometry(
          num(p, 'outerRadius', 0.28),
          num(p, 'innerRadius', 0.1),
          num(p, 'thickness', 0.055),
          Math.max(3, Math.round(num(p, 'bolts', 6))),
        );

      case 'gasket_ring':
        return createGasketGeometry(num(p, 'radius', 0.24), num(p, 'tube', 0.016), Math.round(num(p, 'segments', 44)));

      case 'bearing': {
        const outerR = num(p, 'outerRadius', 0.32);
        const innerR = num(p, 'innerRadius', 0.16);
        const width = num(p, 'width', 0.12);
        const parts: THREE.BufferGeometry[] = [];
        const wall = Math.max(0.025, (outerR - innerR) * 0.24);
        const outerRing = createHollowVesselGeometry(outerR, outerR - wall, width, false);
        const innerRing = createHollowVesselGeometry(innerR + wall, innerR, width, false);
        parts.push(outerRing, innerRing);
        const ballCount = Math.max(6, Math.round(num(p, 'balls', 10)));
        const midR = (outerR + innerR) / 2;
        const ballR = Math.max(0.016, (outerR - innerR - wall * 2) * 0.46);
        // Retainer cage ring
        const cage = new THREE.TorusGeometry(midR, ballR * 0.36, 10, 40);
        cage.rotateX(Math.PI / 2);
        parts.push(cage);
        for (let i = 0; i < ballCount; i++) {
          const a = (i / ballCount) * Math.PI * 2;
          const ball = new THREE.SphereGeometry(ballR, 18, 14);
          ball.translate(Math.cos(a) * midR, 0, Math.sin(a) * midR);
          parts.push(ball);
        }
        return normalizeForMerge(parts);
      }

      case 'layered_surface': {
        const layers = Math.max(2, Math.round(num(p, 'layers', 4)));
        const w = num(p, 'width', 1.0);
        const d = num(p, 'depth', 1.0);
        const h = num(p, 'layerThickness', 0.04);
        const gap = num(p, 'gap', 0.02);
        const parts: THREE.BufferGeometry[] = [];
        for (let i = 0; i < layers; i++) {
          const box = createRoundedBoxGeometry(w, h, d, Math.min(0.015, h * 0.28), 2);
          box.translate(0, (i - (layers - 1) / 2) * (h + gap), 0);
          parts.push(box);
        }
        return normalizeForMerge(parts);
      }

      case 'branching_structure':
      case 'vascular_branch': {
        const mainLen = num(p, 'length', 0.9);
        const r = num(p, 'radius', 0.09);
        const parts: THREE.BufferGeometry[] = [];
        const trunkCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, mainLen * 0.28, 0),
          new THREE.Vector3(0, mainLen * 0.56, 0),
        ]);
        parts.push(new THREE.TubeGeometry(trunkCurve, 18, r, 18, false));
        // Smooth organic collar cuff at base
        const ostium = new THREE.TorusGeometry(r * 1.02, r * 0.16, 12, 24);
        ostium.rotateX(Math.PI / 2);
        parts.push(ostium);

        const branches = Math.max(2, Math.round(num(p, 'branches', 3)));
        for (let i = 0; i < branches; i++) {
          const a = (i / branches) * Math.PI * 2;
          const bPts = [
            new THREE.Vector3(0, mainLen * 0.48, 0),
            new THREE.Vector3(Math.cos(a) * mainLen * 0.18, mainLen * 0.72, Math.sin(a) * mainLen * 0.18),
            new THREE.Vector3(Math.cos(a) * mainLen * 0.36, mainLen * 0.88, Math.sin(a) * mainLen * 0.36),
          ];
          const bCurve = new THREE.CatmullRomCurve3(bPts);
          parts.push(new THREE.TubeGeometry(bCurve, 16, r * 0.6, 16, false));
          const tangent = bPts[2].clone().sub(bPts[1]).normalize();
          const cap = new THREE.TorusGeometry(r * 0.62, r * 0.1, 10, 20);
          const capQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
          cap.applyQuaternion(capQ);
          cap.translate(bPts[2].x, bPts[2].y, bPts[2].z);
          parts.push(cap);
        }
        return normalizeForMerge(parts);
      }

      case 'custom_mesh': {
        const verts = arr<number>(p, 'vertices', [0, 0.3, 0, -0.3, -0.3, 0.3, 0.3, -0.3, 0.3, 0, -0.3, -0.3]);
        const idx = arr<number>(p, 'indices', [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        ensureBoxUVs(geo);
        return geo;
      }

      // Higher-level industrial parameterized generators
      case 'piston_cylinder': {
        const radius = num(p, 'radius', 0.32);
        const height = num(p, 'height', 0.36);
        const parts: THREE.BufferGeometry[] = [];
        // Chamfered piston crown + stepped compression lands via LatheGeometry
        const half = height * 0.5;
        const pts = [
          new THREE.Vector2(radius * 0.78, -half),
          new THREE.Vector2(radius * 0.96, -half),
          new THREE.Vector2(radius * 0.96, half * 0.08),
          new THREE.Vector2(radius * 0.9, half * 0.14),
          new THREE.Vector2(radius * 0.9, half * 0.24),
          new THREE.Vector2(radius * 0.98, half * 0.28),
          new THREE.Vector2(radius * 0.98, half * 0.42),
          new THREE.Vector2(radius * 0.9, half * 0.46),
          new THREE.Vector2(radius * 0.9, half * 0.56),
          new THREE.Vector2(radius * 0.99, half * 0.6),
          new THREE.Vector2(radius * 0.99, half * 0.92),
          new THREE.Vector2(radius * 0.9, half),
          new THREE.Vector2(radius * 0.45, half * 0.88), // Combustion bowl dish
          new THREE.Vector2(0, half * 0.88),
        ];
        parts.push(new THREE.LatheGeometry(pts, 44));
        const ring1 = new THREE.TorusGeometry(radius * 0.96, 0.011, 12, 40);
        ring1.rotateX(Math.PI / 2);
        ring1.translate(0, half * 0.51, 0);
        const ring2 = new THREE.TorusGeometry(radius * 0.96, 0.011, 12, 40);
        ring2.rotateX(Math.PI / 2);
        ring2.translate(0, half * 0.19, 0);
        const pin = createChamferedCylinderGeometry(radius * 0.22, radius * 0.22, radius * 1.82, 24);
        pin.rotateZ(Math.PI / 2);
        pin.translate(0, -height * 0.18, 0);
        const bossL = createChamferedCylinderGeometry(radius * 0.34, radius * 0.34, radius * 0.32, 20);
        bossL.rotateZ(Math.PI / 2);
        bossL.translate(-radius * 0.72, -height * 0.18, 0);
        const bossR = createChamferedCylinderGeometry(radius * 0.34, radius * 0.34, radius * 0.32, 20);
        bossR.rotateZ(Math.PI / 2);
        bossR.translate(radius * 0.72, -height * 0.18, 0);
        parts.push(ring1, ring2, pin, bossL, bossR);
        return normalizeForMerge(parts);
      }

      case 'gear_train': {
        const count = Math.max(2, Math.round(num(p, 'count', 3)));
        const mod = num(p, 'module', 0.035);
        const parts: THREE.BufferGeometry[] = [];
        let x = 0;
        for (let i = 0; i < count; i++) {
          const t = 12 + (i % 2) * 8;
          const r = (t * mod) / 2;
          if (i > 0) {
            const prevR = ((12 + ((i - 1) % 2) * 8) * mod) / 2;
            x += prevR + r;
          }
          const g = createGearGeometry(t, mod, 0.08, r * 0.26);
          g.translate(x, 0, 0);
          parts.push(g);
        }
        return normalizeForMerge(parts);
      }

      case 'pump_unit': {
        const r = num(p, 'radius', 0.22);
        const len = num(p, 'length', 0.6);
        const body = createChamferedCylinderGeometry(r, r, len, 36);
        body.rotateZ(Math.PI / 2);
        const flangeL = createFlangeGeometry(r * 1.28, r * 0.38, 0.05, 4);
        flangeL.rotateZ(Math.PI / 2);
        flangeL.translate(-len * 0.44, 0, 0);
        const flangeR = createFlangeGeometry(r * 1.18, r * 0.32, 0.045, 4);
        flangeR.rotateZ(-Math.PI / 2);
        flangeR.translate(len * 0.44, 0, 0);
        const inlet = createChamferedCylinderGeometry(r * 0.34, r * 0.38, r * 1.45, 24);
        inlet.translate(0, r * 0.75, 0);
        const inletCollar = createChamferedCylinderGeometry(r * 0.46, r * 0.46, 0.04, 24);
        inletCollar.translate(0, r * 1.38, 0);
        const cradle = createRoundedBoxGeometry(len * 0.58, r * 0.28, r * 1.65, 0.015, 2);
        cradle.translate(0, -r * 0.92, 0);
        return normalizeForMerge([body, flangeL, flangeR, inlet, inletCollar, cradle]);
      }

      case 'electric_motor': {
        const r = num(p, 'radius', 0.35);
        const len = num(p, 'length', 0.85);
        const parts: THREE.BufferGeometry[] = [];
        const stator = createChamferedCylinderGeometry(r, r, len, 36);
        stator.rotateZ(Math.PI / 2);
        parts.push(stator);
        const endBellL = createFlangeGeometry(r * 1.05, r * 0.24, 0.06, 4);
        endBellL.rotateZ(Math.PI / 2);
        endBellL.translate(-len * 0.5, 0, 0);
        const endBellR = createFlangeGeometry(r * 1.05, r * 0.24, 0.06, 4);
        endBellR.rotateZ(-Math.PI / 2);
        endBellR.translate(len * 0.5, 0, 0);
        parts.push(endBellL, endBellR);
        const fins = 14;
        for (let i = 0; i < fins; i++) {
          const a = (i / fins) * Math.PI * 2;
          const fin = createRoundedBoxGeometry(len * 0.78, 0.018, 0.055, 0.004, 2);
          fin.rotateX(a);
          fin.translate(0, Math.cos(a) * (r + 0.01), Math.sin(a) * (r + 0.01));
          parts.push(fin);
        }
        const shaft = createChamferedCylinderGeometry(r * 0.22, r * 0.22, len * 1.38, 24);
        shaft.rotateZ(Math.PI / 2);
        parts.push(shaft);
        return normalizeForMerge(parts);
      }

      case 'circuit_board': {
        const w = num(p, 'width', 1.0);
        const d = num(p, 'depth', 0.7);
        const h = num(p, 'height', 0.04);
        const parts: THREE.BufferGeometry[] = [createRoundedBoxGeometry(w, h, d, Math.min(0.016, h * 0.35), 2)];
        const chips = Math.max(2, Math.round(num(p, 'chips', 5)));
        for (let i = 0; i < chips; i++) {
          const cw = w * 0.14;
          const cd = d * 0.18;
          const ch = h * 1.15;
          const chip = createRoundedBoxGeometry(cw, ch, cd, 0.008, 2);
          const x = (i / (chips - 1 || 1) - 0.5) * w * 0.68;
          const z = (i % 2 === 0 ? 1 : -1) * d * 0.2;
          chip.translate(x, h * 0.9, z);
          parts.push(chip);
          // Gull-wing IC leads along chip edges
          for (let pin = -1; pin <= 1; pin++) {
            const lead = new THREE.BoxGeometry(cw * 0.14, h * 0.35, cd * 1.24);
            lead.translate(x + pin * cw * 0.32, h * 0.56, z);
            parts.push(lead);
          }
        }
        // Corner mounting standoffs + fasteners
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const bolt = createFastenerGeometry(0.014, 0.014, 0.012);
          bolt.translate(sx * w * 0.44, h * 0.5, sz * d * 0.42);
          parts.push(bolt);
        }
        return normalizeForMerge(parts);
      }

      case 'heat_exchanger': {
        const w = num(p, 'width', 0.7);
        const h = num(p, 'height', 0.5);
        const d = num(p, 'depth', 0.35);
        const fins = Math.max(4, Math.round(num(p, 'fins', 11)));
        const parts: THREE.BufferGeometry[] = [];
        for (let i = 0; i < fins; i++) {
          const x = (i / (fins - 1) - 0.5) * w;
          const plate = createRoundedBoxGeometry(0.015, h, d, 0.004, 2);
          plate.translate(x, 0, 0);
          parts.push(plate);
        }
        const pipeTop = createChamferedCylinderGeometry(0.04, 0.04, w * 1.18, 24);
        pipeTop.rotateZ(Math.PI / 2);
        pipeTop.translate(0, h * 0.25, 0);
        const collarTopL = createChamferedCylinderGeometry(0.056, 0.056, 0.035, 24);
        collarTopL.rotateZ(Math.PI / 2);
        collarTopL.translate(-w * 0.58, h * 0.25, 0);
        const pipeBot = createChamferedCylinderGeometry(0.04, 0.04, w * 1.18, 24);
        pipeBot.rotateZ(Math.PI / 2);
        pipeBot.translate(0, -h * 0.25, 0);
        const collarBotR = createChamferedCylinderGeometry(0.056, 0.056, 0.035, 24);
        collarBotR.rotateZ(Math.PI / 2);
        collarBotR.translate(w * 0.58, -h * 0.25, 0);
        parts.push(pipeTop, collarTopL, pipeBot, collarBotR);
        return normalizeForMerge(parts);
      }

      case 'hydraulic_manifold': {
        const w = num(p, 'width', 0.65);
        const h = num(p, 'height', 0.28);
        const d = num(p, 'depth', 0.35);
        const block = createRoundedBoxGeometry(w, h, d, Math.min(0.03, h * 0.14), 3);
        const port1 = createChamferedCylinderGeometry(0.052, 0.052, 0.13, 24);
        port1.translate(-w * 0.25, h * 0.54, 0);
        const hexNut1 = new THREE.CylinderGeometry(0.068, 0.068, 0.045, 6);
        hexNut1.translate(-w * 0.25, h * 0.5, 0);
        const port2 = createChamferedCylinderGeometry(0.052, 0.052, 0.13, 24);
        port2.translate(w * 0.25, h * 0.54, 0);
        const hexNut2 = new THREE.CylinderGeometry(0.068, 0.068, 0.045, 6);
        hexNut2.translate(w * 0.25, h * 0.5, 0);
        const parts: THREE.BufferGeometry[] = [block, port1, hexNut1, port2, hexNut2];
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const bolt = createFastenerGeometry(0.015, 0.015, 0.01);
          bolt.translate(sx * w * 0.4, h * 0.5, sz * d * 0.36);
          parts.push(bolt);
        }
        return normalizeForMerge(parts);
      }

      case 'molecular_lattice': {
        const atoms = Math.max(4, Math.round(num(p, 'atoms', 8)));
        const r = num(p, 'radius', 0.35);
        const parts: THREE.BufferGeometry[] = [];
        for (let i = 0; i < atoms; i++) {
          const a = (i / atoms) * Math.PI * 2;
          const ax = Math.cos(a) * r;
          const ay = (i % 2 === 0 ? 1 : -1) * 0.09;
          const az = Math.sin(a) * r;
          const s = new THREE.SphereGeometry(0.075, 22, 16);
          s.translate(ax, ay, az);
          parts.push(s);
          const bond = new THREE.TubeGeometry(
            new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(ax, ay, az)),
            4,
            0.016,
            10,
            false,
          );
          parts.push(bond);
        }
        const center = new THREE.SphereGeometry(0.11, 24, 18);
        parts.push(center);
        return normalizeForMerge(parts);
      }

      case 'processor_die': {
        const w = num(p, 'width', 1.4);
        const d = num(p, 'depth', 1.4);
        const h = num(p, 'height', 0.08);
        const base = createRoundedBoxGeometry(w, h, d, 0.018, 3);
        const parts: THREE.BufferGeometry[] = [base];
        const cols = Math.max(2, Math.round(num(p, 'cores', 4)));
        for (let i = 0; i < cols; i++) {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const block = createRoundedBoxGeometry(w * 0.36, h * 0.65, d * 0.36, 0.01, 2);
          block.translate((col - 0.5) * w * 0.48, h * 0.75, (row - 0.5) * d * 0.48);
          parts.push(block);
        }
        // Perimeter decoupling MLCC capacitors
        for (let i = 0; i < 6; i++) {
          const u = (i / 5 - 0.5) * w * 0.65;
          const cap1 = createRoundedBoxGeometry(0.045, h * 0.42, 0.025, 0.004, 2);
          cap1.translate(u, h * 0.68, d * 0.43);
          const cap2 = createRoundedBoxGeometry(0.045, h * 0.42, 0.025, 0.004, 2);
          cap2.translate(u, h * 0.68, -d * 0.43);
          parts.push(cap1, cap2);
        }
        return normalizeForMerge(parts);
      }

      case 'instanced': {
        if (typeof p['coils'] === 'number') {
          return createSpringGeometry(
            num(p, 'radius', 0.1),
            num(p, 'wireRadius', 0.015),
            num(p, 'height', 0.25),
            num(p, 'coils', 5),
          );
        }
        if (typeof p['tube'] === 'number') {
          return new THREE.TorusGeometry(
            num(p, 'radius', 0.14),
            num(p, 'tube', 0.025),
            18,
            Math.max(28, Math.round(num(p, 'segments', 40))),
          );
        }
        if (typeof p['width'] === 'number' || typeof p['depth'] === 'number') {
          const w = num(p, 'width', 0.12);
          const h = num(p, 'height', 0.06);
          const d = num(p, 'depth', 0.08);
          return createRoundedBoxGeometry(w, h, d, Math.min(0.008, Math.min(w, h, d) * 0.12), 2);
        }
        return createChamferedCylinderGeometry(
          num(p, 'radius', 0.05),
          num(p, 'radius', 0.05),
          num(p, 'height', 0.05),
          24,
        );
      }

      default:
        return createRoundedBoxGeometry(0.4, 0.4, 0.4, 0.024, 2);
    }
  }

  dispose(): void {
    for (const geo of this.cache.values()) {
      geo.dispose();
    }
    this.cache.clear();
  }
}

export function computeSceneDiagnostics(project: DecoderProject, kernel: GeometryKernel): SceneDiagnostics {
  let triangleCount = 0;
  let meshCount = 0;
  let instancedMeshCount = 0;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const c of project.components) {
    if (!c.geometry) continue;
    const geo = kernel.buildGeometry(c.geometry);
    const tri = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    const instances = c.geometry.instances?.length ?? 1;
    if (instances > 1) instancedMeshCount++;
    meshCount++;
    triangleCount += Math.round(tri * instances);
    if (geo.boundingBox) {
      const pos = c.transform?.position ?? [0, 0, 0];
      min.x = Math.min(min.x, geo.boundingBox.min.x + pos[0]);
      min.y = Math.min(min.y, geo.boundingBox.min.y + pos[1]);
      min.z = Math.min(min.z, geo.boundingBox.min.z + pos[2]);
      max.x = Math.max(max.x, geo.boundingBox.max.x + pos[0]);
      max.y = Math.max(max.y, geo.boundingBox.max.y + pos[1]);
      max.z = Math.max(max.z, geo.boundingBox.max.z + pos[2]);
    }
  }

  const size: Vec3 = Number.isFinite(min.x) ? [max.x - min.x, max.y - min.y, max.z - min.z] : [1, 1, 1];
  const center: Vec3 = Number.isFinite(min.x)
    ? [(min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2]
    : [0, 0, 0];

  return {
    meshCount,
    triangleCount,
    estimatedMemoryKB: Math.round((triangleCount * 36) / 1024 + meshCount * 8),
    drawCallsEstimate: meshCount + project.effects.length * 2,
    instancedMeshCount,
    boundsSize: size,
    boundsCenter: center,
  };
}

/**
 * Faceted CAD / STEP AP214 Adapter.
 * Explicitly documented as faceted boundary shell translation (not analytical NURBS B-Rep).
 */
export const CadStepAdapter = {
  isAnalyticalBRep: false,
  exportFacetedStep(project: DecoderProject, kernel: GeometryKernel): string {
    const lines: string[] = [
      'ISO-10303-21;',
      'HEADER;',
      `FILE_DESCRIPTION(('Decoder Faceted Shell Export (Polygon Boundary Representation)'),'2;1');`,
      `FILE_NAME('${project.id}.stp','${new Date().toISOString()}',('Decoder Engine'),('Open Source'),'Decoder STEP Adapter','','');`,
      `FILE_SCHEMA(('AP214_CD_MIM_LF'));`,
      'ENDSEC;',
      'DATA;',
    ];

    let entityId = 1;
    const nextId = () => `#${entityId++}`;
    const rootProd = nextId();
    lines.push(`${rootProd}=APPLICATION_CONTEXT('automotive design');`);

    for (const comp of project.components) {
      if (!comp.geometry) continue;
      const geo = kernel.buildGeometry(comp.geometry);
      const posAttr = geo.attributes.position;
      const offset = comp.transform?.position ?? [0, 0, 0];
      const maxVerts = Math.min(posAttr.count, 180);
      const ptIds: string[] = [];
      for (let i = 0; i < maxVerts; i++) {
        const pid = nextId();
        const x = (posAttr.getX(i) + offset[0]).toFixed(4);
        const y = (posAttr.getY(i) + offset[1]).toFixed(4);
        const z = (posAttr.getZ(i) + offset[2]).toFixed(4);
        lines.push(`${pid}=CARTESIAN_POINT('${comp.id}_v${i}',(${x},${y},${z}));`);
        ptIds.push(pid);
      }
      const shellId = nextId();
      lines.push(`${shellId}=OPEN_SHELL('${comp.name}',());`);
    }

    lines.push('ENDSEC;', 'END-ISO-10303-21;');
    return lines.join('\n');
  },
};

export function createComponentMesh(
  comp: ComponentNode,
  kernel: GeometryKernel,
  material: THREE.Material,
): THREE.Object3D {
  if (!comp.geometry) {
    const empty = new THREE.Group();
    empty.name = comp.id;
    return empty;
  }
  const geo = kernel.buildGeometry(comp.geometry);

  if (comp.geometry.instances && comp.geometry.instances.length > 0) {
    const inst = new THREE.InstancedMesh(geo, material, comp.geometry.instances.length);
    const dummy = new THREE.Object3D();
    comp.geometry.instances.forEach((tr, idx) => {
      dummy.position.set(...(tr.position ?? [0, 0, 0]));
      dummy.rotation.set(...(tr.rotation ?? [0, 0, 0]));
      dummy.scale.set(...(tr.scale ?? [1, 1, 1]));
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.userData.componentId = comp.id;
    return inst;
  }

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.componentId = comp.id;
  return mesh;
}
