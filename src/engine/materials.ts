import * as THREE from 'three';
import type { LightingPresetId, MaterialPresetId, MaterialSpec } from './types';

export interface LightingPresetConfig {
  id: LightingPresetId;
  label: string;
  background: string;
  fogColor: string;
  fogDensity: number;
  keyColor: string;
  keyIntensity: number;
  keyPosition: [number, number, number];
  fillSkyColor: string;
  fillGroundColor: string;
  fillIntensity: number;
  rimColor: string;
  rimIntensity: number;
  exposure: number;
  gridColor: string;
  gridOpacity: number;
  isLightBackdrop: boolean;
}

export const LIGHTING_PRESETS: Record<LightingPresetId, LightingPresetConfig> = {
  technical_studio: {
    id: 'technical_studio',
    label: 'Technical Studio',
    background: '#0e1117',
    fogColor: '#0e1117',
    fogDensity: 0.014,
    keyColor: '#fff4e0',
    keyIntensity: 2.45,
    keyPosition: [6, 9, 7],
    fillSkyColor: '#c2d8f8',
    fillGroundColor: '#10141d',
    fillIntensity: 0.68,
    rimColor: '#7dd3fc',
    rimIntensity: 1.35,
    exposure: 1.08,
    gridColor: '#262e3d',
    gridOpacity: 0.36,
    isLightBackdrop: false,
  },
  museum_exhibit: {
    id: 'museum_exhibit',
    label: 'Museum Exhibit',
    background: '#0a0b0e',
    fogColor: '#0a0b0e',
    fogDensity: 0.018,
    keyColor: '#ffe7c4',
    keyIntensity: 2.25,
    keyPosition: [4, 10, 5],
    fillSkyColor: '#9ab0cc',
    fillGroundColor: '#14110f',
    fillIntensity: 0.48,
    rimColor: '#fde68a',
    rimIntensity: 0.96,
    exposure: 1.02,
    gridColor: '#21242c',
    gridOpacity: 0.22,
    isLightBackdrop: false,
  },
  photographic_product: {
    id: 'photographic_product',
    label: 'Photographic Product',
    background: '#151820',
    fogColor: '#151820',
    fogDensity: 0.009,
    keyColor: '#ffffff',
    keyIntensity: 2.6,
    keyPosition: [7, 8.5, 6],
    fillSkyColor: '#dbeafe',
    fillGroundColor: '#1e2129',
    fillIntensity: 0.82,
    rimColor: '#e0f2fe',
    rimIntensity: 1.42,
    exposure: 1.1,
    gridColor: '#2e3442',
    gridOpacity: 0.25,
    isLightBackdrop: false,
  },
  clinical_illustration: {
    id: 'clinical_illustration',
    label: 'Clinical Illustration',
    background: '#eaeff5',
    fogColor: '#eaeff5',
    fogDensity: 0.007,
    keyColor: '#fffaf5',
    keyIntensity: 2.15,
    keyPosition: [5, 10, 6],
    fillSkyColor: '#eff6ff',
    fillGroundColor: '#cbd5e1',
    fillIntensity: 1.05,
    rimColor: '#bae6fd',
    rimIntensity: 0.82,
    exposure: 1.0,
    gridColor: '#cbd5e1',
    gridOpacity: 0.42,
    isLightBackdrop: true,
  },
  dark_lab: {
    id: 'dark_lab',
    label: 'Dark Scientific Lab',
    background: '#06080c',
    fogColor: '#06080c',
    fogDensity: 0.02,
    keyColor: '#e0f2fe',
    keyIntensity: 2.45,
    keyPosition: [5, 8, 5],
    fillSkyColor: '#60a5fa',
    fillGroundColor: '#0c1220',
    fillIntensity: 0.55,
    rimColor: '#38bdf8',
    rimIntensity: 1.45,
    exposure: 1.05,
    gridColor: '#1c2638',
    gridOpacity: 0.34,
    isLightBackdrop: false,
  },
  white_engineering: {
    id: 'white_engineering',
    label: 'White Engineering Sheet',
    background: '#f5f6f8',
    fogColor: '#f5f6f8',
    fogDensity: 0.005,
    keyColor: '#ffffff',
    keyIntensity: 2.05,
    keyPosition: [6, 10, 7],
    fillSkyColor: '#f8fafc',
    fillGroundColor: '#d4d8df',
    fillIntensity: 1.1,
    rimColor: '#94a3b8',
    rimIntensity: 0.68,
    exposure: 0.98,
    gridColor: '#cbd5e1',
    gridOpacity: 0.5,
    isLightBackdrop: true,
  },
};

export interface MaterialPresetDefaults {
  color: string;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  anisotropy?: number;
  anisotropyRotation?: number;
  transmission?: number;
  ior?: number;
  thickness?: number;
  attenuationColor?: string;
  attenuationDistance?: number;
  opacity?: number;
  sheen?: number;
  sheenColor?: string;
  sheenRoughness?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  iridescenceThicknessRange?: [number, number];
  specularIntensity?: number;
  specularColor?: string;
  envMapIntensity?: number;
  normalScale?: number;
  clearcoatNormalScale?: number;
}

/**
 * Tuned for immediate material separation even at mobile thumbnail size:
 * - Brushed steel: cool crisp silver-slate (#cdd6e2) with sharp directional grain
 * - Brass: rich horological CuZn37 gold (#ebb844) with warm specular tint so it never blends into steel
 * - Glass / Watch Crystal: sapphire anti-reflective (AR) blue-cyan thin-film iridescence + crisp edge coat
 */
export const MATERIAL_PRESET_DEFAULTS: Record<MaterialPresetId, MaterialPresetDefaults> = {
  polished_metal: {
    color: '#e6ecf2',
    roughness: 0.07,
    metalness: 0.99,
    anisotropy: 0.24,
    clearcoat: 0.22,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.45,
    normalScale: 0.05,
  },
  brushed_steel: {
    color: '#cbd4e0',
    roughness: 0.22,
    metalness: 0.96,
    anisotropy: 0.78,
    anisotropyRotation: 0,
    specularColor: '#e2eeff',
    clearcoat: 0.08,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.38,
    normalScale: 0.3,
  },
  cast_aluminium: {
    color: '#9ea8b6',
    roughness: 0.44,
    metalness: 0.89,
    anisotropy: 0.12,
    clearcoat: 0.04,
    clearcoatRoughness: 0.42,
    envMapIntensity: 1.18,
    normalScale: 0.36,
  },
  brass: {
    color: '#edb942',
    roughness: 0.15,
    metalness: 0.98,
    anisotropy: 0.72,
    anisotropyRotation: Math.PI * 0.5,
    specularColor: '#ffe599',
    iridescence: 0.06,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [180, 320],
    envMapIntensity: 1.58,
    normalScale: 0.28,
  },
  copper: {
    color: '#e07b48',
    roughness: 0.17,
    metalness: 0.98,
    anisotropy: 0.66,
    anisotropyRotation: Math.PI * 0.5,
    specularColor: '#ffc299',
    iridescence: 0.1,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [200, 400],
    envMapIntensity: 1.52,
    normalScale: 0.26,
  },
  chrome: {
    color: '#f4f7fb',
    roughness: 0.025,
    metalness: 1.0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.025,
    envMapIntensity: 1.72,
    normalScale: 0.03,
  },
  ceramic: {
    color: '#f5f2ec',
    roughness: 0.14,
    metalness: 0.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.04,
    ior: 1.56,
    specularIntensity: 1.0,
    envMapIntensity: 1.2,
    normalScale: 0.1,
    clearcoatNormalScale: 0.05,
  },
  glass: {
    color: '#dff2ff',
    roughness: 0.018,
    metalness: 0.0,
    transmission: 0.94,
    ior: 1.58,
    thickness: 0.65,
    attenuationColor: '#bae6fd',
    attenuationDistance: 1.85,
    // Sapphire watch-crystal AR thin-film coating + bright Fresnel rim coat so glass pops against steel & dark bg!
    clearcoat: 1.0,
    clearcoatRoughness: 0.015,
    iridescence: 0.36,
    iridescenceIOR: 1.38,
    iridescenceThicknessRange: [240, 380],
    specularIntensity: 1.0,
    specularColor: '#e0f2fe',
    opacity: 0.32,
    envMapIntensity: 1.85,
  },
  translucent_plastic: {
    color: '#d8e1ec',
    roughness: 0.22,
    metalness: 0.0,
    transmission: 0.62,
    ior: 1.49,
    thickness: 0.35,
    attenuationColor: '#cbd5e1',
    attenuationDistance: 1.1,
    opacity: 0.52,
    clearcoat: 0.42,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.12,
    normalScale: 0.14,
  },
  abs_plastic: {
    color: '#2d3440',
    roughness: 0.38,
    metalness: 0.0,
    ior: 1.49,
    specularIntensity: 0.85,
    clearcoat: 0.18,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0.96,
    normalScale: 0.22,
  },
  silicone: {
    color: '#2b323d',
    roughness: 0.64,
    metalness: 0.0,
    transmission: 0.12,
    thickness: 0.35,
    attenuationColor: '#1e293b',
    attenuationDistance: 0.45,
    sheen: 0.48,
    sheenColor: '#94a3b8',
    sheenRoughness: 0.62,
    clearcoat: 0.08,
    clearcoatRoughness: 0.48,
    envMapIntensity: 0.78,
    normalScale: 0.2,
  },
  rubber: {
    color: '#181c23',
    roughness: 0.84,
    metalness: 0.0,
    ior: 1.52,
    specularIntensity: 0.42,
    sheen: 0.28,
    sheenColor: '#475569',
    sheenRoughness: 0.78,
    envMapIntensity: 0.62,
    normalScale: 0.32,
  },
  painted_surface: {
    color: '#334155',
    roughness: 0.28,
    metalness: 0.18,
    clearcoat: 0.82,
    clearcoatRoughness: 0.08,
    ior: 1.52,
    envMapIntensity: 1.22,
    normalScale: 0.16,
    clearcoatNormalScale: 0.06,
  },
  carbon_fibre: {
    color: '#1b1f27',
    roughness: 0.26,
    metalness: 0.32,
    anisotropy: 0.48,
    clearcoat: 0.88,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.35,
    normalScale: 0.58,
    clearcoatNormalScale: 0.05,
  },
  wood: {
    color: '#8e5c36',
    roughness: 0.52,
    metalness: 0.0,
    clearcoat: 0.34,
    clearcoatRoughness: 0.24,
    sheen: 0.18,
    sheenColor: '#d6a87c',
    sheenRoughness: 0.55,
    envMapIntensity: 0.88,
    normalScale: 0.44,
  },
  stone: {
    color: '#78716c',
    roughness: 0.82,
    metalness: 0.02,
    specularIntensity: 0.5,
    envMapIntensity: 0.66,
    normalScale: 0.62,
  },
  organic_tissue: {
    color: '#a92332',
    roughness: 0.32,
    metalness: 0.0,
    transmission: 0.28,
    thickness: 0.95,
    attenuationColor: '#4c0519',
    attenuationDistance: 0.28,
    clearcoat: 0.72,
    clearcoatRoughness: 0.12,
    sheen: 0.38,
    sheenColor: '#fda4af',
    sheenRoughness: 0.42,
    ior: 1.42,
    envMapIntensity: 0.98,
    normalScale: 0.24,
    clearcoatNormalScale: 0.08,
  },
  semiconductor: {
    color: '#172133',
    roughness: 0.065,
    metalness: 0.88,
    clearcoat: 0.88,
    clearcoatRoughness: 0.035,
    iridescence: 0.82,
    iridescenceIOR: 1.92,
    iridescenceThicknessRange: [150, 520],
    envMapIntensity: 1.52,
    normalScale: 0.18,
  },
  water_fluid: {
    color: '#7dd3fc',
    roughness: 0.025,
    metalness: 0.0,
    transmission: 0.92,
    ior: 1.333,
    thickness: 0.45,
    attenuationColor: '#0284c7',
    attenuationDistance: 1.35,
    clearcoat: 0.25,
    clearcoatRoughness: 0.02,
    opacity: 0.54,
    envMapIntensity: 1.38,
  },
};

type SurfacePatternKind =
  | 'brushed'
  | 'polished'
  | 'cast'
  | 'carbon'
  | 'wood'
  | 'organic'
  | 'molded'
  | 'elastomer'
  | 'ceramic'
  | 'semiconductor';

interface ProceduralSurfaceMaps {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  albedoMap?: THREE.CanvasTexture;
  clearcoatNormalMap?: THREE.CanvasTexture;
}

const surfaceMapCache = new Map<string, ProceduralSurfaceMaps>();

function hash2D(ix: number, iy: number, period: number, seed = 1337): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let n = (px * 374761393 + py * 668265263 + seed * 1442695041) | 0;
  n = ((n ^ (n >>> 13)) * 1274126177) | 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function tileableValueNoise(u: number, v: number, freq: number, seed = 1337): number {
  const x = u * freq;
  const y = v * freq;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2D(ix, iy, freq, seed);
  const n10 = hash2D(ix + 1, iy, freq, seed);
  const n01 = hash2D(ix, iy + 1, freq, seed);
  const n11 = hash2D(ix + 1, iy + 1, freq, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function tileableFbm(u: number, v: number, baseFreq: number, octaves: number, seed = 1337): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += tileableValueNoise(u, v, freq, seed + i * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / (norm || 1);
}

function tileableVoronoi(u: number, v: number, cells: number, seed = 4201): number {
  const gx = u * cells;
  const gy = v * cells;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  let minDist = 8.0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const px = cx + hash2D(cx, cy, cells, seed);
      const py = cy + hash2D(cx, cy, cells, seed + 7919);
      const d2 = (px - gx) * (px - gx) + (py - gy) * (py - gy);
      if (d2 < minDist) minDist = d2;
    }
  }
  return Math.min(1, Math.sqrt(minDist));
}

function buildHeightAndRoughnessFields(
  kind: SurfacePatternKind,
  size: number,
): { height: Float32Array; roughMod: Float32Array; coatHeight?: Float32Array } {
  const height = new Float32Array(size * size);
  const roughMod = new Float32Array(size * size);
  const needsCoat = kind === 'carbon' || kind === 'ceramic' || kind === 'organic';
  const coatHeight = needsCoat ? new Float32Array(size * size) : undefined;

  const rowScratchA = new Float32Array(size);
  const rowScratchB = new Float32Array(size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    rowScratchA[y] = tileableFbm(0.13, v, 64, 4, 901) - 0.5;
    rowScratchB[y] = hash2D(7, y, size, 3313) - 0.5;
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;

      if (kind === 'brushed') {
        const longBand = tileableValueNoise(u, v, 8, 511);
        const fineGroove = rowScratchA[y] * (0.72 + 0.58 * tileableValueNoise(u, v, 6, 712)) + rowScratchB[y] * 0.32;
        const crossMicro = (tileableValueNoise(u, v, 48, 1201) - 0.5) * 0.08;
        const smudge = tileableFbm(u, v, 5, 3, 4409);
        height[idx] = 0.5 + fineGroove * 0.62 + crossMicro + (longBand - 0.5) * 0.1;
        roughMod[idx] = 0.76 + smudge * 0.26 + fineGroove * 0.24;
      } else if (kind === 'polished') {
        const swirl = tileableFbm(u, v, 10, 3, 2203) - 0.5;
        const smudge = tileableFbm(u, v, 4, 3, 8807);
        height[idx] = 0.5 + swirl * 0.14;
        roughMod[idx] = 0.82 + smudge * 0.26;
      } else if (kind === 'cast') {
        const coarse = tileableFbm(u, v, 14, 4, 6011);
        const fine = tileableValueNoise(u, v, 96, 6199) - 0.5;
        const pores = tileableVoronoi(u, v, 36, 6311);
        const pit = pores < 0.22 ? -(0.22 - pores) * 1.35 : 0;
        height[idx] = 0.5 + (coarse - 0.5) * 0.52 + fine * 0.22 + pit;
        roughMod[idx] = 0.76 + coarse * 0.28 - pit * 0.4;
      } else if (kind === 'carbon') {
        const cells = 16;
        const gx = u * cells * 4;
        const gy = v * cells * 4;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;
        const twillPhase = (((ix + iy) % 4) + 4) % 4;
        const warpTop = twillPhase < 2;
        const crown = warpTop
          ? Math.sin(fx * Math.PI) * (0.85 + 0.15 * Math.sin(fy * Math.PI * 0.5))
          : Math.sin(fy * Math.PI) * (0.85 + 0.15 * Math.sin(fx * Math.PI * 0.5));
        const filament = warpTop ? Math.sin(fx * Math.PI * 10) * 0.04 : Math.sin(fy * Math.PI * 10) * 0.04;
        height[idx] = 0.22 + crown * 0.62 + filament;
        roughMod[idx] = warpTop ? 0.72 + (1 - crown) * 0.25 : 0.88 + (1 - crown) * 0.18;
        if (coatHeight) {
          coatHeight[idx] = 0.5 + (tileableFbm(u, v, 6, 2, 9923) - 0.5) * 0.14;
        }
      } else if (kind === 'wood') {
        const warp = tileableFbm(u, v, 4, 3, 7103) * 0.35;
        const rings = Math.sin((u * 9.0 + warp) * Math.PI * 2);
        const grain = (tileableValueNoise(u * 2, v * 16, 24, 7211) - 0.5) * 0.26;
        const pore = tileableValueNoise(u * 3, v * 0.6, 48, 7309) > 0.86 ? -0.18 : 0;
        height[idx] = 0.5 + rings * 0.18 + grain + pore;
        roughMod[idx] = 0.78 + rings * 0.12 - pore * 0.8;
      } else if (kind === 'organic') {
        const warp = tileableFbm(u, v, 5, 3, 5003);
        const fascicles = Math.sin((v * 12 + warp * 2.4) * Math.PI * 2) * 0.16;
        const cells = tileableVoronoi(u, v, 18, 5107);
        const micro = (tileableFbm(u, v, 16, 3, 5209) - 0.5) * 0.22;
        height[idx] = 0.5 + fascicles + (1 - cells) * 0.18 + micro;
        roughMod[idx] = 0.72 + cells * 0.28 + (warp - 0.5) * 0.16;
        if (coatHeight) {
          coatHeight[idx] = 0.5 + (tileableFbm(u, v, 5, 2, 5303) - 0.5) * 0.22;
        }
      } else if (kind === 'elastomer') {
        const fine = tileableValueNoise(u, v, 128, 3001) - 0.5;
        const med = tileableFbm(u, v, 24, 3, 3109) - 0.5;
        height[idx] = 0.5 + fine * 0.28 + med * 0.24;
        roughMod[idx] = 0.88 + med * 0.18;
      } else if (kind === 'molded') {
        const stipple = tileableValueNoise(u, v, 112, 4001) - 0.5;
        const broad = tileableFbm(u, v, 6, 3, 4111);
        height[idx] = 0.5 + stipple * 0.22 + (broad - 0.5) * 0.12;
        roughMod[idx] = 0.8 + broad * 0.24;
      } else if (kind === 'semiconductor') {
        const gx = (u * 16) % 1;
        const gy = (v * 16) % 1;
        const traceX = gx < 0.08 ? -0.14 : 0;
        const traceY = gy < 0.08 ? -0.14 : 0;
        const subCell = tileableValueNoise(u, v, 64, 8101) > 0.45 ? 0.06 : -0.04;
        height[idx] = 0.5 + traceX + traceY + subCell;
        roughMod[idx] = traceX < 0 || traceY < 0 ? 1.0 : 0.72 + (subCell + 0.04) * 1.4;
      } else {
        const glaze = tileableFbm(u, v, 8, 3, 9501) - 0.5;
        height[idx] = 0.5 + glaze * 0.16;
        roughMod[idx] = 0.85 + glaze * 0.18;
        if (coatHeight) {
          coatHeight[idx] = 0.5 + (tileableFbm(u, v, 5, 2, 9601) - 0.5) * 0.12;
        }
      }
    }
  }

  return { height, roughMod, coatHeight };
}

function bakeSobelNormalCanvas(height: Float32Array, size: number, strength: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(size, size);
  const sampleH = (x: number, y: number) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return height[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, nz);

      const p = (y * size + x) * 4;
      img.data[p] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      img.data[p + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      img.data[p + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      img.data[p + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

function getSurfaceMaps(kind: SurfacePatternKind, repeatScale = 3, maxAniso = 4): ProceduralSurfaceMaps | null {
  if (typeof document === 'undefined') return null;
  const key = `${kind}_${repeatScale}_${maxAniso}`;
  const cached = surfaceMapCache.get(key);
  if (cached) return cached;

  const size = 512;
  const { height, roughMod, coatHeight } = buildHeightAndRoughnessFields(kind, size);

  const strength =
    kind === 'carbon'
      ? 3.1
      : kind === 'cast'
        ? 1.9
        : kind === 'brushed'
          ? 1.85
          : kind === 'wood'
            ? 1.85
            : kind === 'organic'
              ? 1.45
              : kind === 'semiconductor'
                ? 1.6
                : 1.25;

  const normCanvas = bakeSobelNormalCanvas(height, size, strength);
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');

  if (!normCanvas || !roughCtx) return null;

  const roughImg = roughCtx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const rb = Math.max(128, Math.min(255, Math.round(roughMod[i] * 242)));
    const p = i * 4;
    roughImg.data[p] = rb;
    roughImg.data[p + 1] = rb;
    roughImg.data[p + 2] = rb;
    roughImg.data[p + 3] = 255;
  }
  roughCtx.putImageData(roughImg, 0, 0);

  const configureTex = (canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatScale, repeatScale);
    tex.anisotropy = maxAniso;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return tex;
  };

  const normalMap = configureTex(normCanvas, false);
  const roughnessMap = configureTex(roughCanvas, false);

  let clearcoatNormalMap: THREE.CanvasTexture | undefined;
  if (coatHeight) {
    const coatCanvas = bakeSobelNormalCanvas(coatHeight, size, 0.75);
    if (coatCanvas) {
      clearcoatNormalMap = configureTex(coatCanvas, false);
    }
  }

  let albedoMap: THREE.CanvasTexture | undefined;
  if (
    kind === 'brushed' ||
    kind === 'carbon' ||
    kind === 'wood' ||
    kind === 'organic' ||
    kind === 'cast' ||
    kind === 'semiconductor'
  ) {
    const albCanvas = document.createElement('canvas');
    albCanvas.width = size;
    albCanvas.height = size;
    const albCtx = albCanvas.getContext('2d');
    if (albCtx) {
      const albImg = albCtx.createImageData(size, size);
      for (let i = 0; i < size * size; i++) {
        const hv = height[i];
        const p = i * 4;
        if (kind === 'brushed') {
          // Visible directional brushed micro-streaks in albedo so steel & brass texture reads even at mobile thumbnail scale!
          const v = Math.max(204, Math.min(255, Math.round(238 + (hv - 0.5) * 68)));
          albImg.data[p] = v;
          albImg.data[p + 1] = v;
          albImg.data[p + 2] = v;
        } else if (kind === 'carbon') {
          const v = Math.max(95, Math.min(252, Math.round(135 + hv * 128)));
          albImg.data[p] = v;
          albImg.data[p + 1] = Math.min(255, Math.round(v * 1.02));
          albImg.data[p + 2] = Math.min(255, Math.round(v * 1.07));
        } else if (kind === 'wood') {
          albImg.data[p] = Math.max(140, Math.min(252, Math.round(212 + (hv - 0.5) * 115)));
          albImg.data[p + 1] = Math.max(118, Math.min(235, Math.round(192 + (hv - 0.5) * 102)));
          albImg.data[p + 2] = Math.max(96, Math.min(215, Math.round(170 + (hv - 0.5) * 86)));
        } else if (kind === 'organic') {
          albImg.data[p] = Math.max(195, Math.min(255, Math.round(236 + (hv - 0.5) * 54)));
          albImg.data[p + 1] = Math.max(165, Math.min(242, Math.round(212 + (hv - 0.5) * 68)));
          albImg.data[p + 2] = Math.max(170, Math.min(245, Math.round(216 + (hv - 0.5) * 62)));
        } else if (kind === 'semiconductor') {
          const v = Math.max(185, Math.min(255, Math.round(228 + (hv - 0.5) * 90)));
          albImg.data[p] = v;
          albImg.data[p + 1] = Math.min(255, Math.round(v * 1.03));
          albImg.data[p + 2] = Math.min(255, Math.round(v * 1.08));
        } else {
          const v = Math.max(198, Math.min(255, Math.round(238 + (hv - 0.5) * 58)));
          albImg.data[p] = v;
          albImg.data[p + 1] = v;
          albImg.data[p + 2] = v;
        }
        albImg.data[p + 3] = 255;
      }
      albCtx.putImageData(albImg, 0, 0);
      albedoMap = configureTex(albCanvas, true);
    }
  }

  const entry: ProceduralSurfaceMaps = { normalMap, roughnessMap, albedoMap, clearcoatNormalMap };
  surfaceMapCache.set(key, entry);
  return entry;
}

export class MaterialLibrary {
  private cache = new Map<string, THREE.MeshPhysicalMaterial>();

  constructor(
    private readonly isSoftwareGl: boolean,
    private readonly maxAnisotropy = 4,
  ) {}

  getMaterial(spec?: MaterialSpec, clippingPlanes?: THREE.Plane[]): THREE.MeshPhysicalMaterial {
    const id = spec?.id ?? 'default_steel';
    const presetKey: MaterialPresetId = spec?.preset ?? 'brushed_steel';
    const def = MATERIAL_PRESET_DEFAULTS[presetKey] ?? MATERIAL_PRESET_DEFAULTS.brushed_steel;

    const cacheKey = `${id}_${presetKey}_${spec?.color ?? ''}_${spec?.roughness ?? ''}_${spec?.metalness ?? ''}_${spec?.opacity ?? ''}_${spec?.transmission ?? ''}_${spec?.textureScale ?? ''}_${this.isSoftwareGl ? 'sw' : 'hw'}`;
    const existing = this.cache.get(cacheKey);
    if (existing) {
      if (clippingPlanes) existing.clippingPlanes = clippingPlanes;
      return existing;
    }

    const requestedOpacity = spec?.opacity ?? def.opacity ?? 1;
    const requestedTrans = spec?.transmission ?? def.transmission ?? 0;

    // The tissue preset uses transmission for light scattering inside an otherwise solid surface.
    const fallbackTransmission = presetKey === 'organic_tissue' ? (spec?.transmission ?? 0) : requestedTrans;
    const useFallbackTransmission = this.isSoftwareGl && fallbackTransmission > 0.05;
    const usePhysicalTransmission = !this.isSoftwareGl && requestedTrans > 0.05;
    const useAlphaBlending = !usePhysicalTransmission && (requestedOpacity < 0.99 || useFallbackTransmission);

    const effectiveOpacity = usePhysicalTransmission
      ? 1.0
      : useFallbackTransmission
        ? Math.min(requestedOpacity, presetKey === 'organic_tissue' ? 0.42 : 0.34)
        : requestedOpacity;
    const [iridescenceThicknessMinimum, iridescenceThicknessMaximum] = def.iridescenceThicknessRange ?? [160, 420];

    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(spec?.color ?? def.color),
      roughness: spec?.roughness ?? def.roughness,
      metalness: spec?.metalness ?? def.metalness,
      clearcoat: spec?.clearcoat ?? def.clearcoat ?? 0,
      clearcoatRoughness: spec?.clearcoatRoughness ?? def.clearcoatRoughness ?? 0.1,
      anisotropy: this.isSoftwareGl ? 0 : (spec?.anisotropy ?? def.anisotropy ?? 0),
      anisotropyRotation: def.anisotropyRotation ?? 0,
      ior: spec?.ior ?? def.ior ?? 1.5,
      specularIntensity: def.specularIntensity ?? 1.0,
      specularColor: new THREE.Color(def.specularColor ?? '#ffffff'),
      sheen: spec?.sheen ?? def.sheen ?? 0,
      sheenColor: new THREE.Color(spec?.sheenColor ?? def.sheenColor ?? '#ffffff'),
      sheenRoughness: def.sheenRoughness ?? 0.55,
      iridescence: this.isSoftwareGl ? 0 : (def.iridescence ?? 0),
      iridescenceIOR: def.iridescenceIOR ?? 1.6,
      iridescenceThicknessMinimum,
      iridescenceThicknessMaximum,
      envMapIntensity: def.envMapIntensity ?? 1.25,
      transmission: this.isSoftwareGl ? 0 : requestedTrans,
      thickness: spec?.thickness ?? def.thickness ?? (requestedTrans > 0 ? 0.55 : 0),
      attenuationColor: new THREE.Color(spec?.attenuationColor ?? def.attenuationColor ?? '#ffffff'),
      attenuationDistance: spec?.attenuationDistance ?? def.attenuationDistance ?? 2.0,
      transparent: useAlphaBlending,
      opacity: effectiveOpacity,
      depthWrite: !useAlphaBlending,
      emissive: spec?.emissive ? new THREE.Color(spec.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: spec?.emissiveIntensity ?? 0,
      side: THREE.DoubleSide,
      clipShadows: true,
    });

    const scale = spec?.textureScale ?? 3;
    const nScale = spec?.normalScale ?? def.normalScale ?? 0.24;

    let patternKind: SurfacePatternKind | null = null;
    if (presetKey === 'brushed_steel' || presetKey === 'brass' || presetKey === 'copper') {
      patternKind = 'brushed';
    } else if (presetKey === 'polished_metal' || presetKey === 'chrome') {
      patternKind = 'polished';
    } else if (presetKey === 'cast_aluminium' || presetKey === 'stone') {
      patternKind = 'cast';
    } else if (presetKey === 'carbon_fibre') {
      patternKind = 'carbon';
    } else if (presetKey === 'wood') {
      patternKind = 'wood';
    } else if (presetKey === 'organic_tissue') {
      patternKind = 'organic';
    } else if (presetKey === 'silicone' || presetKey === 'rubber') {
      patternKind = 'elastomer';
    } else if (presetKey === 'abs_plastic' || presetKey === 'painted_surface' || presetKey === 'translucent_plastic') {
      patternKind = 'molded';
    } else if (presetKey === 'semiconductor') {
      patternKind = 'semiconductor';
    } else if (presetKey === 'ceramic') {
      patternKind = 'ceramic';
    }

    if (patternKind) {
      const maps = getSurfaceMaps(patternKind, scale, this.maxAnisotropy);
      if (maps) {
        mat.normalMap = maps.normalMap;
        mat.normalScale = new THREE.Vector2(nScale, nScale);
        mat.roughnessMap = maps.roughnessMap;
        if (maps.albedoMap) {
          mat.map = maps.albedoMap;
        }
        if (maps.clearcoatNormalMap && (mat.clearcoat ?? 0) > 0.1) {
          const ccScale = def.clearcoatNormalScale ?? 0.06;
          mat.clearcoatNormalMap = maps.clearcoatNormalMap;
          mat.clearcoatNormalScale = new THREE.Vector2(ccScale, ccScale);
        }
      }
    }

    if (clippingPlanes) {
      mat.clippingPlanes = clippingPlanes;
    }

    this.cache.set(cacheKey, mat);
    return mat;
  }

  dispose(): void {
    for (const mat of this.cache.values()) {
      mat.dispose();
    }
    this.cache.clear();
  }
}
