import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

export interface PathTracerStatus {
  supported: boolean;
  active: boolean;
  samples: number;
  targetSamples: number;
  error?: string;
}

export function isPathTracingSupported(renderer: THREE.WebGLRenderer, isSoftwareGl: boolean): boolean {
  if (isSoftwareGl || typeof window === 'undefined') return false;
  try {
    const gl = renderer.getContext();
    if (!gl) return false;
    const hasFloatBuf =
      Boolean(gl.getExtension('EXT_color_buffer_float')) || Boolean(gl.getExtension('EXT_color_buffer_half_float'));
    return hasFloatBuf;
  } catch {
    return false;
  }
}

/**
 * Progressive Monte Carlo GPU Path Tracer controller (Blender Cycles-style physical light transport).
 * Tuned with Multiple Importance Sampling (MIS), 8-bounce dielectric refraction, glossy firefly
 * regularization, and adaptive progressive tile scheduling for 60fps UI responsiveness.
 */
export class PathTracerController {
  private pt: WebGLPathTracer | null = null;
  private initializedScene = false;
  private failed = false;
  private lastError: string | undefined;
  public readonly targetSamples = 128;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly isSoftwareGl: boolean,
  ) {}

  public isSupported(): boolean {
    return !this.failed && isPathTracingSupported(this.renderer, this.isSoftwareGl);
  }

  public getStatus(active: boolean): PathTracerStatus {
    return {
      supported: this.isSupported(),
      active: active && this.isSupported() && this.initializedScene,
      samples: Math.floor(this.pt?.samples ?? 0),
      targetSamples: this.targetSamples,
      error: this.lastError,
    };
  }

  public syncScene(scene: THREE.Scene, camera: THREE.Camera): boolean {
    if (!this.isSupported()) return false;
    try {
      if (!this.pt) {
        this.pt = new WebGLPathTracer(this.renderer);
        // Deep inter-reflection & refractive bounce budget for metals, glass boilers & wet tissue
        this.pt.bounces = 6;
        this.pt.transmissiveBounces = 10;
        // Balances sharp chrome/glass caustics while suppressing single-pixel softbox fireflies
        this.pt.filterGlossyFactor = 0.32;
        this.pt.dynamicLowRes = true;
        this.pt.lowResScale = 0.45;
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        this.pt.renderScale = Math.min(dpr, 1.5);
        this.pt.tiles.set(2, 2);

        // Safely enable Multiple Importance Sampling (MIS) & crisp environment sampling when supported
        const extPt = this.pt as unknown as Record<string, unknown>;
        if ('multipleImportanceSampling' in extPt) {
          extPt['multipleImportanceSampling'] = true;
        }
        if ('synchronizeRenderSize' in extPt) {
          extPt['synchronizeRenderSize'] = true;
        }
      }

      // Render full-frame 1x1 on initial convergence pass to avoid visible tile seams on frame 1
      this.pt.tiles.set(1, 1);
      this.pt.setScene(scene, camera);
      this.initializedScene = true;
      return true;
    } catch (err) {
      this.failed = true;
      this.lastError = err instanceof Error ? err.message : 'Path tracer initialization unavailable';
      return false;
    }
  }

  public setCamera(camera: THREE.Camera): void {
    if (!this.pt || !this.initializedScene) return;
    try {
      this.pt.tiles.set(1, 1);
      this.pt.setCamera(camera);
    } catch {
      // Ignore transient camera sync error
    }
  }

  public updateCamera(): void {
    if (!this.pt || !this.initializedScene) return;
    try {
      this.pt.tiles.set(1, 1);
      this.pt.updateCamera();
    } catch {
      // Ignore
    }
  }

  public updateEnvironment(): void {
    if (!this.pt || !this.initializedScene) return;
    try {
      this.pt.tiles.set(1, 1);
      this.pt.updateEnvironment();
    } catch {
      // Ignore
    }
  }

  public reset(): void {
    if (!this.pt || !this.initializedScene) return;
    this.pt.tiles.set(1, 1);
    this.pt.reset();
  }

  public renderSample(): number {
    if (!this.pt || !this.initializedScene || this.failed) return 0;
    try {
      if (this.pt.samples < this.targetSamples) {
        // After initial full-frame preview samples (0..3), switch to 2x2 tiles so deep bounces stay silky-responsive
        if (this.pt.samples >= 3 && this.pt.tiles.x === 1) {
          this.pt.tiles.set(2, 2);
        }
        this.pt.renderSample();
      }
      return Math.floor(this.pt.samples);
    } catch (err) {
      this.failed = true;
      this.lastError = err instanceof Error ? err.message : 'Path tracer sample failed';
      return 0;
    }
  }

  public dispose(): void {
    try {
      this.pt?.dispose();
    } catch {
      // Ignore dispose cleanup error
    }
    this.pt = null;
    this.initializedScene = false;
  }
}
