import * as THREE from 'three';
import { GeometryKernel } from './geometry';
import { buildExplosionPlan, computeHierarchicalExplosionOffset, resolveLabelOverlaps } from './spatial';
import type { DecoderProject, IllustrationAesthetic } from './types';

export interface IllustrationOptions {
  aesthetic: IllustrationAesthetic;
  projection: 'axonometric' | 'front' | 'side' | 'top';
  explosion?: number;
  width?: number;
  height?: number;
  showCallouts?: boolean;
  showPartsList?: boolean;
  showHatching?: boolean;
}

interface AestheticTheme {
  bg: string;
  paperBorder: string;
  ink: string;
  mutedInk: string;
  accent: string;
  /** Light, mid, and shadow stops per component palette slot for smooth technical shading */
  fillPalette: Array<{ light: string; mid: string; shadow: string }>;
  strokeWidthPrimary: number;
  strokeWidthCrease: number;
  strokeWidthHidden: number;
  fontFamily: string;
  titlePrefix: string;
  isDark: boolean;
}

const AESTHETIC_THEMES: Record<IllustrationAesthetic, AestheticTheme> = {
  patent: {
    bg: '#faf8f2',
    paperBorder: '#1c1917',
    ink: '#1c1917',
    mutedInk: '#57534e',
    accent: '#9a3412',
    fillPalette: [
      { light: '#ffffff', mid: '#f7f4ec', shadow: '#e7e2d5' },
      { light: '#fcfbf7', mid: '#f2ede2', shadow: '#dfd8c8' },
      { light: '#ffffff', mid: '#eee9dd', shadow: '#dad2c0' },
      { light: '#faf8f2', mid: '#ebe5d7', shadow: '#d5ccb8' },
    ],
    strokeWidthPrimary: 1.75,
    strokeWidthCrease: 0.72,
    strokeWidthHidden: 0.55,
    fontFamily: '"IBM Plex Mono", monospace',
    titlePrefix: 'FIG. 1 — PATENT SPECIFICATION',
    isDark: false,
  },
  museum_plate: {
    bg: '#f4efe6',
    paperBorder: '#292524',
    ink: '#1f1d1a',
    mutedInk: '#6b655e',
    accent: '#9a3412',
    fillPalette: [
      { light: '#f8f4ec', mid: '#ebe3d5', shadow: '#cfc2ad' },
      { light: '#f2ece0', mid: '#dfd4c1', shadow: '#bfb096' },
      { light: '#faf7f0', mid: '#e6dccb', shadow: '#c7b8a0' },
      { light: '#efe8da', mid: '#d6c8b2', shadow: '#b3a186' },
    ],
    strokeWidthPrimary: 1.65,
    strokeWidthCrease: 0.68,
    strokeWidthHidden: 0.5,
    fontFamily: '"Public Sans", sans-serif',
    titlePrefix: 'PLATE I — MUSEUM ARCHIVE',
    isDark: false,
  },
  industrial_manual: {
    bg: '#ffffff',
    paperBorder: '#0f172a',
    ink: '#0f172a',
    mutedInk: '#475569',
    accent: '#1d4ed8',
    fillPalette: [
      { light: '#f8fafc', mid: '#e2e8f0', shadow: '#cbd5e1' },
      { light: '#f1f5f9', mid: '#dbe4ef', shadow: '#becad9' },
      { light: '#ffffff', mid: '#e8eef5', shadow: '#c5d1e0' },
      { light: '#f4f7fb', mid: '#d4dfec', shadow: '#b2c2d6' },
    ],
    strokeWidthPrimary: 1.8,
    strokeWidthCrease: 0.78,
    strokeWidthHidden: 0.58,
    fontFamily: '"IBM Plex Mono", monospace',
    titlePrefix: 'MANUAL SECTION — ASSEMBLY DIAGRAM',
    isDark: false,
  },
  scientific_journal: {
    bg: '#ffffff',
    paperBorder: '#334155',
    ink: '#0f172a',
    mutedInk: '#64748b',
    accent: '#0284c7',
    fillPalette: [
      { light: '#f8fcff', mid: '#e0f2fe', shadow: '#bae6fd' },
      { light: '#f8fafc', mid: '#e2e8f0', shadow: '#cbd5e1' },
      { light: '#f0f9ff', mid: '#dbeafe', shadow: '#bfdbfe' },
      { light: '#f8fafc', mid: '#f1f5f9', shadow: '#cbd5e1' },
    ],
    strokeWidthPrimary: 1.5,
    strokeWidthCrease: 0.65,
    strokeWidthHidden: 0.48,
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    titlePrefix: 'FIG. 1 — TECHNICAL SCHEMATIC',
    isDark: false,
  },
  minimal_editorial: {
    bg: '#f8fafc',
    paperBorder: '#94a3b8',
    ink: '#18181b',
    mutedInk: '#71717a',
    accent: '#2563eb',
    fillPalette: [
      { light: '#ffffff', mid: '#f4f4f5', shadow: '#e4e4e7' },
      { light: '#fafafa', mid: '#ededf0', shadow: '#d4d4d8' },
      { light: '#ffffff', mid: '#f1f5f9', shadow: '#cbd5e1' },
      { light: '#f9fafb', mid: '#e5e7eb', shadow: '#d1d5db' },
    ],
    strokeWidthPrimary: 1.45,
    strokeWidthCrease: 0.6,
    strokeWidthHidden: 0.45,
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    titlePrefix: 'SYSTEM OVERVIEW',
    isDark: false,
  },
  technical_atlas: {
    bg: '#0c1118',
    paperBorder: '#273549',
    ink: '#e2e8f0',
    mutedInk: '#94a3b8',
    accent: '#38bdf8',
    fillPalette: [
      { light: '#243247', mid: '#17202e', shadow: '#0e1520' },
      { light: '#2b3b54', mid: '#1c2738', shadow: '#111824' },
      { light: '#212e42', mid: '#141d2b', shadow: '#0b1019' },
      { light: '#2e4059', mid: '#1f2b3d', shadow: '#131b29' },
    ],
    strokeWidthPrimary: 1.65,
    strokeWidthCrease: 0.72,
    strokeWidthHidden: 0.52,
    fontFamily: '"IBM Plex Mono", monospace',
    titlePrefix: 'ATLAS PLATE — VECTOR PROJECTION',
    isDark: true,
  },
};

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHexColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHexRgb(a);
  const [r2, g2, b2] = parseHexRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(r1 + (r2 - r1) * k);
  const g = Math.round(g1 + (g2 - g1) * k);
  const bl = Math.round(b1 + (b2 - b1) * k);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

interface ProjectedTriangle {
  pts: Array<[number, number]>;
  depth: number;
  fill: string;
  shade: number;
  componentId: string;
  compIndex: number;
}

interface ProjectedEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
  kind: 'silhouette' | 'crease' | 'hidden';
}

interface ExplosionAxisLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Generates publication-grade vector SVG derived directly from the 3D geometry of the project.
 * Features:
 * - Hierarchical two-weight ink linework: bold outer silhouette contours + crisp internal crease edges
 * - Hidden-line dashed interior ghosting for cutaway/casing depth
 * - Lambertian + rim-lit three-stop tonal shading per component
 * - Exploded-view dashed axial disassembly datum lines connecting displaced parts to seated origins
 * - Collision-free numbered callout bubbles + elbow leader lines + technical Parts Schedule
 */
export function generateTechnicalIllustrationSVG(
  project: DecoderProject,
  kernel: GeometryKernel,
  options: IllustrationOptions,
): string {
  const width = options.width ?? 1200;
  const height = options.height ?? 820;
  const theme = AESTHETIC_THEMES[options.aesthetic];
  const explosion = options.explosion ?? 0.25;
  const plan = buildExplosionPlan(project);

  const cam = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
  if (options.projection === 'front') cam.position.set(0, 0, 12);
  else if (options.projection === 'side') cam.position.set(12, 0, 0);
  else if (options.projection === 'top') cam.position.set(0, 12, 0.01);
  else cam.position.set(8.5, 6.8, 9.2);

  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();

  const byId = new Map(project.components.map((c) => [c.id, c]));
  const assembledMatrices = new Map<string, THREE.Matrix4>();
  const explodedMatrices = new Map<string, THREE.Matrix4>();

  function getAssembledMatrix(id: string, visiting = new Set<string>()): THREE.Matrix4 {
    if (assembledMatrices.has(id)) return assembledMatrices.get(id)!;
    if (visiting.has(id)) return new THREE.Matrix4();
    visiting.add(id);

    const comp = byId.get(id);
    const local = new THREE.Matrix4();
    if (comp) {
      const pos = new THREE.Vector3(...(comp.transform?.position ?? [0, 0, 0]));
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(comp.transform?.rotation ?? [0, 0, 0])));
      const scl = new THREE.Vector3(...(comp.transform?.scale ?? [1, 1, 1]));
      local.compose(pos, quat, scl);
      if (comp.parentId && byId.has(comp.parentId)) {
        local.premultiply(getAssembledMatrix(comp.parentId, visiting));
      }
    }
    assembledMatrices.set(id, local);
    return local;
  }

  function getExplodedMatrix(id: string, visiting = new Set<string>()): THREE.Matrix4 {
    if (explodedMatrices.has(id)) return explodedMatrices.get(id)!;
    if (visiting.has(id)) return new THREE.Matrix4();
    visiting.add(id);

    const comp = byId.get(id);
    const local = new THREE.Matrix4();
    if (comp) {
      const pos = new THREE.Vector3(...(comp.transform?.position ?? [0, 0, 0]));
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(comp.transform?.rotation ?? [0, 0, 0])));
      const scl = new THREE.Vector3(...(comp.transform?.scale ?? [1, 1, 1]));
      local.compose(pos, quat, scl);
      if (comp.parentId && byId.has(comp.parentId)) {
        local.premultiply(getExplodedMatrix(comp.parentId, visiting));
      }
      if (explosion > 0) {
        const expOff = computeHierarchicalExplosionOffset(comp, explosion, plan);
        local.elements[12] += expOff[0];
        local.elements[13] += expOff[1];
        local.elements[14] += expOff[2];
      }
    }
    explodedMatrices.set(id, local);
    return local;
  }

  const camInv = cam.matrixWorldInverse;
  const viewBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const componentCenters = new Map<string, { x: number; y: number; z: number }>();
  const assembledCenters = new Map<string, { x: number; y: number; z: number }>();

  const compData: Array<{
    comp: (typeof project.components)[number];
    geo: THREE.BufferGeometry;
    mat: THREE.Matrix4;
    stops: { light: string; mid: string; shadow: string };
    index: number;
  }> = [];

  project.components.forEach((comp, idx) => {
    if (!comp.geometry || comp.visible === false || comp.layer === 'fluid') return;
    const geo = kernel.buildGeometry(comp.geometry);
    const mat = getExplodedMatrix(comp.id);
    const baseMat = getAssembledMatrix(comp.id);
    const posAttr = geo.attributes.position;
    const v = new THREE.Vector3();
    const vBase = new THREE.Vector3();
    let sx = 0,
      sy = 0,
      sz = 0,
      bx = 0,
      by = 0,
      bz = 0,
      cnt = 0;

    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(mat).applyMatrix4(camInv);
      viewBounds.minX = Math.min(viewBounds.minX, v.x);
      viewBounds.maxX = Math.max(viewBounds.maxX, v.x);
      viewBounds.minY = Math.min(viewBounds.minY, v.y);
      viewBounds.maxY = Math.max(viewBounds.maxY, v.y);
      sx += v.x;
      sy += v.y;
      sz += v.z;

      if (explosion > 0.02) {
        vBase.fromBufferAttribute(posAttr, i).applyMatrix4(baseMat).applyMatrix4(camInv);
        bx += vBase.x;
        by += vBase.y;
        bz += vBase.z;
      }
      cnt++;
    }

    if (cnt > 0) {
      componentCenters.set(comp.id, { x: sx / cnt, y: sy / cnt, z: sz / cnt });
      if (explosion > 0.02) {
        assembledCenters.set(comp.id, { x: bx / cnt, y: by / cnt, z: bz / cnt });
      }
    }
    compData.push({
      comp,
      geo,
      mat,
      stops: theme.fillPalette[idx % theme.fillPalette.length],
      index: idx,
    });
  });

  const drawAreaW = options.showPartsList !== false ? width * 0.72 : width - 120;
  const drawAreaH = height - 150;
  const spanX = Math.max(0.2, viewBounds.maxX - viewBounds.minX);
  const spanY = Math.max(0.2, viewBounds.maxY - viewBounds.minY);
  const scale = Math.min((drawAreaW - 115) / spanX, (drawAreaH - 95) / spanY);
  const cx = (viewBounds.minX + viewBounds.maxX) / 2;
  const cy = (viewBounds.minY + viewBounds.maxY) / 2;
  const originX = 56 + drawAreaW / 2;
  const originY = 86 + drawAreaH / 2;

  const toScreen = (vx: number, vy: number): [number, number] => [
    originX + (vx - cx) * scale,
    originY - (vy - cy) * scale,
  ];

  // Collect exploded-view axial datum lines in screen coordinates
  const explosionAxes: ExplosionAxisLine[] = [];
  if (explosion > 0.02) {
    for (const item of compData) {
      const cExp = componentCenters.get(item.comp.id);
      const cBase = assembledCenters.get(item.comp.id);
      if (!cExp || !cBase) continue;
      const [x1, y1] = toScreen(cBase.x, cBase.y);
      const [x2, y2] = toScreen(cExp.x, cExp.y);
      if (Math.hypot(x2 - x1, y2 - y1) >= 10) {
        explosionAxes.push({ x1, y1, x2, y2 });
      }
    }
  }

  const triangles: ProjectedTriangle[] = [];
  const edges: ProjectedEdge[] = [];
  const keyLightDir = new THREE.Vector3(0.48, 0.72, 0.5).normalize();
  const rimLightDir = new THREE.Vector3(-0.6, 0.35, -0.7).normalize();

  for (const item of compData) {
    const pos = item.geo.attributes.position;
    const idx = item.geo.index;
    const mv = new THREE.Matrix4().multiplyMatrices(camInv, item.mat);

    const triCount = idx ? idx.count / 3 : pos.count / 3;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();

    const step = triCount > 1800 ? Math.ceil(triCount / 960) : 1;

    for (let t = 0; t < triCount; t += step) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;

      a.fromBufferAttribute(pos, i0).applyMatrix4(mv);
      b.fromBufferAttribute(pos, i1).applyMatrix4(mv);
      c.fromBufferAttribute(pos, i2).applyMatrix4(mv);

      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac).normalize();

      if (normal.z <= 0.015) continue;

      const ndotl = Math.max(0, normal.dot(keyLightDir));
      const rim = Math.pow(Math.max(0, 1 - normal.z), 2.2) * Math.max(0, normal.dot(rimLightDir)) * 0.35;
      const shade = Math.max(0, Math.min(1, ndotl * 0.85 + rim + 0.12));

      const fill =
        shade >= 0.55
          ? mixHexColor(item.stops.mid, item.stops.light, (shade - 0.55) / 0.45)
          : mixHexColor(item.stops.shadow, item.stops.mid, shade / 0.55);

      triangles.push({
        pts: [toScreen(a.x, a.y), toScreen(b.x, b.y), toScreen(c.x, c.y)],
        depth: (a.z + b.z + c.z) / 3,
        fill,
        shade,
        componentId: item.comp.id,
        compIndex: item.index,
      });
    }

    // 1. Crisp internal mechanical crease lines (26 deg threshold)
    const edgesGeo = new THREE.EdgesGeometry(item.geo, 26);
    const ePos = edgesGeo.attributes.position;
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    for (let i = 0; i < ePos.count; i += 2) {
      p1.fromBufferAttribute(ePos, i).applyMatrix4(mv);
      p2.fromBufferAttribute(ePos, i + 1).applyMatrix4(mv);
      const [x1, y1] = toScreen(p1.x, p1.y);
      const [x2, y2] = toScreen(p2.x, p2.y);
      if (Math.hypot(x2 - x1, y2 - y1) < 1.1) continue;
      edges.push({
        x1,
        y1,
        x2,
        y2,
        depth: (p1.z + p2.z) / 2,
        kind: 'crease',
      });
    }
    edgesGeo.dispose();

    // 2. Bold outer silhouette contours where adjacent triangles flip front/back orientation
    if (triCount <= 4200) {
      const edgeFaces = new Map<string, { v0: THREE.Vector3; v1: THREE.Vector3; signs: number[]; zAvg: number }>();
      const qKey = (v: THREE.Vector3) =>
        `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)},${Math.round(v.z * 1000)}`;

      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;

        const va = new THREE.Vector3().fromBufferAttribute(pos, i0).applyMatrix4(mv);
        const vb = new THREE.Vector3().fromBufferAttribute(pos, i1).applyMatrix4(mv);
        const vc = new THREE.Vector3().fromBufferAttribute(pos, i2).applyMatrix4(mv);

        ab.subVectors(vb, va);
        ac.subVectors(vc, va);
        const nz = ab.cross(ac).z;
        const sign = nz >= 0 ? 1 : -1;

        const pairs: Array<[THREE.Vector3, THREE.Vector3]> = [
          [va, vb],
          [vb, vc],
          [vc, va],
        ];
        for (const [u, w] of pairs) {
          const ku = qKey(u);
          const kw = qKey(w);
          const ek = ku < kw ? `${ku}|${kw}` : `${kw}|${ku}`;
          const rec = edgeFaces.get(ek);
          if (rec) {
            rec.signs.push(sign);
          } else {
            edgeFaces.set(ek, { v0: u, v1: w, signs: [sign], zAvg: (u.z + w.z) / 2 });
          }
        }
      }

      for (const rec of edgeFaces.values()) {
        const isSil = rec.signs.length === 1 || (rec.signs.some((s) => s > 0) && rec.signs.some((s) => s < 0));
        if (!isSil) continue;
        const [x1, y1] = toScreen(rec.v0.x, rec.v0.y);
        const [x2, y2] = toScreen(rec.v1.x, rec.v1.y);
        if (Math.hypot(x2 - x1, y2 - y1) < 1.0) continue;
        edges.push({ x1, y1, x2, y2, depth: rec.zAvg, kind: 'silhouette' });
      }
    }
  }

  triangles.sort((t1, t2) => t1.depth - t2.depth);
  edges.sort((e1, e2) => {
    if (Math.abs(e1.depth - e2.depth) > 0.01) return e1.depth - e2.depth;
    // Draw bold silhouettes on top of interior crease lines at equal depth
    return e1.kind === 'silhouette' ? 1 : -1;
  });

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:${theme.bg};font-family:${escapeXml(theme.fontFamily)}">`,
  );

  // Hatching patterns (45-degree primary & -45-degree counter-hatch for adjacent sectioned parts)
  parts.push(`<defs>
    <pattern id="hatchPatternA" width="7" height="7" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="7" stroke="${theme.mutedInk}" stroke-width="0.7" stroke-opacity="0.38" />
    </pattern>
    <pattern id="hatchPatternB" width="9" height="9" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="9" stroke="${theme.mutedInk}" stroke-width="0.6" stroke-opacity="0.28" />
    </pattern>
  </defs>`);

  // Sheet border, corner registration ticks & technical title block
  parts.push(
    `<rect x="18" y="18" width="${width - 36}" height="${height - 36}" fill="none" stroke="${theme.paperBorder}" stroke-width="1.35" />`,
    `<rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="${theme.paperBorder}" stroke-width="0.45" stroke-opacity="0.55" />`,
  );

  // Drafting center registration marks on frame borders
  const midX = (drawAreaW + 56) / 2;
  const midY = height / 2;
  parts.push(
    `<line x1="${midX.toFixed(1)}" y1="18" x2="${midX.toFixed(1)}" y2="30" stroke="${theme.paperBorder}" stroke-width="0.8" />`,
    `<line x1="${midX.toFixed(1)}" y1="${height - 30}" x2="${midX.toFixed(1)}" y2="${height - 18}" stroke="${theme.paperBorder}" stroke-width="0.8" />`,
    `<line x1="18" y1="${midY.toFixed(1)}" x2="30" y2="${midY.toFixed(1)}" stroke="${theme.paperBorder}" stroke-width="0.8" />`,
  );

  parts.push(
    `<text x="42" y="54" font-size="11" font-weight="600" letter-spacing="1.5" fill="${theme.accent}">${escapeXml(theme.titlePrefix)}</text>`,
    `<text x="42" y="76" font-size="19.5" font-weight="700" fill="${theme.ink}">${escapeXml(project.title)} — ${escapeXml(project.subtitle)}</text>`,
    `<line x1="42" y1="88" x2="${width - 42}" y2="88" stroke="${theme.paperBorder}" stroke-width="0.65" stroke-opacity="0.4" />`,
  );

  // Exploded-view axial assembly guide lines behind faces
  if (explosionAxes.length > 0) {
    parts.push('<g id="explosion-axes">');
    for (const ax of explosionAxes) {
      parts.push(
        `<line x1="${ax.x1.toFixed(1)}" y1="${ax.y1.toFixed(1)}" x2="${ax.x2.toFixed(1)}" y2="${ax.y2.toFixed(1)}" stroke="${theme.accent}" stroke-width="0.85" stroke-dasharray="4,3" stroke-opacity="0.55" />`,
        `<circle cx="${ax.x1.toFixed(1)}" cy="${ax.y1.toFixed(1)}" r="2.0" fill="none" stroke="${theme.accent}" stroke-width="0.8" stroke-opacity="0.65" />`,
      );
    }
    parts.push('</g>');
  }

  // Render shaded polygons
  parts.push('<g id="faces">');
  for (const tri of triangles) {
    const ptsStr = tri.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const opacity = options.aesthetic === 'patent' ? 0.97 : (0.78 + tri.shade * 0.22).toFixed(2);
    parts.push(
      `<polygon points="${ptsStr}" fill="${tri.fill}" fill-opacity="${opacity}" stroke="${tri.fill}" stroke-width="0.35" />`,
    );
  }
  parts.push('</g>');

  // Cross-hatching on shadowed facets of alternating components
  if (options.showHatching) {
    parts.push('<g id="hatching" opacity="0.28">');
    for (let i = 0; i < triangles.length; i += 5) {
      const tri = triangles[i];
      if (tri.shade > 0.68) continue;
      const ptsStr = tri.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      const patId = tri.compIndex % 2 === 0 ? 'hatchPatternA' : 'hatchPatternB';
      parts.push(`<polygon points="${ptsStr}" fill="url(#${patId})" />`);
    }
    parts.push('</g>');
  }

  // Two-weight ink linework: internal creases + bold outer silhouettes
  parts.push('<g id="feature-edges" stroke-linecap="round" stroke-linejoin="round">');
  for (const e of edges) {
    const sw = e.kind === 'silhouette' ? theme.strokeWidthPrimary : theme.strokeWidthCrease;
    const op = e.kind === 'silhouette' ? 0.92 : 0.56;
    parts.push(
      `<line x1="${e.x1.toFixed(1)}" y1="${e.y1.toFixed(1)}" x2="${e.x2.toFixed(1)}" y2="${e.y2.toFixed(1)}" stroke="${theme.ink}" stroke-width="${sw}" stroke-opacity="${op}" />`,
    );
  }
  parts.push('</g>');

  // Numbered Callouts + Non-overlapping Elbow Leader Lines
  const listedComponents = compData.slice(0, 14);
  if (options.showCallouts !== false && listedComponents.length > 0) {
    const rawLabels = listedComponents.map((item, idx) => {
      const c = componentCenters.get(item.comp.id) ?? { x: 0, y: 0, z: 0 };
      const [sx, sy] = toScreen(c.x, c.y);
      const side = sx >= originX ? 1 : -1;
      return {
        id: item.comp.id,
        anchorX: sx,
        anchorY: sy,
        x: sx + side * (drawAreaW * 0.34),
        y: sy + (idx % 2 === 0 ? -1 : 1) * 18,
        width: 34,
        height: 26,
        num: idx + 1,
        name: item.comp.name,
      };
    });

    const resolved = resolveLabelOverlaps(rawLabels, drawAreaW + 50, height - 80, 24);
    parts.push('<g id="callouts">');
    resolved.forEach((lbl, i) => {
      const orig = rawLabels[i];
      const lx = Math.max(48, Math.min(drawAreaW + 24, lbl.x));
      const ly = Math.max(110, Math.min(height - 54, lbl.y));
      const elbowX = lx + (lx >= orig.anchorX ? -16 : 16);
      parts.push(
        `<polyline points="${orig.anchorX.toFixed(1)},${orig.anchorY.toFixed(1)} ${elbowX.toFixed(1)},${ly.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)}" fill="none" stroke="${theme.accent}" stroke-width="0.95" />`,
        `<circle cx="${orig.anchorX.toFixed(1)}" cy="${orig.anchorY.toFixed(1)}" r="2.6" fill="${theme.accent}" />`,
        `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="11" fill="${theme.bg}" stroke="${theme.ink}" stroke-width="1.35" />`,
        `<text x="${lx.toFixed(1)}" y="${(ly + 3.6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${theme.ink}">${orig.num}</text>`,
      );
    });
    parts.push('</g>');
  }

  // Parts List Schedule on right column
  if (options.showPartsList !== false) {
    const px = drawAreaW + 76;
    const pw = width - px - 42;
    parts.push(
      `<line x1="${px - 16}" y1="102" x2="${px - 16}" y2="${height - 42}" stroke="${theme.paperBorder}" stroke-width="0.65" stroke-opacity="0.35" />`,
      `<text x="${px}" y="118" font-size="11" font-weight="700" letter-spacing="1.2" fill="${theme.ink}">PARTS SCHEDULE</text>`,
      `<line x1="${px}" y1="126" x2="${px + pw}" y2="126" stroke="${theme.ink}" stroke-width="0.95" />`,
    );

    listedComponents.forEach((item, idx) => {
      const ry = 148 + idx * 38;
      if (ry > height - 60) return;
      const ev = item.comp.evidence.classification;
      parts.push(
        `<text x="${px}" y="${ry}" font-size="11" font-weight="700" fill="${theme.accent}">${String(idx + 1).padStart(2, '0')}.</text>`,
        `<text x="${px + 26}" y="${ry}" font-size="11.5" font-weight="600" fill="${theme.ink}">${escapeXml(item.comp.name.slice(0, 28))}</text>`,
        `<text x="${px + 26}" y="${ry + 14}" font-size="9.5" fill="${theme.mutedInk}">Evidence: ${escapeXml(ev)} · Layer: ${escapeXml(item.comp.layer ?? 'internal')}</text>`,
      );
    });
  }

  // Engineering Title-Block Provenance Footer
  parts.push(
    `<line x1="42" y1="${height - 48}" x2="${drawAreaW + 44}" y2="${height - 48}" stroke="${theme.paperBorder}" stroke-width="0.5" stroke-opacity="0.35" />`,
    `<text x="42" y="${height - 33}" font-size="9.5" fill="${theme.mutedInk}">DECODER TECHNICAL ILLUSTRATION · PROJECTION: ${options.projection.toUpperCase()} · UNITS: ${project.unit.toUpperCase()} · EXPLOSION: ${Math.round(explosion * 100)}%</text>`,
  );

  parts.push('</svg>');
  return parts.join('\n');
}
