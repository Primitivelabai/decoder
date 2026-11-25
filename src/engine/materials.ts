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
    background: '#11141a',
    fogColor: '#11141a',
    fogDensity: 0.015,
    keyColor: '#fff6ea',
    keyIntensity: 2.35,
    keyPosition: [6, 9, 7],
    fillSkyColor: '#c2d8f8',
    fillGroundColor: '#1e242f',
    fillIntensity: 0.85,
    rimColor: '#93c5fd',
    rimIntensity: 1.18,
    exposure: 1.08,
    gridColor: '#2a3241',
    gridOpacity: 0.42,
    isLightBackdrop: false,
  },
  museum_exhibit: {
    id: 'museum_exhibit',
    label: 'Museum Exhibit',
    background: '#0c0d10',
    fogColor: '#0c0d10',
    fogDensity: 0.02,
    keyColor: '#ffe7c4',
    keyIntensity: 2.15,
    keyPosition: [4, 10, 5],
    fillSkyColor: '#9ab0cc',
    fillGroundColor: '#161311',
    fillIntensity: 0.56,
    rimColor: '#fde68a',
    rimIntensity: 0.88,
    exposure: 0.98,
    gridColor: '#23262e',
    gridOpacity: 0.24,
    isLightBackdrop: false,
  },
  photographic_product: {
    id: 'photographic_product',
    label: 'Photographic Product',
    background: '#191c24',
    fogColor: '#191c24',
    fogDensity: 0.01,
    keyColor: '#ffffff',
    keyIntensity: 2.55,
    keyPosition: [7, 8.5, 6],
    fillSkyColor: '#dbeafe',
    fillGroundColor: '#262932',
    fillIntensity: 0.98,
    rimColor: '#e0f2fe',
    rimIntensity: 1.32,
    exposure: 1.12,
    gridColor: '#313744',
    gridOpacity: 0.28,
    isLightBackdrop: false,
  },
  clinical_illustration: {
    id: 'clinical_illustration',
    label: 'Clinical Illustration',
    background: '#e9eef4',
    fogColor: '#e9eef4',
    fogDensity: 0.008,
    keyColor: '#fffaf5',
    keyIntensity: 2.15,
    keyPosition: [5, 10, 6],
    fillSkyColor: '#eff6ff',
    fillGroundColor: '#cbd5e1',
    fillIntensity: 1.15,
    rimColor: '#bae6fd',
    rimIntensity: 0.78,
    exposure: 1.0,
    gridColor: '#cbd5e1',
    gridOpacity: 0.45,
    isLightBackdrop: true,
  },
  dark_lab: {
    id: 'dark_lab',
    label: 'Dark Scientific Lab',
    background: '#07090d',
    fogColor: '#07090d',
    fogDensity: 0.022,
    keyColor: '#e0f2fe',
    keyIntensity: 2.45,
    keyPosition: [5, 8, 5],
    fillSkyColor: '#60a5fa',
    fillGroundColor: '#0f172a',
    fillIntensity: 0.65,
    rimColor: '#38bdf8',
    rimIntensity: 1.38,
    exposure: 1.06,
    gridColor: '#1e293b',
    gridOpacity: 0.36,
    isLightBackdrop: false,
  },
  white_engineering: {
    id: 'white_engineering',
    label: 'White Engineering Sheet',
    background: '#f5f6f8',
    fogColor: '#f5f6f8',
    fogDensity: 0.006,
    keyColor: '#ffffff',
    keyIntensity: 2.05,
    keyPosition: [6, 10, 7],
    fillSkyColor: '#f8fafc',
    fillGroundColor: '#d4d8df',
    fillIntensity: 1.2,
    rimColor: '#94a3b8',
    rimIntensity: 0.65,
    exposure: 0.98,
    gridColor: '#cbd5e1',
    gridOpacity: 0.55,
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
  transmission?: number;
  ior?: number;
  thickness?: number;
  attenuationColor?: string;
  attenuationDistance?: number;
  opacity?: number;
  sheen?: number;
  sheenColor?: string;
  iridescence?: number;
  envMapIntensity?: number;
  normalScale?: number;
}

export const MATERIAL_PRESET_DEFAULTS: Record<MaterialPresetId, MaterialPresetDefaults> = {
  polished_metal: {
    color: '#dce2ea',
    roughness: 0.11,
    metalness: 0.96,
    clearcoat: 0.24,
    clearcoatRoughness: 0.09,
    envMapIntensity: 1.08,
    normalScale: 0.08,
  },
  brushed_steel: {
    color: '#b8c0cc',
    roughness: 0.28,
    metalness: 0.92,
    anisotropy: 0.35,
    envMapIntensity: 1.04,
    normalScale: 0.16,
  },
  cast_aluminium: {
    color: '#9ca4b0',
    roughness: 0.46,
    metalness: 0.85,
    envMapIntensity: 1.02,
    normalScale: 0.18,
  },
  brass: {
    color: '#dcb04f',
    roughness: 0.2,
    metalness: 0.96,
    anisotropy: 0.65,
    envMapIntensity: 1.45,
    normalScale: 0.36,
  },
  copper: {
    color: '#d0784a',
    roughness: 0.21,
    metalness: 0.96,
    anisotropy: 0.58,
    envMapIntensity: 1.45,
    normalScale: 0.34,
  },
  chrome: {
    color: '#eef2f7',
    roughness: 0.04,
    metalness: 1.0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.6,
    normalScale: 0.08,
  },
  ceramic: {
    color: '#f3f0ea',
    roughness: 0.18,
    metalness: 0.02,
    clearcoat: 0.78,
    clearcoatRoughness: 0.08,
    ior: 1.54,
    envMapIntensity: 1.1,
    normalScale: 0.16,
  },
  glass: {
    color: '#e0f2fe',
    roughness: 0.03,
    metalness: 0.0,
    transmission: 0.94,
    ior: 1.52,
    thickness: 0.45,
    attenuationColor: '#d8eeff',
    attenuationDistance: 2.2,
    clearcoat: 0.32,
    clearcoatRoughness: 0.04,
    opacity: 0.28,
    envMapIntensity: 1.45,
  },
  translucent_plastic: {
    color: '#cbd5e1',
    roughness: 0.26,
    metalness: 0.0,
    transmission: 0.48,
    ior: 1.48,
    thickness: 0.25,
    opacity: 0.52,
    clearcoat: 0.35,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.05,
    normalScale: 0.2,
  },
  abs_plastic: {
    color: '#343b46',
    roughness: 0.42,
    metalness: 0.0,
    ior: 1.49,
    clearcoat: 0.16,
    clearcoatRoughness: 0.34,
    envMapIntensity: 0.92,
    normalScale: 0.28,
  },
  silicone: {
    color: '#2b313b',
    roughness: 0.68,
    metalness: 0.0,
    sheen: 0.42,
    sheenColor: '#94a3b8',
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.75,
    normalScale: 0.24,
  },
  rubber: {
    color: '#1b1f26',
    roughness: 0.86,
    metalness: 0.02,
    sheen: 0.24,
    sheenColor: '#475569',
    envMapIntensity: 0.58,
    normalScale: 0.35,
  },
  painted_surface: {
    color: '#334155',
    roughness: 0.32,
    metalness: 0.15,
    clearcoat: 0.65,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.15,
    normalScale: 0.22,
  },
  carbon_fibre: {
    color: '#1c2028',
    roughness: 0.28,
    metalness: 0.24,
    clearcoat: 0.72,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.25,
    normalScale: 0.55,
  },
  wood: {
    color: '#8f5f38',
    roughness: 0.58,
    metalness: 0.0,
    clearcoat: 0.22,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.82,
    normalScale: 0.48,
  },
  stone: {
    color: '#78716c',
    roughness: 0.84,
    metalness: 0.02,
    envMapIntensity: 0.62,
    normalScale: 0.65,
  },
  organic_tissue: {
    color: '#b8424f',
    roughness: 0.38,
    metalness: 0.0,
    clearcoat: 0.46,
    clearcoatRoughness: 0.22,
    sheen: 0.48,
    sheenColor: '#fda4af',
    ior: 1.4,
    envMapIntensity: 0.92,
    normalScale: 0.12,
  },
  semiconductor: {
    color: '#1e293b',
    roughness: 0.12,
    metalness: 0.74,
    clearcoat: 0.72,
    clearcoatRoughness: 0.06,
    iridescence: 0.45,
    envMapIntensity: 1.4,
    normalScale: 0.24,
  },
  water_fluid: {
    color: '#38bdf8',
    roughness: 0.04,
    metalness: 0.0,
    transmission: 0.88,
    ior: 1.333,
    thickness: 0.35,
    attenuationColor: '#0ea5e9',
    attenuationDistance: 1.4,
    opacity: 0.54,
    envMapIntensity: 1.3,
  },
};

type SurfacePatternKind = 'brushed' | 'cast' | 'carbon' | 'wood' | 'organic' | 'molded' | 'ceramic';

interface ProceduralSurfaceMaps {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  albedoMap?: THREE.CanvasTexture;
}

const surfaceMapCache = new Map<string, ProceduralSurfaceMaps>();

function buildHeightField(kind: SurfacePatternKind, size: number): Float32Array {
  const h = new Float32Array(size * size);
  let seed = 48271;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let y = 0; y < size; y++) {
    const rowJitter = (rand() - 0.5) * 0.22;
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      if (kind === 'brushed') {
        const streak =
          Math.sin(y * 1.85) * 0.16 + Math.cos(y * 5.7) * 0.1 + Math.sin(y * 13.3 + x * 0.015) * 0.06 + rowJitter * 0.7;
        h[idx] = 0.5 + streak * 0.42;
      } else if (kind === 'cast') {
        // Isotropic fine sand-cast metallic grain without periodic stripes
        const grain = (rand() - 0.5) * 0.32;
        const fine = (rand() - 0.5) * 0.14;
        h[idx] = 0.5 + grain + fine;
      } else if (kind === 'molded') {
        const stipple = (rand() - 0.5) * 0.18;
        h[idx] = 0.5 + stipple;
      } else if (kind === 'ceramic') {
        const wave = (rand() - 0.5) * 0.06;
        h[idx] = 0.5 + wave;
      } else if (kind === 'carbon') {
        const cell = 16;
        const tx = Math.floor(x / cell);
        const ty = Math.floor(y / cell);
        const lx = (x % cell) / cell;
        const ly = (y % cell) / cell;
        const even = (tx + ty) % 2 === 0;
        const strand = even ? Math.sin(lx * Math.PI) * 0.34 : Math.sin(ly * Math.PI) * 0.34;
        h[idx] = 0.34 + strand;
      } else if (kind === 'wood') {
        const ring =
          Math.sin(x * 0.085 + Math.sin(y * 0.016) * 3.8) * 0.24 + Math.cos(x * 0.34) * 0.08 + (rand() - 0.5) * 0.05;
        h[idx] = 0.5 + ring;
      } else if (kind === 'organic') {
        // Soft non-directional biological cellular micro-relief
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;
        const softCells =
          Math.sin(u * 3 + Math.cos(v * 2)) * Math.cos(v * 3 - Math.sin(u * 2)) * 0.08 + (rand() - 0.5) * 0.09;
        h[idx] = 0.5 + softCells;
      }
    }
  }
  return h;
}

/**
 * Generates paired 512x512 tangent-space NormalMap (via Sobel gradient),
 * Roughness variation map, and subtle Albedo grain map for rich PBR surface response.
 */
function getSurfaceMaps(kind: SurfacePatternKind, repeatScale = 3, maxAniso = 4): ProceduralSurfaceMaps | null {
  if (typeof document === 'undefined') return null;
  const key = `${kind}_${repeatScale}_${maxAniso}`;
  const cached = surfaceMapCache.get(key);
  if (cached) return cached;

  const size = 512;
  const height = buildHeightField(kind, size);

  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const normCtx = normCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');

  if (!normCtx || !roughCtx) return null;

  const normImg = normCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const strength =
    kind === 'brushed' ? 1.5 : kind === 'cast' ? 1.65 : kind === 'carbon' ? 3.2 : kind === 'organic' ? 1.1 : 1.5;

  const sampleH = (x: number, y: number) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return height[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
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

      const p = idx * 4;
      normImg.data[p] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      normImg.data[p + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      normImg.data[p + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      normImg.data[p + 3] = 255;

      // Modulate roughness around neutral ~215 (0.84) with subtle surface wear variation
      const hv = height[idx];
      const roughByte = Math.max(150, Math.min(255, Math.round(195 + (hv - 0.5) * 95)));
      roughImg.data[p] = roughByte;
      roughImg.data[p + 1] = roughByte;
      roughImg.data[p + 2] = roughByte;
      roughImg.data[p + 3] = 255;
    }
  }

  normCtx.putImageData(normImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const normalMap = new THREE.CanvasTexture(normCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeatScale, repeatScale);
  normalMap.anisotropy = maxAniso;
  normalMap.colorSpace = THREE.NoColorSpace;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeatScale, repeatScale);
  roughnessMap.anisotropy = maxAniso;
  roughnessMap.colorSpace = THREE.NoColorSpace;

  let albedoMap: THREE.CanvasTexture | undefined;
  if (kind === 'carbon' || kind === 'wood' || kind === 'organic') {
    const albCanvas = document.createElement('canvas');
    albCanvas.width = size;
    albCanvas.height = size;
    const albCtx = albCanvas.getContext('2d');
    if (albCtx) {
      const albImg = albCtx.createImageData(size, size);
      for (let i = 0; i < size * size; i++) {
        const hv = height[i];
        const p = i * 4;
        if (kind === 'carbon') {
          const v = Math.round(145 + hv * 105);
          albImg.data[p] = v;
          albImg.data[p + 1] = Math.round(v * 1.02);
          albImg.data[p + 2] = Math.min(255, Math.round(v * 1.06));
        } else if (kind === 'wood') {
          albImg.data[p] = Math.max(135, Math.min(248, Math.round(188 + (hv - 0.5) * 96)));
          albImg.data[p + 1] = Math.max(118, Math.min(225, Math.round(166 + (hv - 0.5) * 82)));
          albImg.data[p + 2] = Math.max(98, Math.min(200, Math.round(145 + (hv - 0.5) * 66)));
        } else {
          albImg.data[p] = Math.max(175, Math.min(250, Math.round(220 + (hv - 0.5) * 58)));
          albImg.data[p + 1] = Math.max(150, Math.min(225, Math.round(192 + (hv - 0.5) * 52)));
          albImg.data[p + 2] = Math.max(155, Math.min(228, Math.round(196 + (hv - 0.5) * 52)));
        }
        albImg.data[p + 3] = 255;
      }
      albCtx.putImageData(albImg, 0, 0);
      albedoMap = new THREE.CanvasTexture(albCanvas);
      albedoMap.wrapS = THREE.RepeatWrapping;
      albedoMap.wrapT = THREE.RepeatWrapping;
      albedoMap.repeat.set(repeatScale, repeatScale);
      albedoMap.anisotropy = maxAniso;
      albedoMap.colorSpace = THREE.SRGBColorSpace;
    }
  }

  const entry: ProceduralSurfaceMaps = { normalMap, roughnessMap, albedoMap };
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

    const cacheKey = `${id}_${presetKey}_${spec?.color ?? ''}_${spec?.roughness ?? ''}_${spec?.metalness ?? ''}_${spec?.opacity ?? ''}_${spec?.textureScale ?? ''}_${this.isSoftwareGl ? 'sw' : 'hw'}`;
    const existing = this.cache.get(cacheKey);
    if (existing) {
      if (clippingPlanes) existing.clippingPlanes = clippingPlanes;
      return existing;
    }

    const opacity = spec?.opacity ?? def.opacity ?? 1;
    const requestedTrans = spec?.transmission ?? def.transmission ?? 0;
    const isTransparent = opacity < 0.99 || requestedTrans > 0.05;

    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(spec?.color ?? def.color),
      roughness: spec?.roughness ?? def.roughness,
      metalness: spec?.metalness ?? def.metalness,
      clearcoat: spec?.clearcoat ?? def.clearcoat ?? 0,
      clearcoatRoughness: spec?.clearcoatRoughness ?? def.clearcoatRoughness ?? 0.12,
      anisotropy: this.isSoftwareGl ? 0 : (spec?.anisotropy ?? def.anisotropy ?? 0),
      ior: spec?.ior ?? def.ior ?? 1.5,
      sheen: spec?.sheen ?? def.sheen ?? 0,
      sheenColor: new THREE.Color(spec?.sheenColor ?? def.sheenColor ?? '#ffffff'),
      sheenRoughness: 0.55,
      iridescence: this.isSoftwareGl ? 0 : (def.iridescence ?? 0),
      envMapIntensity: def.envMapIntensity ?? 1.25,
      transmission: this.isSoftwareGl ? 0 : requestedTrans,
      thickness: spec?.thickness ?? def.thickness ?? (requestedTrans > 0 ? 0.45 : 0),
      attenuationColor: new THREE.Color(spec?.attenuationColor ?? def.attenuationColor ?? '#ffffff'),
      attenuationDistance: spec?.attenuationDistance ?? def.attenuationDistance ?? 2.0,
      transparent: isTransparent,
      opacity: this.isSoftwareGl && requestedTrans > 0 ? Math.min(opacity, 0.4) : opacity,
      depthWrite: !isTransparent,
      emissive: spec?.emissive ? new THREE.Color(spec.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: spec?.emissiveIntensity ?? 0,
      side: THREE.DoubleSide,
      clipShadows: true,
    });

    // Attach procedural tangent-space NormalMap, Roughness imperfection map & optional albedo weave/grain
    const scale = spec?.textureScale ?? 3;
    const nScale = spec?.normalScale ?? def.normalScale ?? 0.3;

    let patternKind: SurfacePatternKind | null = null;
    if (
      presetKey === 'brushed_steel' ||
      presetKey === 'brass' ||
      presetKey === 'copper' ||
      presetKey === 'polished_metal'
    ) {
      patternKind = 'brushed';
    } else if (presetKey === 'cast_aluminium' || presetKey === 'stone') {
      patternKind = 'cast';
    } else if (presetKey === 'carbon_fibre') {
      patternKind = 'carbon';
    } else if (presetKey === 'wood') {
      patternKind = 'wood';
    } else if (presetKey === 'organic_tissue') {
      patternKind = 'organic';
    } else if (
      presetKey === 'abs_plastic' ||
      presetKey === 'painted_surface' ||
      presetKey === 'rubber' ||
      presetKey === 'silicone'
    ) {
      patternKind = 'molded';
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
