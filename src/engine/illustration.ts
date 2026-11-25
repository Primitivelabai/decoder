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
  fillPalette: string[];
  strokeWidthPrimary: number;
  strokeWidthSecondary: number;
  fontFamily: string;
  titlePrefix: string;
}

const AESTHETIC_THEMES: Record<IllustrationAesthetic, AestheticTheme> = {
  patent: {
    bg: '#faf8f2',
    paperBorder: '#292524',
    ink: '#1c1917',
    mutedInk: '#57534e',
    accent: '#1c1917',
    fillPalette: ['#ffffff', '#f5f2eb', '#ede9df', '#faf8f2'],
    strokeWidthPrimary: 1.55,
    strokeWidthSecondary: 0.75,
    fontFamily: '"IBM Plex Mono", monospace',
    titlePrefix: 'FIG. 1 — PATENT SPECIFICATION',
  },
  museum_plate: {
    bg: '#f4efe6',
    paperBorder: '#44403c',
    ink: '#1f1d1a',
    mutedInk: '#6b655e',
    accent: '#9a3412',
    fillPalette: ['#ebe3d5', '#dfd4c1', '#f7f3eb', '#d6c8b2'],
    strokeWidthPrimary: 1.35,
    strokeWidthSecondary: 0.7,
    fontFamily: '"Public Sans", sans-serif',
    titlePrefix: 'PLATE I — MUSEUM ARCHIVE',
  },
  industrial_manual: {
    bg: '#ffffff',
    paperBorder: '#0f172a',
    ink: '#0f172a',
    mutedInk: '#475569',
    accent: '#2563eb',
    fillPalette: ['#f1f5f9', '#e2e8f0', '#f8fafc', '#cbd5e1'],
    strokeWidthPrimary: 1.6,
    strokeWidthSecondary: 0.85,
    fontFamily: '"IBM Plex Mono", monospace',
    titlePrefix: 'MANUAL SECTION — ASSEMBLY DIAGRAM',
  },
  scientific_journal: {
    bg: '#ffffff',
    paperBorder: '#334155',
    ink: '#0f172a',
    mutedInk: '#64748b',
    accent: '#0284c7',
    fillPalette: ['#f0f9ff', '#e0f2fe', '#f8fafc', '#f1f5f9'],
    strokeWidthPrimary: 1.3,
    strokeWidthSecondary: 0.65,
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    titlePrefix: 'FIG. 1 — TECHNICAL SCHEMATIC',
  },
  minimal_editorial: {
    bg: '#f8fafc',
    paperBorder: '#cbd5e1',
    ink: '#18181b',
    mutedInk: '#71717a',
    accent: '#3b82f6',
    fillPalette: ['#ffffff', '#f4f4f5', '#e4e4e7', '#fafafa'],
    strokeWidthPrimary: 1.25,
    strokeWidthSecondary: 0.6,
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    titlePrefix: 'SYSTEM OVERVIEW',
  },
  technical_atlas: {
    bg: '#0f141c',
    paperBorder: '#273244',
    ink: '#e2e8f0',
    mutedInk: '#94a3b8',
    accent: '#38bdf8',
    fillPalette: ['#17202e', '#1e293b', '#131b26', '#253347'],
    strokeWidthPrimary: 1.4,
    strokeWidthSecondary: 0.7,
    fontFamily: '"IBM Plex Mono", monospace',
    titlePrefix: 'ATLAS PLATE — VECTOR PROJECTION',
  },
};

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface ProjectedTriangle {
  pts: Array<[number, number]>;
  depth: number;
  fill: string;
  shade: number;
  componentId: string;
}

interface ProjectedEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
  isSilhouette: boolean;
}

/**
 * Generates publication-grade vector SVG derived directly from the 3D geometry of the project.
 * Extracts feature edges via crease angle threshold (never dumps raw triangulation edges),
 * culls backfaces, sorts faces by depth, resolves overlapping callouts, and draws leader lines.
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

  // Build orthographic projection camera based on requested projection
  const cam = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
  if (options.projection === 'front') cam.position.set(0, 0, 12);
  else if (options.projection === 'side') cam.position.set(12, 0, 0);
  else if (options.projection === 'top') cam.position.set(0, 12, 0.01);
  else cam.position.set(8.5, 6.8, 9.2); // Clean axonometric 3/4 view

  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();

  // Compute world-space component transforms & overall bounds
  const byId = new Map(project.components.map((c) => [c.id, c]));
  const worldMatrices = new Map<string, THREE.Matrix4>();

  function getMatrix(id: string, visiting = new Set<string>()): THREE.Matrix4 {
    if (worldMatrices.has(id)) return worldMatrices.get(id)!;
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
        local.premultiply(getMatrix(comp.parentId, visiting));
      }
      if (explosion > 0) {
        const expOff = computeHierarchicalExplosionOffset(comp, explosion, plan);
        local.elements[12] += expOff[0];
        local.elements[13] += expOff[1];
        local.elements[14] += expOff[2];
      }
    }
    worldMatrices.set(id, local);
    return local;
  }

  // First pass: collect projected coordinates in camera space to auto-fit viewport cleanly
  const camInv = cam.matrixWorldInverse;
  const viewBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const componentCenters = new Map<string, { x: number; y: number; z: number }>();

  const compData: Array<{
    comp: (typeof project.components)[number];
    geo: THREE.BufferGeometry;
    mat: THREE.Matrix4;
    color: string;
  }> = [];

  project.components.forEach((comp, idx) => {
    if (!comp.geometry || comp.visible === false || comp.layer === 'fluid') return;
    const geo = kernel.buildGeometry(comp.geometry);
    const mat = getMatrix(comp.id);
    const posAttr = geo.attributes.position;
    const v = new THREE.Vector3();
    let sx = 0,
      sy = 0,
      sz = 0,
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
      cnt++;
    }

    if (cnt > 0) {
      componentCenters.set(comp.id, { x: sx / cnt, y: sy / cnt, z: sz / cnt });
    }
    compData.push({
      comp,
      geo,
      mat,
      color: theme.fillPalette[idx % theme.fillPalette.length],
    });
  });

  const drawAreaW = options.showPartsList !== false ? width * 0.72 : width - 120;
  const drawAreaH = height - 150;
  const spanX = Math.max(0.2, viewBounds.maxX - viewBounds.minX);
  const spanY = Math.max(0.2, viewBounds.maxY - viewBounds.minY);
  const scale = Math.min((drawAreaW - 110) / spanX, (drawAreaH - 90) / spanY);
  const cx = (viewBounds.minX + viewBounds.maxX) / 2;
  const cy = (viewBounds.minY + viewBounds.maxY) / 2;
  const originX = 56 + drawAreaW / 2;
  const originY = 86 + drawAreaH / 2;

  const toScreen = (vx: number, vy: number): [number, number] => [
    originX + (vx - cx) * scale,
    originY - (vy - cy) * scale,
  ];

  // Collect visible front-facing triangles & crease feature edges (threshold 24 degrees)
  const triangles: ProjectedTriangle[] = [];
  const edges: ProjectedEdge[] = [];
  const lightDir = new THREE.Vector3(0.45, 0.7, 0.55).normalize();

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

    // Subsample super-dense meshes cleanly for crisp vector performance while preserving silhouette
    const step = triCount > 1600 ? Math.ceil(triCount / 900) : 1;

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

      // Backface cull in camera space (+Z faces viewer)
      if (normal.z <= 0.02) continue;

      const shade = Math.max(0.15, Math.min(1, normal.dot(lightDir) * 0.55 + 0.45));
      triangles.push({
        pts: [toScreen(a.x, a.y), toScreen(b.x, b.y), toScreen(c.x, c.y)],
        depth: (a.z + b.z + c.z) / 3,
        fill: item.color,
        shade,
        componentId: item.comp.id,
      });
    }

    // Feature edge extraction (EdgesGeometry threshold 24 deg -> NEVER renders flat triangulation lines!)
    const edgesGeo = new THREE.EdgesGeometry(item.geo, 24);
    const ePos = edgesGeo.attributes.position;
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    for (let i = 0; i < ePos.count; i += 2) {
      p1.fromBufferAttribute(ePos, i).applyMatrix4(mv);
      p2.fromBufferAttribute(ePos, i + 1).applyMatrix4(mv);
      const [x1, y1] = toScreen(p1.x, p1.y);
      const [x2, y2] = toScreen(p2.x, p2.y);
      if (Math.hypot(x2 - x1, y2 - y1) < 1.2) continue;
      edges.push({
        x1,
        y1,
        x2,
        y2,
        depth: (p1.z + p2.z) / 2,
        isSilhouette: true,
      });
    }
    edgesGeo.dispose();

    // If smooth curved geometry (torus, sphere, dome, ellipsoid) produced very few crease edges,
    // extract true view-space silhouette edges where adjacent triangles flip front/back orientation.
    if (ePos.count < 16 && triCount <= 3200) {
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
        edges.push({ x1, y1, x2, y2, depth: rec.zAvg, isSilhouette: true });
      }
    }
  }

  // Painter's sort back-to-front
  triangles.sort((t1, t2) => t1.depth - t2.depth);
  edges.sort((e1, e2) => e1.depth - e2.depth);

  // Build SVG string
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:${theme.bg};font-family:${escapeXml(theme.fontFamily)}">`,
  );

  // Hatching pattern for section aesthetics
  parts.push(`<defs>
    <pattern id="hatchPattern" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="8" stroke="${theme.mutedInk}" stroke-width="0.7" stroke-opacity="0.35" />
    </pattern>
  </defs>`);

  // Sheet border & title block
  parts.push(
    `<rect x="18" y="18" width="${width - 36}" height="${height - 36}" fill="none" stroke="${theme.paperBorder}" stroke-width="1.2" />`,
    `<rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="${theme.paperBorder}" stroke-width="0.4" stroke-opacity="0.5" />`,
  );

  parts.push(
    `<text x="42" y="54" font-size="11" font-weight="600" letter-spacing="1.4" fill="${theme.mutedInk}">${escapeXml(theme.titlePrefix)}</text>`,
    `<text x="42" y="76" font-size="20" font-weight="700" fill="${theme.ink}">${escapeXml(project.title)} — ${escapeXml(project.subtitle)}</text>`,
    `<line x1="42" y1="88" x2="${width - 42}" y2="88" stroke="${theme.paperBorder}" stroke-width="0.6" stroke-opacity="0.35" />`,
  );

  // Render shaded polygons
  parts.push('<g id="faces">');
  for (const tri of triangles) {
    const ptsStr = tri.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const opacity = options.aesthetic === 'patent' ? 0.96 : (0.55 + tri.shade * 0.45).toFixed(2);
    parts.push(
      `<polygon points="${ptsStr}" fill="${tri.fill}" fill-opacity="${opacity}" stroke="${tri.fill}" stroke-width="0.3" />`,
    );
  }
  parts.push('</g>');

  // Optional subtle cross-hatching accent on alternate components
  if (options.showHatching) {
    parts.push('<g id="hatching" opacity="0.22">');
    for (let i = 0; i < triangles.length; i += 7) {
      const tri = triangles[i];
      const ptsStr = tri.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      parts.push(`<polygon points="${ptsStr}" fill="url(#hatchPattern)" />`);
    }
    parts.push('</g>');
  }

  // Render selective feature edges
  parts.push('<g id="feature-edges" stroke-linecap="round" stroke-linejoin="round">');
  for (const e of edges) {
    parts.push(
      `<line x1="${e.x1.toFixed(1)}" y1="${e.y1.toFixed(1)}" x2="${e.x2.toFixed(1)}" y2="${e.y2.toFixed(1)}" stroke="${theme.ink}" stroke-width="${theme.strokeWidthSecondary}" stroke-opacity="0.72" />`,
    );
  }
  parts.push('</g>');

  // Numbered Callouts + Non-overlapping Leader Lines
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
        width: 32,
        height: 24,
        num: idx + 1,
        name: item.comp.name,
      };
    });

    const resolved = resolveLabelOverlaps(rawLabels, drawAreaW + 50, height - 80, 22);
    parts.push('<g id="callouts">');
    resolved.forEach((lbl, i) => {
      const orig = rawLabels[i];
      const lx = Math.max(48, Math.min(drawAreaW + 24, lbl.x));
      const ly = Math.max(110, Math.min(height - 54, lbl.y));
      parts.push(
        `<polyline points="${orig.anchorX.toFixed(1)},${orig.anchorY.toFixed(1)} ${((orig.anchorX + lx) / 2).toFixed(1)},${ly.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)}" fill="none" stroke="${theme.accent}" stroke-width="0.9" stroke-dasharray="2,2" />`,
        `<circle cx="${orig.anchorX.toFixed(1)}" cy="${orig.anchorY.toFixed(1)}" r="2.6" fill="${theme.accent}" />`,
        `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="10.5" fill="${theme.bg}" stroke="${theme.ink}" stroke-width="1.2" />`,
        `<text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${theme.ink}">${orig.num}</text>`,
      );
    });
    parts.push('</g>');
  }

  // Parts List Schedule on right column
  if (options.showPartsList !== false) {
    const px = drawAreaW + 76;
    const pw = width - px - 42;
    parts.push(
      `<line x1="${px - 16}" y1="102" x2="${px - 16}" y2="${height - 42}" stroke="${theme.paperBorder}" stroke-width="0.6" stroke-opacity="0.3" />`,
      `<text x="${px}" y="118" font-size="11" font-weight="700" letter-spacing="1.1" fill="${theme.ink}">PARTS SCHEDULE</text>`,
      `<line x1="${px}" y1="126" x2="${px + pw}" y2="126" stroke="${theme.ink}" stroke-width="0.8" />`,
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

  // Footer provenance line
  parts.push(
    `<text x="42" y="${height - 34}" font-size="9.5" fill="${theme.mutedInk}">DECODER TECHNICAL ILLUSTRATION · PROJECTION: ${options.projection.toUpperCase()} · UNITS: ${project.unit.toUpperCase()} · EXPLOSION: ${Math.round(explosion * 100)}%</text>`,
  );

  parts.push('</svg>');
  return parts.join('\n');
}
