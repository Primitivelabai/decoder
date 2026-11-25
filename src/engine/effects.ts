import * as THREE from 'three';
import type { EffectSpec, EvaluatedSimulationState } from './types';

export interface ActiveEffectInstance {
  spec: EffectSpec;
  group: THREE.Group;
  curve?: THREE.CatmullRomCurve3;
  particles?: THREE.InstancedMesh;
  particleCount: number;
  baseRadius: number;
  guideLine?: THREE.Mesh;
  glowMesh?: THREE.Mesh;
  innerCoreMesh?: THREE.Mesh;
  material: THREE.Material;
}

const _dummy = new THREE.Object3D();
const _pt = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

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

let sharedPuffTexture: THREE.CanvasTexture | null = null;

function getFeatheredPuffTexture(): THREE.CanvasTexture | null {
  if (sharedPuffTexture) return sharedPuffTexture;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.16)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  sharedPuffTexture = new THREE.CanvasTexture(canvas);
  sharedPuffTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedPuffTexture;
}

export class ScientificEffectsManager {
  public readonly root = new THREE.Group();
  private instances: ActiveEffectInstance[] = [];
  private sharedSphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private sharedPulseGeo = new THREE.CylinderGeometry(0.42, 0.42, 2.2, 12);
  private sharedDropletGeo = new THREE.SphereGeometry(1, 16, 12);
  private sharedPlaneGeo = new THREE.PlaneGeometry(2.2, 2.2);

  constructor() {
    this.root.name = '__scientific_effects__';
    this.sharedPulseGeo.rotateX(Math.PI / 2);
    this.sharedDropletGeo.scale(0.85, 0.85, 1.45);
  }

  buildForProject(effects: EffectSpec[]): void {
    this.clear();
    const puffTex = getFeatheredPuffTexture();

    for (const spec of effects) {
      const group = new THREE.Group();
      group.name = `effect_${spec.id}`;
      group.userData.effectId = spec.id;

      const colorHex = spec.color ?? EFFECT_DEFAULT_COLORS[spec.type] ?? '#38bdf8';
      const baseColor = new THREE.Color(colorHex);
      const count = Math.max(8, Math.min(48, Math.round((spec.density ?? 1) * 20)));
      const baseRadius = spec.radius ?? 0.032;

      const isVapour = spec.type === 'steam_vapour' || spec.type === 'smoke' || spec.type === 'airflow';
      const isThermal = spec.type === 'heat_gradient' || spec.type === 'thermal_diffusion';
      const isLiquid = spec.type === 'liquid_flow' || spec.type === 'material_transport';

      let mat: THREE.Material;
      if (isLiquid) {
        mat = new THREE.MeshPhysicalMaterial({
          color: baseColor,
          roughness: 0.06,
          metalness: 0.0,
          clearcoat: 0.9,
          clearcoatRoughness: 0.05,
          ior: 1.333,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
        });
      } else if ((isVapour || isThermal) && puffTex) {
        mat = new THREE.MeshBasicMaterial({
          color: baseColor,
          map: puffTex,
          transparent: true,
          opacity: isThermal ? 0.2 : 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: isThermal ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
      } else {
        mat = new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: spec.type === 'optical_ray' ? 0.72 : 0.88,
          depthWrite: false,
        });
      }

      let curve: THREE.CatmullRomCurve3 | undefined;
      let guideLine: THREE.Mesh | undefined;

      if (spec.path && spec.path.length >= 2) {
        curve = new THREE.CatmullRomCurve3(spec.path.map((p) => new THREE.Vector3(...p)));

        if (
          spec.type === 'optical_ray' ||
          spec.type === 'electromagnetic_field' ||
          spec.type === 'magnetic_field' ||
          spec.type === 'electrical_current'
        ) {
          const beamGeo = new THREE.TubeGeometry(curve, 36, baseRadius * 0.42, 10, false);
          const beamMat = new THREE.MeshBasicMaterial({
            color: baseColor,
            transparent: true,
            opacity: spec.type === 'optical_ray' ? 0.52 : 0.24,
            depthWrite: false,
          });
          guideLine = new THREE.Mesh(beamGeo, beamMat);
          group.add(guideLine);
        }
      }

      const geo =
        spec.type === 'signal_pulse' || spec.type === 'electrical_current' || spec.type === 'optical_ray'
          ? this.sharedPulseGeo
          : isLiquid
            ? this.sharedDropletGeo
            : (isVapour || isThermal) && puffTex
              ? this.sharedPlaneGeo
              : this.sharedSphereGeo;

      const particles = new THREE.InstancedMesh(geo, mat, count);
      particles.frustumCulled = false;
      group.add(particles);

      let glowMesh: THREE.Mesh | undefined;
      let innerCoreMesh: THREE.Mesh | undefined;
      if (
        spec.type === 'combustion' ||
        spec.type === 'heat_gradient' ||
        spec.type === 'pressure_wave' ||
        spec.type === 'thermal_diffusion'
      ) {
        const origin = spec.path?.[0] ?? [0, 0, 0];
        const glowGeo = new THREE.SphereGeometry(baseRadius * 3.1, 20, 14);
        const glowMat = new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: spec.type === 'combustion' ? 0.34 : 0.24,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        glowMesh = new THREE.Mesh(glowGeo, glowMat);
        glowMesh.position.set(origin[0], origin[1], origin[2]);
        group.add(glowMesh);

        if (spec.type === 'combustion') {
          const coreGeo = new THREE.SphereGeometry(baseRadius * 1.65, 16, 12);
          const coreMat = new THREE.MeshBasicMaterial({
            color: spec.secondaryColor ?? '#fef08a',
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          innerCoreMesh = new THREE.Mesh(coreGeo, coreMat);
          innerCoreMesh.position.set(origin[0], origin[1], origin[2]);
          group.add(innerCoreMesh);
        }
      }

      this.root.add(group);
      this.instances.push({
        spec,
        group,
        curve,
        particles,
        particleCount: count,
        baseRadius,
        guideLine,
        glowMesh,
        innerCoreMesh,
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

      inst.group.visible = intensity > 0.02 && !hidden?.has(inst.spec.id);
      if (!inst.group.visible) continue;

      if (inst.material instanceof THREE.MeshBasicMaterial || inst.material instanceof THREE.MeshPhysicalMaterial) {
        inst.material.opacity = isThermal
          ? Math.min(0.24, 0.06 + intensity * 0.14)
          : isVapour
            ? Math.min(0.48, 0.14 + intensity * 0.28)
            : Math.min(0.95, 0.28 + intensity * 0.62);
      }

      if (inst.glowMesh) {
        const pulse = 1 + Math.sin(time * (3.5 + speed * 2.2)) * 0.15 * Math.min(1, intensity);
        inst.glowMesh.scale.setScalar(pulse * Math.max(0.4, Math.min(1.65, intensity)));
        (inst.glowMesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.42, intensity * 0.26);
      }

      if (inst.innerCoreMesh) {
        const flicker = 0.88 + Math.sin(time * 17) * 0.14 + Math.cos(time * 23) * 0.08;
        inst.innerCoreMesh.scale.setScalar(flicker * Math.max(0.35, Math.min(1.4, intensity)));
        (inst.innerCoreMesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, intensity * 0.65);
      }

      if (inst.guideLine) {
        (inst.guideLine.material as THREE.MeshBasicMaterial).opacity = Math.min(
          0.75,
          (inst.spec.type === 'optical_ray' ? 0.55 : 0.26) * intensity,
        );
      }

      if (inst.particles && inst.curve) {
        for (let i = 0; i < inst.particleCount; i++) {
          const offset = i / inst.particleCount;
          const u = (((time * 0.35 * speed + offset) % 1) + 1) % 1;
          inst.curve.getPointAt(u, _pt);
          inst.curve.getTangentAt(u, _tan);

          const jitterMax = inst.spec.clippedToComponent
            ? inst.baseRadius * 0.22
            : isVapour
              ? inst.baseRadius * (0.4 + u * 1.4)
              : inst.baseRadius * 0.5;
          const jx = Math.sin(i * 12.7 + time * 4) * jitterMax;
          const jy = Math.cos(i * 7.3 + time * 3.2) * jitterMax;

          _dummy.position.set(_pt.x + jx, _pt.y + jy, _pt.z);
          if ((isVapour || isThermal) && cameraQuaternion) {
            _dummy.quaternion.copy(cameraQuaternion);
            _dummy.rotateZ(u * 2.2 + i);
          } else if (_tan.lengthSq() > 0.0001) {
            _dummy.quaternion.setFromUnitVectors(_up, _tan.clone().normalize());
            _dummy.lookAt(_pt.x + _tan.x, _pt.y + _tan.y, _pt.z + _tan.z);
          }

          const taper = isVapour
            ? (0.55 + u * 1.65) * Math.sin(Math.min(1, (1 - u) * 3.2) * (Math.PI / 2))
            : Math.sin(u * Math.PI) * 0.42 + 0.68;
          const s = inst.baseRadius * taper * (inst.spec.scale ?? 1) * Math.min(1.4, 0.5 + intensity * 0.5);
          _dummy.scale.setScalar(Math.max(0.003, s));
          _dummy.updateMatrix();
          inst.particles.setMatrixAt(i, _dummy.matrix);
        }
        inst.particles.instanceMatrix.needsUpdate = true;
      } else if (inst.particles) {
        const origin = inst.spec.path?.[0] ?? [0, 0, 0];
        const spread = inst.baseRadius * 3.5;
        for (let i = 0; i < inst.particleCount; i++) {
          const phase = (((time * 0.45 * speed + i / inst.particleCount) % 1) + 1) % 1;
          const angle = i * 2.39996;
          const r = spread * (inst.spec.type === 'pressure_wave' ? phase : 0.28 + phase * 0.72);
          const rise =
            isVapour || isThermal || inst.spec.type === 'combustion'
              ? phase * spread * 2.1
              : Math.sin(phase * Math.PI * 2) * spread * 0.38;
          _dummy.position.set(origin[0] + Math.cos(angle) * r, origin[1] + rise, origin[2] + Math.sin(angle) * r);
          if ((isVapour || isThermal) && cameraQuaternion) {
            _dummy.quaternion.copy(cameraQuaternion);
          } else {
            _dummy.quaternion.identity();
          }
          const fade = Math.sin(Math.min(1, (1 - phase) * 2.5) * (Math.PI / 2));
          const s =
            inst.baseRadius *
            (isVapour ? 0.8 + phase * 1.5 : 1 - phase * 0.45) *
            fade *
            Math.min(1.5, 0.5 + intensity * 0.6);
          _dummy.scale.setScalar(Math.max(0.004, s));
          _dummy.updateMatrix();
          inst.particles.setMatrixAt(i, _dummy.matrix);
        }
        inst.particles.instanceMatrix.needsUpdate = true;
      }
    }
  }

  clear(): void {
    for (const inst of this.instances) {
      inst.material.dispose();
      inst.guideLine?.geometry.dispose();
      (inst.guideLine?.material as THREE.Material | undefined)?.dispose();
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
