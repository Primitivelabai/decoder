import * as THREE from 'three';
import type { EffectSpec, EvaluatedSimulationState } from './types';

export interface ActiveEffectInstance {
  spec: EffectSpec;
  group: THREE.Group;
  curve?: THREE.CatmullRomCurve3;
  curveFrames?: { tangents: THREE.Vector3[]; normals: THREE.Vector3[]; binormals: THREE.Vector3[] };
  particles?: THREE.InstancedMesh;
  particleCount: number;
  baseRadius: number;
  guideLine?: THREE.Mesh;
  innerBeamLine?: THREE.Mesh;
  glowMesh?: THREE.Mesh;
  innerCoreMesh?: THREE.Mesh;
  pointLight?: THREE.PointLight;
  material: THREE.Material;
}

const _dummy = new THREE.Object3D();
const _pt = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _binorm = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tmpColor = new THREE.Color();

const EFFECT_DEFAULT_COLORS: Record<string, string> = {
  liquid_flow: '#38bdf8',
  steam_vapour: '#e2e8f0',
  smoke: '#94a3b8',
  combustion: '#fb923c',
  heat_gradient: '#ef4444',
  thermal_diffusion: '#f97316',
  electrical_current: '#60a5fa',
  electromagnetic_field: '#818cf8',
  signal_pulse: '#22d3ee',
  pressure_wave: '#facc15',
  particles: '#a78bfa',
  airflow: '#bae6fd',
  magnetic_field: '#34d399',
  optical_ray: '#fde047',
  material_transport: '#2dd4bf',
  chemical_gradient: '#4ade80',
  cellular_activity: '#f43f5e',
};

let sharedCloudPuffTex: THREE.CanvasTexture | null = null;
let sharedFlameSpriteTex: THREE.CanvasTexture | null = null;

function hash2(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  n = ((n ^ (n >>> 13)) * 1274126177) | 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function fbm2(u: number, v: number, freq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    const gx = u * f;
    const gy = v * f;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const n00 = hash2(ix, iy, seed + o * 71);
    const n10 = hash2(ix + 1, iy, seed + o * 71);
    const n01 = hash2(ix, iy + 1, seed + o * 71);
    const n11 = hash2(ix + 1, iy + 1, seed + o * 71);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    sum += (nx0 + (nx1 - nx0) * sy) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / (norm || 1);
}

/**
 * Generates a 256x256 turbulent fBm cloud-wisp sprite so steam, smoke, and thermal haze
 * billow like volumetric fluid plumes instead of flat circular polka dots.
 */
function getVolumetricCloudTexture(): THREE.CanvasTexture | null {
  if (sharedCloudPuffTex) return sharedCloudPuffTex;
  if (typeof document === 'undefined') return null;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const r = Math.hypot(nx, ny);
      const p = (y * size + x) * 4;
      if (r >= 1.0) {
        img.data[p + 3] = 0;
        continue;
      }
      const u = x / size;
      const v = y / size;
      const billow = fbm2(u, v, 4.5, 4, 9137);
      const detail = fbm2(u + 0.3, v - 0.2, 11.0, 3, 4219);
      const radialFalloff = Math.pow(Math.max(0, 1 - r * r), 1.65);
      const density = Math.max(0, Math.min(1, radialFalloff * (0.48 + billow * 0.62 + (detail - 0.5) * 0.24)));

      // Subtle internal self-shadowing (warmer/brighter top-center, softer edge)
      const shade = Math.round(225 + 30 * Math.max(0, 1 - r * 0.85));
      img.data[p] = shade;
      img.data[p + 1] = shade;
      img.data[p + 2] = Math.min(255, shade + 4);
      img.data[p + 3] = Math.round(density * 235);
    }
  }
  ctx.putImageData(img, 0, 0);

  sharedCloudPuffTex = new THREE.CanvasTexture(canvas);
  sharedCloudPuffTex.colorSpace = THREE.SRGBColorSpace;
  return sharedCloudPuffTex;
}

/**
 * Blackbody incandescent combustion kernel sprite (white-hot 3200K center -> amber 1900K -> deep soot crimson).
 */
function getBlackbodyFlameTexture(): THREE.CanvasTexture | null {
  if (sharedFlameSpriteTex) return sharedFlameSpriteTex;
  if (typeof document === 'undefined') return null;

  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const r = Math.hypot(nx, ny);
      const p = (y * size + x) * 4;
      if (r >= 1.0) {
        img.data[p + 3] = 0;
        continue;
      }
      const turb = fbm2(x / size, y / size, 6.0, 3, 7717);
      const core = Math.pow(Math.max(0, 1 - r), 1.45) * (0.65 + turb * 0.55);
      const alpha = Math.max(0, Math.min(1, core));

      // Blackbody temperature ramp
      const cr = Math.min(255, Math.round(255 * Math.min(1, core * 1.9 + 0.35)));
      const cg = Math.min(255, Math.round(255 * Math.pow(Math.min(1, core * 1.35), 1.35)));
      const cb = Math.min(255, Math.round(255 * Math.pow(Math.min(1, core * 1.05), 3.0)));

      img.data[p] = cr;
      img.data[p + 1] = cg;
      img.data[p + 2] = cb;
      img.data[p + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  sharedFlameSpriteTex = new THREE.CanvasTexture(canvas);
  sharedFlameSpriteTex.colorSpace = THREE.SRGBColorSpace;
  return sharedFlameSpriteTex;
}

export class ScientificEffectsManager {
  public readonly root = new THREE.Group();
  private instances: ActiveEffectInstance[] = [];
  private sharedSphereGeo = new THREE.SphereGeometry(1, 18, 14);
  private sharedPulseGeo = new THREE.CapsuleGeometry(0.36, 2.1, 8, 14);
  private sharedDropletGeo = new THREE.SphereGeometry(1, 18, 14);
  private sharedPlaneGeo = new THREE.PlaneGeometry(2.35, 2.35);

  constructor() {
    this.root.name = '__scientific_effects__';
    this.sharedPulseGeo.rotateX(Math.PI / 2);
    this.sharedDropletGeo.scale(0.78, 0.78, 1.55);
  }

  buildForProject(effects: EffectSpec[]): void {
    this.clear();
    const cloudTex = getVolumetricCloudTexture();
    const flameTex = getBlackbodyFlameTexture();

    for (const spec of effects) {
      const group = new THREE.Group();
      group.name = `effect_${spec.id}`;
      group.userData.effectId = spec.id;

      const colorHex = spec.color ?? EFFECT_DEFAULT_COLORS[spec.type] ?? '#38bdf8';
      const baseColor = new THREE.Color(colorHex);
      const count = Math.max(10, Math.min(64, Math.round((spec.density ?? 1) * 26)));
      const baseRadius = spec.radius ?? 0.032;

      const isVapour = spec.type === 'steam_vapour' || spec.type === 'smoke' || spec.type === 'airflow';
      const isThermal = spec.type === 'heat_gradient' || spec.type === 'thermal_diffusion';
      const isCombustion = spec.type === 'combustion';
      const isLiquid = spec.type === 'liquid_flow' || spec.type === 'material_transport';
      const isEnergyPulse =
        spec.type === 'signal_pulse' || spec.type === 'electrical_current' || spec.type === 'optical_ray';

      let mat: THREE.Material;
      if (isLiquid) {
        // Refractive specular fluid micro-droplets
        mat = new THREE.MeshPhysicalMaterial({
          color: baseColor,
          roughness: 0.03,
          metalness: 0.0,
          transmission: 0.78,
          thickness: baseRadius * 3.5,
          attenuationColor: baseColor,
          attenuationDistance: baseRadius * 8.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.02,
          ior: 1.333,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
      } else if (isCombustion && flameTex) {
        // HDR incandescent flame wisps (> 1.0 RGB triggers AgX soft highlight desaturation + UnrealBloom)
        const hdrFlame = baseColor.clone().multiplyScalar(1.85);
        mat = new THREE.MeshBasicMaterial({
          color: hdrFlame,
          map: flameTex,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
      } else if ((isVapour || isThermal) && cloudTex) {
        const tint = isThermal ? baseColor.clone().multiplyScalar(1.35) : baseColor;
        mat = new THREE.MeshBasicMaterial({
          color: tint,
          map: cloudTex,
          transparent: true,
          opacity: isThermal ? 0.22 : 0.44,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: isThermal ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
      } else if (isEnergyPulse) {
        // HDR coherent photon / signal wave-packet (> 1.4 RGB catches UnrealBloomPass cleanly)
        const hdrPulse = baseColor.clone().multiplyScalar(1.65);
        mat = new THREE.MeshBasicMaterial({
          color: hdrPulse,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
      } else {
        mat = new THREE.MeshPhysicalMaterial({
          color: baseColor,
          roughness: 0.22,
          metalness: 0.1,
          emissive: baseColor,
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
        });
      }

      let curve: THREE.CatmullRomCurve3 | undefined;
      let curveFrames: { tangents: THREE.Vector3[]; normals: THREE.Vector3[]; binormals: THREE.Vector3[] } | undefined;
      let guideLine: THREE.Mesh | undefined;
      let innerBeamLine: THREE.Mesh | undefined;

      if (spec.path && spec.path.length >= 2) {
        curve = new THREE.CatmullRomCurve3(spec.path.map((p) => new THREE.Vector3(...p)));
        curveFrames = curve.computeFrenetFrames(64, false);

        if (
          spec.type === 'optical_ray' ||
          spec.type === 'electromagnetic_field' ||
          spec.type === 'magnetic_field' ||
          spec.type === 'electrical_current' ||
          spec.type === 'signal_pulse'
        ) {
          // Outer atmospheric Tyndall scatter sheath
          const sheathRadius = spec.type === 'optical_ray' ? baseRadius * 0.48 : baseRadius * 0.36;
          const beamGeo = new THREE.TubeGeometry(curve, 48, sheathRadius, 12, false);
          const beamMat = new THREE.MeshBasicMaterial({
            color: baseColor,
            transparent: true,
            opacity: spec.type === 'optical_ray' ? 0.28 : 0.16,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          guideLine = new THREE.Mesh(beamGeo, beamMat);
          group.add(guideLine);

          // Razor-sharp HDR laser / conductor core filament
          if (spec.type === 'optical_ray' || spec.type === 'electrical_current') {
            const coreBeamGeo = new THREE.TubeGeometry(curve, 48, sheathRadius * 0.32, 8, false);
            const coreBeamMat = new THREE.MeshBasicMaterial({
              color: baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(1.75),
              transparent: true,
              opacity: spec.type === 'optical_ray' ? 0.85 : 0.48,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            });
            innerBeamLine = new THREE.Mesh(coreBeamGeo, coreBeamMat);
            group.add(innerBeamLine);
          }
        } else if (isLiquid) {
          // Continuous laminar fluid stream core inside pipes/spouts
          const streamGeo = new THREE.TubeGeometry(curve, 44, baseRadius * 0.38, 12, false);
          const streamMat = new THREE.MeshPhysicalMaterial({
            color: baseColor,
            roughness: 0.04,
            metalness: 0.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0.03,
            ior: 1.333,
            transparent: true,
            opacity: 0.48,
            depthWrite: false,
          });
          guideLine = new THREE.Mesh(streamGeo, streamMat);
          group.add(guideLine);
        }
      }

      const geo = isEnergyPulse
        ? this.sharedPulseGeo
        : isLiquid
          ? this.sharedDropletGeo
          : (isVapour || isThermal || isCombustion) && (cloudTex || flameTex)
            ? this.sharedPlaneGeo
            : this.sharedSphereGeo;

      const particles = new THREE.InstancedMesh(geo, mat, count);
      particles.frustumCulled = false;
      group.add(particles);

      let glowMesh: THREE.Mesh | undefined;
      let innerCoreMesh: THREE.Mesh | undefined;
      let pointLight: THREE.PointLight | undefined;

      if (
        isCombustion ||
        spec.type === 'heat_gradient' ||
        spec.type === 'pressure_wave' ||
        spec.type === 'thermal_diffusion'
      ) {
        const origin = spec.path?.[0] ?? [0, 0, 0];
        const glowGeo = new THREE.SphereGeometry(baseRadius * 3.2, 24, 16);
        const glowMat = new THREE.MeshBasicMaterial({
          color: baseColor.clone().multiplyScalar(isCombustion ? 1.45 : 1.15),
          transparent: true,
          opacity: isCombustion ? 0.36 : 0.22,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.set(origin[0], origin[1], origin[2]);
        group.add(glowMesh);

        if (isCombustion) {
          const coreColor = new THREE.Color(spec.secondaryColor ?? '#fef08a').multiplyScalar(2.2);
          const coreGeo = new THREE.SphereGeometry(baseRadius * 1.55, 18, 14);
          const coreMat = new THREE.MeshBasicMaterial({
            color: coreColor,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          innerCoreMesh = new THREE.Mesh(coreGeo, coreMat);
          innerCoreMesh.position.set(origin[0], origin[1], origin[2]);
          group.add(innerCoreMesh);

          // Real dynamic combustion illumination: casts warm ignition flash onto cylinder walls & piston crown!
          pointLight = new THREE.PointLight(baseColor, 0, Math.max(0.8, baseRadius * 18), 2.0);
          pointLight.castShadow = false;
          pointLight.position.set(origin[0], origin[1], origin[2]);
          group.add(pointLight);
        }
      }

      this.root.add(group);
      this.instances.push({
        spec,
        group,
        curve,
        curveFrames,
        particles,
        particleCount: count,
        baseRadius,
        guideLine,
        innerBeamLine,
        glowMesh,
        innerCoreMesh,
        pointLight,
        material: mat,
      });
    }
  }

  /**
   * `hidden` lists effects to leave out this frame: heat haze sealed inside a closed casing would
   * otherwise drift out through the shell as loose dots.
   */
  update(
    time: number,
    simState: EvaluatedSimulationState,
    visible = true,
    cameraQuaternion?: THREE.Quaternion,
    hidden?: ReadonlySet<string>,
  ): void {
    this.root.visible = visible;
    if (!visible) return;

    for (const inst of this.instances) {
      const state = simState.effectStates[inst.spec.id] ?? { intensity: 1, speed: 1 };
      const intensity = Math.max(0, Math.min(2, state.intensity));
      const speed = state.speed;

      const isVapour = inst.spec.type === 'steam_vapour' || inst.spec.type === 'smoke' || inst.spec.type === 'airflow';
      const isThermal = inst.spec.type === 'heat_gradient' || inst.spec.type === 'thermal_diffusion';
      const isCombustion = inst.spec.type === 'combustion';
      const isBillboard = isVapour || isThermal || isCombustion;
      const isEnergyPulse =
        inst.spec.type === 'signal_pulse' ||
        inst.spec.type === 'electrical_current' ||
        inst.spec.type === 'optical_ray';

      inst.group.visible = intensity > 0.02 && !hidden?.has(inst.spec.id);
      if (!inst.group.visible) {
        if (inst.pointLight) inst.pointLight.intensity = 0;
        continue;
      }

      if (inst.material instanceof THREE.MeshBasicMaterial || inst.material instanceof THREE.MeshPhysicalMaterial) {
        inst.material.opacity = isThermal
          ? Math.min(0.26, 0.06 + intensity * 0.15)
          : isVapour
            ? Math.min(0.52, 0.14 + intensity * 0.3)
            : isCombustion
              ? Math.min(0.88, 0.25 + intensity * 0.58)
              : Math.min(0.95, 0.3 + intensity * 0.62);
      }

      const flicker = 0.88 + Math.sin(time * 19.3) * 0.1 + Math.cos(time * 29.1) * 0.07;

      if (inst.glowMesh) {
        const pulse = 1 + Math.sin(time * (3.5 + speed * 2.2)) * 0.15 * Math.min(1, intensity);
        inst.glowMesh.scale.setScalar(pulse * Math.max(0.4, Math.min(1.65, intensity)));
        (inst.glowMesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.44, intensity * 0.28);
      }

      if (inst.innerCoreMesh) {
        inst.innerCoreMesh.scale.setScalar(flicker * Math.max(0.35, Math.min(1.45, intensity)));
        (inst.innerCoreMesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, intensity * 0.72);
      }

      if (inst.pointLight) {
        inst.pointLight.intensity = intensity * flicker * 2.4;
      }

      if (inst.guideLine) {
        const gMat = inst.guideLine.material as THREE.MeshBasicMaterial | THREE.MeshPhysicalMaterial;
        gMat.opacity = Math.min(
          0.72,
          (inst.spec.type === 'optical_ray' ? 0.34 : inst.spec.type === 'liquid_flow' ? 0.46 : 0.2) * intensity,
        );
      }

      if (inst.innerBeamLine) {
        (inst.innerBeamLine.material as THREE.MeshBasicMaterial).opacity = Math.min(0.95, 0.68 * intensity);
      }

      if (inst.particles && inst.curve) {
        const frames = inst.curveFrames;
        const frameCount = frames ? frames.normals.length - 1 : 0;

        for (let i = 0; i < inst.particleCount; i++) {
          const offset = i / inst.particleCount;
          const u = (((time * 0.36 * speed + offset) % 1) + 1) % 1;
          inst.curve.getPointAt(u, _pt);
          inst.curve.getTangentAt(u, _tan);

          // Helical vortex swirl in Frenet normal/binormal frame so fluids & vapour spiral organically
          const swirlRadius = inst.spec.clippedToComponent
            ? inst.baseRadius * 0.2
            : isVapour
              ? inst.baseRadius * (0.35 + u * 1.65)
              : isEnergyPulse
                ? inst.baseRadius * 0.08
                : inst.baseRadius * 0.42;

          const swirlPhase = i * 2.39996 + u * (isVapour ? 5.5 : 8.0) - time * 2.8;
          const radialMag = swirlRadius * (0.45 + (0.55 * ((i * 7) % 11)) / 10);

          if (frames && frameCount > 0) {
            const fIdx = Math.min(frameCount, Math.max(0, Math.round(u * frameCount)));
            _norm.copy(frames.normals[fIdx]);
            _binorm.copy(frames.binormals[fIdx]);
            _pt.addScaledVector(_norm, Math.cos(swirlPhase) * radialMag);
            _pt.addScaledVector(_binorm, Math.sin(swirlPhase) * radialMag);
          } else {
            _pt.x += Math.cos(swirlPhase) * radialMag;
            _pt.y += Math.sin(swirlPhase) * radialMag;
          }

          _dummy.position.copy(_pt);

          if (isBillboard && cameraQuaternion) {
            _dummy.quaternion.copy(cameraQuaternion);
            _dummy.rotateZ(u * 2.6 + i * 1.17 + time * 0.35 * (i % 2 === 0 ? 1 : -1));
          } else if (_tan.lengthSq() > 0.0001) {
            _dummy.quaternion.setFromUnitVectors(_up, _tan.normalize());
            _dummy.lookAt(_pt.x + _tan.x, _pt.y + _tan.y, _pt.z + _tan.z);
          }

          const envFade =
            Math.sin(Math.min(1, u * 4.5) * (Math.PI * 0.5)) * Math.sin(Math.min(1, (1 - u) * 3.4) * (Math.PI * 0.5));
          const taper = isVapour
            ? (0.55 + u * 1.85) * envFade
            : isEnergyPulse
              ? (0.75 + 0.35 * Math.sin(u * Math.PI * 4)) * envFade
              : (Math.sin(u * Math.PI) * 0.38 + 0.7) * envFade;

          const s = inst.baseRadius * taper * (inst.spec.scale ?? 1) * Math.min(1.45, 0.5 + intensity * 0.52);
          const safeS = Math.max(0.003, s);

          if (isEnergyPulse) {
            // Elongate wave-packets cleanly with speed
            _dummy.scale.set(safeS * 0.72, safeS * 0.72, safeS * Math.min(2.2, 0.9 + Math.abs(speed) * 0.45));
          } else {
            _dummy.scale.setScalar(safeS);
          }

          _dummy.updateMatrix();
          inst.particles.setMatrixAt(i, _dummy.matrix);

          // Subtle temperature cooling tint on combustion/thermal plumes along trajectory
          if (isCombustion) {
            _tmpColor.setRGB(1.0, Math.max(0.28, 0.95 - u * 0.65), Math.max(0.05, 0.6 - u * 0.58));
            inst.particles.setColorAt(i, _tmpColor);
          }
        }
        inst.particles.instanceMatrix.needsUpdate = true;
        if (inst.particles.instanceColor) inst.particles.instanceColor.needsUpdate = true;
      } else if (inst.particles) {
        const origin = inst.spec.path?.[0] ?? [0, 0, 0];
        const spread = inst.baseRadius * 3.4;
        for (let i = 0; i < inst.particleCount; i++) {
          const phase = (((time * 0.46 * speed + i / inst.particleCount) % 1) + 1) % 1;
          const angle = i * 2.39996 + phase * (isCombustion ? 1.8 : 0.9);
          const r =
            spread *
            (inst.spec.type === 'pressure_wave'
              ? phase
              : isCombustion
                ? (0.18 + phase * 0.82) * (1 - phase * 0.3)
                : 0.26 + phase * 0.74);
          const rise =
            isVapour || isThermal || isCombustion
              ? phase * spread * (isCombustion ? 1.55 : 2.15)
              : Math.sin(phase * Math.PI * 2) * spread * 0.38;

          _dummy.position.set(origin[0] + Math.cos(angle) * r, origin[1] + rise, origin[2] + Math.sin(angle) * r);
          if (isBillboard && cameraQuaternion) {
            _dummy.quaternion.copy(cameraQuaternion);
            _dummy.rotateZ(phase * 2.4 + i * 0.9);
          } else {
            _dummy.quaternion.identity();
          }
          const fade =
            Math.sin(Math.min(1, phase * 4.0) * (Math.PI * 0.5)) *
            Math.sin(Math.min(1, (1 - phase) * 2.5) * (Math.PI * 0.5));
          const s =
            inst.baseRadius *
            (isVapour ? 0.8 + phase * 1.65 : isCombustion ? 1.25 - phase * 0.55 : 1 - phase * 0.45) *
            fade *
            Math.min(1.5, 0.5 + intensity * 0.62);
          _dummy.scale.setScalar(Math.max(0.004, s));
          _dummy.updateMatrix();
          inst.particles.setMatrixAt(i, _dummy.matrix);

          if (isCombustion) {
            _tmpColor.setRGB(1.0, Math.max(0.22, 1.0 - phase * 0.72), Math.max(0.04, 0.65 - phase * 0.62));
            inst.particles.setColorAt(i, _tmpColor);
          }
        }
        inst.particles.instanceMatrix.needsUpdate = true;
        if (inst.particles.instanceColor) inst.particles.instanceColor.needsUpdate = true;
      }
    }
  }

  clear(): void {
    for (const inst of this.instances) {
      inst.particles?.dispose();
      inst.material.dispose();
      inst.guideLine?.geometry.dispose();
      (inst.guideLine?.material as THREE.Material | undefined)?.dispose();
      inst.innerBeamLine?.geometry.dispose();
      (inst.innerBeamLine?.material as THREE.Material | undefined)?.dispose();
      inst.glowMesh?.geometry.dispose();
      (inst.glowMesh?.material as THREE.Material | undefined)?.dispose();
      inst.innerCoreMesh?.geometry.dispose();
      (inst.innerCoreMesh?.material as THREE.Material | undefined)?.dispose();
      this.root.remove(inst.group);
    }
    this.instances = [];
  }

  dispose(): void {
    this.clear();
    this.sharedSphereGeo.dispose();
    this.sharedPulseGeo.dispose();
    this.sharedDropletGeo.dispose();
    this.sharedPlaneGeo.dispose();
  }
}
