import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { ScientificEffectsManager } from './effects';
import { GeometryKernel, createComponentMesh } from './geometry';
import { LIGHTING_PRESETS, MaterialLibrary } from './materials';
import { PathTracerController, type PathTracerStatus } from './pathtracer';
import {
  findLoopRelationshipIds,
  RELATIONSHIP_LINE,
  traceComponentRelationships,
  type LineStyle,
} from './relationships';
import { DecoderRuntime } from './runtime';
import { buildExplosionPlan, computeHierarchicalExplosionOffset, type ExplosionPlan } from './spatial';
import type {
  CameraPose,
  CameraPresetId,
  CameraProjection,
  DecoderProject,
  EvaluatedSimulationState,
  ExaminationMode,
  LightingPresetId,
  RenderQualityMode,
  SectionPlaneState,
  Vec3,
} from './types';

export interface ViewportState {
  explosion: number;
  examinationMode: ExaminationMode;
  section: SectionPlaneState;
  playing: boolean;
  playbackSpeed: number;
  time: number;
  selectedComponentId: string | null;
  highlightedComponentIds: string[];
  hiddenComponentIds: string[];
  isolatedLayer: string | null;
  lightingPreset: LightingPresetId;
  showEffects: boolean;
  showRelationships: boolean;
  transformMode: 'none' | 'translate' | 'rotate' | 'scale';
  renderQualityMode: RenderQualityMode;
  cameraProjection: CameraProjection;
  exposure: number;
  enableAO: boolean;
  enableDof: boolean;
}

export interface ViewportCallbacks {
  onSelectComponent?: (componentId: string | null) => void;
  onSimUpdate?: (simState: EvaluatedSimulationState) => void;
  onTransformChange?: (componentId: string, pos: Vec3, rot: Vec3, scale: Vec3) => void;
  onPathTracerStatus?: (status: PathTracerStatus) => void;
  onSimulationError?: (message: string) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

const _dampPos = new THREE.Vector3();
const _dampTarget = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();
const _tmpBox = new THREE.Box3();
const _tmpSize = new THREE.Vector3();
const _tmpCenter = new THREE.Vector3();

export function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Procedurally synthesizes an equirectangular HDR studio environment map with
 * overhead & side softbox emitters + subtle rim strip for physically grounded IBL.
 */
function createStudioHdrEquirectTexture(): THREE.DataTexture {
  const width = 256;
  const height = 128;
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1); // 0 = bottom, 1 = top in Three DataTexture
    const theta = (1 - v) * Math.PI; // 0 = zenith, PI = nadir
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      // three.js samples equirect maps at u = atan2(z, x) / 2π + 0.5, so u = 0 faces -x.
      const phi = u * Math.PI * 2 - Math.PI;
      const dx = sinT * Math.cos(phi);
      const dy = cosT;
      const dz = sinT * Math.sin(phi);

      // Dark studio surround: metals need dark areas to reflect, or they read as flat white.
      const skyFactor = Math.max(0, dy);
      const groundFactor = Math.max(0, -dy);
      let r = 0.025 + skyFactor * 0.05 + groundFactor * 0.012;
      let g = 0.027 + skyFactor * 0.055 + groundFactor * 0.012;
      let b = 0.032 + skyFactor * 0.065 + groundFactor * 0.014;

      // Overhead main rectangular softbox (warm-neutral daylight)
      const overheadMask =
        THREE.MathUtils.smoothstep(dy, 0.8, 0.9) *
        (1 - THREE.MathUtils.smoothstep(Math.abs(dx), 0.28, 0.46)) *
        (1 - THREE.MathUtils.smoothstep(Math.abs(dz), 0.18, 0.34));
      r += overheadMask * 1.9;
      g += overheadMask * 1.86;
      b += overheadMask * 1.8;

      // Key front-right softbox
      const keyDot = dx * 0.62 + dy * 0.48 + dz * 0.62;
      const keyBox = THREE.MathUtils.smoothstep(keyDot, 0.88, 0.95);
      r += keyBox * 2.4;
      g += keyBox * 2.32;
      b += keyBox * 2.2;

      // Cool fill left-front softbox
      const fillDot = -dx * 0.76 + dy * 0.38 + dz * 0.52;
      const fillBox = THREE.MathUtils.smoothstep(fillDot, 0.86, 0.94);
      r += fillBox * 0.7;
      g += fillBox * 0.76;
      b += fillBox * 0.84;

      // Crisp rear rim strip light, kept near the horizon for the same reason as the rim light.
      const rimDot = -dx * 0.34 + dy * 0.12 - dz * 0.93;
      const rimStrip = THREE.MathUtils.smoothstep(rimDot, 0.9, 0.96);
      r += rimStrip * 3.1;
      g += rimStrip * 3.35;
      b += rimStrip * 3.75;

      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 1.0;
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Outlines exactly the meshes it is given. The stock pass also outlines every child, and parts are
 * nested (the casing sits under the drip tray), so selecting one part would outline the whole model.
 */
class PartOutlinePass extends OutlinePass {
  _updateSelectionCache(): void {
    const cache = (this as unknown as { _selectionCache: Set<THREE.Object3D> })._selectionCache;
    cache.clear();
    for (const obj of this.selectedObjects) cache.add(obj);
  }
}

const FLOW_COLOUR = 0xc9cdd3;
const FLOW_LOOP_COLOUR = 0xff4f9a;

/** Tubes for one flow, drawn in the same line style the flow key uses. */
function flowLineGeometries(
  curve: THREE.Curve<THREE.Vector3>,
  style: LineStyle,
  radius: number,
): THREE.BufferGeometry[] {
  const length = curve.getLength();
  if (style === 'dashed') {
    const dash = Math.max(0.04, radius * 6);
    const count = Math.max(2, Math.floor(length / (dash * 1.8)));
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const t0 = i / count;
      const t1 = t0 + (1 / count) * 0.55;
      const a = curve.getPointAt(t0);
      const b = curve.getPointAt(Math.min(1, t1));
      geos.push(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, radius, 6, false));
    }
    return geos;
  }
  if (style === 'dotted') {
    const gap = Math.max(0.035, radius * 4.5);
    const count = Math.max(2, Math.floor(length / gap));
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i <= count; i++) {
      const p = curve.getPointAt(i / count);
      const dot = new THREE.SphereGeometry(radius * 1.3, 8, 6);
      dot.translate(p.x, p.y, p.z);
      geos.push(dot);
    }
    return geos;
  }
  if (style === 'double') {
    const segments = 24;
    const frames = curve.computeFrenetFrames(segments, false);
    const offset = radius * 2.4;
    const sides = [1, -1].map((sign) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const p = curve.getPointAt(i / segments);
        pts.push(p.addScaledVector(frames.binormals[i], sign * offset));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segments, radius * 0.6, 6, false);
    });
    return sides;
  }
  return [new THREE.TubeGeometry(curve, 20, radius, 6, false)];
}

export class DecoderViewport {
  public readonly isSoftwareGl: boolean;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly perspCamera: THREE.PerspectiveCamera;
  public readonly orthoCamera: THREE.OrthographicCamera;
  public camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  public readonly controls: OrbitControls;
  public readonly transformControls: TransformControls;

  private readonly kernel = new GeometryKernel();
  private readonly matLib: MaterialLibrary;
  private readonly effectsManager = new ScientificEffectsManager();
  private readonly runtime: DecoderRuntime;
  private lastGoodSimulation?: EvaluatedSimulationState;
  private readonly pathTracer: PathTracerController;

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private outlinePass: PartOutlinePass | null = null;
  private gtaoPass: GTAOPass | null = null;
  private bokehPass: BokehPass | null = null;
  private outputPass: OutputPass | null = null;

  private hdrEquirectTex: THREE.DataTexture | null = null;
  private pmremEnvTex: THREE.Texture | null = null;

  private modelRoot = new THREE.Group();
  private relationshipGroup = new THREE.Group();
  private sectionHelperMesh: THREE.Mesh;
  private gridHelper: THREE.GridHelper;
  private shadowDisc: THREE.Mesh;

  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private rectLightTop: THREE.RectAreaLight | null = null;
  private rectLightSide: THREE.RectAreaLight | null = null;
  private clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  private shadowTex: THREE.CanvasTexture | null = null;

  private componentObjects = new Map<string, THREE.Object3D>();
  private baseTransforms = new Map<string, { pos: Vec3; rot: Vec3; scale: Vec3 }>();
  private componentMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
  private explosionPlan: ExplosionPlan = { offsets: {}, order: [], subsystems: {} };
  private project: DecoderProject;
  private paramValues: Record<string, number | boolean | string> = {};

  private state: ViewportState = {
    explosion: 0,
    examinationMode: 'assembled',
    section: { enabled: false, axis: 'x', position: 0 },
    playing: true,
    playbackSpeed: 1,
    time: 0,
    selectedComponentId: null,
    highlightedComponentIds: [],
    hiddenComponentIds: [],
    isolatedLayer: null,
    lightingPreset: 'technical_studio',
    showEffects: true,
    showRelationships: false,
    transformMode: 'none',
    renderQualityMode: 'interactive',
    cameraProjection: 'perspective',
    exposure: 1.08,
    enableAO: true,
    enableDof: false,
  };

  private currentExplosion = 0;
  private cameraTweenTarget: { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null = null;
  private callbacks: ViewportCallbacks = {};
  private interactables: THREE.Object3D[] = [];

  private frameId = 0;
  private disposed = false;
  private lastTickMs = performance.now();
  private lastHudNotifyMs = 0;
  private lastPtNotifyMs = 0;
  private renderBusy = false;
  private renderDirty = false;
  private isOrbitInteracting = false;
  private pathTracerSceneSynced = false;
  private pointerDownPos = { x: 0, y: 0 };

  constructor(
    private readonly container: HTMLElement,
    initialProject: DecoderProject,
    callbacks: ViewportCallbacks = {},
  ) {
    this.project = initialProject;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.runtime = new DecoderRuntime(initialProject);
    this.paramValues = this.runtime.getDefaultParameters();

    const w = container.clientWidth || 800;
    const h = Math.max(1, container.clientHeight || 600);
    const aspect = w / h;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    const maxAniso = this.isSoftwareGl ? 1 : Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.matLib = new MaterialLibrary(this.isSoftwareGl, maxAniso);
    this.pathTracer = new PathTracerController(this.renderer, this.isSoftwareGl);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    if (!this.isSoftwareGl) {
      this.hdrEquirectTex = createStudioHdrEquirectTexture();
      pmrem.compileEquirectangularShader();
      this.pmremEnvTex = pmrem.fromEquirectangular(this.hdrEquirectTex).texture;
      this.scene.environment = this.pmremEnvTex;
    } else {
      this.pmremEnvTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.pmremEnvTex;
    }
    this.scene.environmentIntensity = 1.0;
    pmrem.dispose();

    this.perspCamera = new THREE.PerspectiveCamera(initialProject.defaultCamera.fov ?? 38, aspect, 0.04, 150);
    this.perspCamera.position.set(...initialProject.defaultCamera.position);

    const frustumH = 3.2;
    this.orthoCamera = new THREE.OrthographicCamera(
      (-frustumH * aspect) / 2,
      (frustumH * aspect) / 2,
      frustumH / 2,
      -frustumH / 2,
      0.04,
      150,
    );
    this.orthoCamera.position.copy(this.perspCamera.position);
    this.camera = this.perspCamera;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...initialProject.defaultCamera.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 32;
    this.controls.addEventListener('start', () => {
      this.cameraTweenTarget = null;
      this.isOrbitInteracting = true;
    });
    this.controls.addEventListener('end', () => {
      this.isOrbitInteracting = false;
      if (this.shouldUsePathTracer()) {
        this.pathTracer.updateCamera();
      }
      if (!this.state.playing) this.requestRender();
    });
    this.controls.addEventListener('change', () => {
      if (this.shouldUsePathTracer() && !this.isOrbitInteracting) {
        this.pathTracer.updateCamera();
      }
      if (!this.state.playing) this.requestRender();
    });

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setSize(0.75);
    this.transformControls.addEventListener('dragging-changed', (ev) => {
      this.controls.enabled = !ev.value;
    });
    this.transformControls.addEventListener('objectChange', () => {
      const obj = this.transformControls.object;
      if (obj && obj.userData.componentId) {
        const cid = obj.userData.componentId as string;
        const pos: Vec3 = [
          Number(obj.position.x.toFixed(3)),
          Number(obj.position.y.toFixed(3)),
          Number(obj.position.z.toFixed(3)),
        ];
        const rot: Vec3 = [
          Number(obj.rotation.x.toFixed(3)),
          Number(obj.rotation.y.toFixed(3)),
          Number(obj.rotation.z.toFixed(3)),
        ];
        const scale: Vec3 = [
          Number(obj.scale.x.toFixed(3)),
          Number(obj.scale.y.toFixed(3)),
          Number(obj.scale.z.toFixed(3)),
        ];
        this.baseTransforms.set(cid, { pos, rot, scale });
        this.callbacks.onTransformChange?.(cid, pos, rot, scale);
        this.pathTracerSceneSynced = false;
      }
      if (!this.state.playing) this.requestRender();
    });
    this.scene.add(this.transformControls.getHelper());

    // Calibrated 3-Point Studio Lighting Rig + Softbox RectAreaLights
    this.hemiLight = new THREE.HemisphereLight('#bcd2f5', '#1d222c', 0.85);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight('#fff5e6', 2.35);
    this.keyLight.position.set(6, 9, 7);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(this.isSoftwareGl ? 512 : 2048, this.isSoftwareGl ? 512 : 2048);
    const d = 5.5;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 30;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.018;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight('#93c5fd', 1.18);
    // Low behind the model: at (-6, 5, -7) every flat glossy top mirrored it straight into the
    // default front-right camera, so dark plastics and paint read as silver.
    this.rimLight.position.set(-6, 1.4, -7);
    this.scene.add(this.rimLight);

    this.fillLight = new THREE.DirectionalLight('#dbeafe', 0.65);
    this.fillLight.position.set(-5, 3.5, 6);
    this.scene.add(this.fillLight);

    if (!this.isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      this.rectLightTop = new THREE.RectAreaLight('#ffffff', 2.1, 5.0, 2.8);
      this.rectLightTop.position.set(0, 6.8, 3.6);
      this.rectLightTop.lookAt(0, 0.5, 0);
      this.scene.add(this.rectLightTop);

      this.rectLightSide = new THREE.RectAreaLight('#dbeafe', 1.4, 3.4, 4.0);
      this.rectLightSide.position.set(-5.2, 3.2, 4.2);
      this.rectLightSide.lookAt(0, 0.5, 0);
      this.scene.add(this.rectLightSide);
    }

    // Ground Grid & Soft Radial Contact Shadow Plane
    this.gridHelper = new THREE.GridHelper(18, 24, '#2a3241', '#1f2531');
    this.gridHelper.position.y = -0.02;
    this.scene.add(this.gridHelper);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(128, 128, 6, 128, 128, 124);
      grad.addColorStop(0, 'rgba(0,0,0,0.68)');
      grad.addColorStop(0.42, 'rgba(0,0,0,0.32)');
      grad.addColorStop(0.75, 'rgba(0,0,0,0.08)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 256, 256);
    }
    this.shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeo = new THREE.PlaneGeometry(6.8, 6.8);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
    });
    this.shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowDisc.position.y = -0.015;
    this.scene.add(this.shadowDisc);

    // Section plane helper
    const secGeo = new THREE.PlaneGeometry(5.5, 5.5);
    const secMat = new THREE.MeshBasicMaterial({
      color: 0xf5f5f5,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.sectionHelperMesh = new THREE.Mesh(secGeo, secMat);
    this.sectionHelperMesh.visible = false;
    this.scene.add(this.sectionHelperMesh);

    this.scene.add(this.modelRoot);
    this.scene.add(this.effectsManager.root);
    this.scene.add(this.relationshipGroup);

    // Hardware-only Post-Processing Pipeline (GTAO + optional Bokeh DOF + ACES Output)
    if (!this.isSoftwareGl) {
      try {
        this.composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        this.gtaoPass = new GTAOPass(this.scene, this.camera, w, h);
        this.gtaoPass.output = GTAOPass.OUTPUT.Default;
        this.gtaoPass.updateGtaoMaterial({
          radius: 0.28,
          distanceExponent: 1.5,
          thickness: 1.0,
          scale: 1.05,
          samples: 12,
          distanceFallOff: 1.0,
        });
        this.gtaoPass.blendIntensity = 0.68;
        this.composer.addPass(this.gtaoPass);

        this.bokehPass = new BokehPass(this.scene, this.perspCamera, {
          focus: 4.5,
          aperture: 0.00018,
          maxblur: 0.007,
        });
        this.bokehPass.enabled = false;
        this.composer.addPass(this.bokehPass);

        this.outlinePass = new PartOutlinePass(new THREE.Vector2(w, h), this.scene, this.camera);
        this.outlinePass.visibleEdgeColor.set('#ff4f9a');
        this.outlinePass.hiddenEdgeColor.set('#5c2a40');
        this.outlinePass.edgeStrength = 4;
        this.outlinePass.edgeThickness = 1;
        this.outlinePass.edgeGlow = 0;
        this.composer.addPass(this.outlinePass);

        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);
      } catch {
        this.composer = null;
      }
    }

    this.applyLightingPreset(initialProject.lightingPreset);
    this.loadProject(initialProject);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.startLoop();
  }

  private resizeObserver: ResizeObserver | null = null;
  /** Pixels on each side of the canvas covered by overlays; the model is fitted into what is left. */
  private viewInsets = { left: 0, right: 0 };

  /** Keeps the framing inside the part of the canvas no panel covers. A single number is a right inset. */
  public setViewInset(inset: number | { left?: number; right?: number }): void {
    const raw = typeof inset === 'number' ? { left: 0, right: inset } : inset;
    const left = Math.max(0, Math.round(raw.left ?? 0));
    const right = Math.max(0, Math.round(raw.right ?? 0));
    if (left === this.viewInsets.left && right === this.viewInsets.right) return;
    this.viewInsets = { left, right };
    this.onResize();
  }

  /** Bounding sphere of the assembled model, measured when an exhibit loads. */
  private modelRadius = 0;
  /** How far the assembled model reaches from the camera target; the baseline for pulling apart. */
  private restReach = 0;
  /** Extra zoom out so pulled-apart parts stay in frame (1 when assembled). */
  private explodeZoom = 1;
  private lastFitExplosion = 0;

  /** Distance from the default camera target to the far side of the model's current bounds. */
  private measureReach(): number {
    _tmpBox.setFromObject(this.modelRoot);
    if (_tmpBox.isEmpty() || !this.project) return 0;
    const target = new THREE.Vector3(...this.project.defaultCamera.target);
    const centre = _tmpBox.getCenter(new THREE.Vector3());
    return centre.distanceTo(target) + _tmpBox.getSize(_tmpSize).length() / 2;
  }

  /** Re-fits the frame as parts move apart, so the camera pulls back instead of losing them off screen. */
  private refitForExplosion(): void {
    if (Math.abs(this.currentExplosion - this.lastFitExplosion) < 0.002) return;
    this.lastFitExplosion = this.currentExplosion;
    const reach = this.currentExplosion > 0.002 ? this.measureReach() : this.restReach;
    const zoom = this.restReach > 0 && reach > 0 ? Math.min(1, this.restReach / reach) : 1;
    if (Math.abs(zoom - this.explodeZoom) < 0.002) return;
    this.explodeZoom = zoom;
    this.applyViewOffset(this.container.clientWidth || 800, Math.max(1, this.container.clientHeight || 600));
  }

  /**
   * How the default framing maps into the free part of the canvas. The model's bounding sphere, seen
   * from the exhibit's default camera distance, must fit the width the overlays leave free (on a tall
   * phone screen that is simply the canvas width). The whole frame is scaled down until it does, then
   * its centre moves to the centre of the free area. Zooming by hand still works on top of this.
   */
  private frameFit(w: number, h: number): { scale: number; centreX: number } {
    const total = this.viewInsets.left + this.viewInsets.right;
    const shrink = total > w * 0.75 ? (w * 0.75) / total : 1;
    const left = this.viewInsets.left * shrink;
    const right = this.viewInsets.right * shrink;
    const freeW = Math.max(1, w - left - right);
    let scale = 1;
    const pose = this.project?.defaultCamera;
    if (this.modelRadius > 0 && pose) {
      const dist = new THREE.Vector3(...pose.position).distanceTo(new THREE.Vector3(...pose.target));
      const halfFov = THREE.MathUtils.degToRad((pose.fov ?? 38) / 2);
      const diameterPx = (h * this.modelRadius) / Math.max(1e-3, dist * Math.tan(halfFov));
      scale = Math.min(1, (freeW * 0.96) / diameterPx);
    }
    return { scale: Math.max(0.2, scale * this.explodeZoom), centreX: left + freeW / 2 };
  }

  /** Aspect of the virtual frame; the view offset keeps it equal to the canvas aspect. */
  private frameAspect(): number {
    const w = this.container.clientWidth || 800;
    const h = Math.max(1, this.container.clientHeight || 600);
    return w / h;
  }

  private applyViewOffset(w: number, h: number): void {
    const { scale, centreX } = this.frameFit(w, h);
    const identity = scale > 0.999 && Math.abs(centreX - w / 2) < 0.5;
    // A virtual frame smaller than the canvas widens the visible frustum: that is the zoom out.
    const fullW = w * scale;
    const fullH = h * scale;
    const x = fullW / 2 - centreX;
    const y = fullH / 2 - h / 2;
    for (const cam of [this.perspCamera, this.orthoCamera]) {
      if (identity) cam.clearViewOffset();
      else cam.setViewOffset(fullW, fullH, x, y, w, h);
    }
  }

  public isPathTracingSupported(): boolean {
    return this.pathTracer.isSupported();
  }

  private shouldUsePathTracer(): boolean {
    return (
      !this.isSoftwareGl &&
      this.state.renderQualityMode === 'photorealistic' &&
      !this.state.playing &&
      !this.isOrbitInteracting &&
      !this.cameraTweenTarget &&
      this.pathTracer.isSupported()
    );
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('webglcontextlost', this.onWebglContextLost);
    dom.addEventListener('webglcontextrestored', this.onWebglContextRestored);
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.container);
    }
  }

  private onWebglContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost?.();
  };

  private onWebglContextRestored = () => {
    this.callbacks.onContextRestored?.();
    this.requestRender();
  };

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent) => {
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dist > 5) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = raycaster.intersectObjects(this.interactables, false);
    if (hits.length > 0) {
      const cid = hits[0].object.userData.componentId as string | undefined;
      if (cid) {
        this.callbacks.onSelectComponent?.(cid);
        return;
      }
    }
    this.callbacks.onSelectComponent?.(null);
  };

  private syncOrthoFrustum(aspect: number): void {
    const dist = Math.max(0.5, this.camera.position.distanceTo(this.controls.target));
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(this.perspCamera.fov * 0.5));
    const halfW = halfH * aspect;
    this.orthoCamera.left = -halfW;
    this.orthoCamera.right = halfW;
    this.orthoCamera.top = halfH;
    this.orthoCamera.bottom = -halfH;
    this.orthoCamera.updateProjectionMatrix();
  }

  public onResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || 800;
    const h = Math.max(1, this.container.clientHeight || 600);
    const aspect = w / h;
    const frameAspect = this.frameAspect();

    this.perspCamera.aspect = frameAspect;
    this.perspCamera.updateProjectionMatrix();
    this.syncOrthoFrustum(frameAspect);
    this.applyViewOffset(w, h);

    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.gtaoPass?.setSize(w, h);
    if (this.bokehPass) {
      (this.bokehPass.uniforms as Record<string, THREE.IUniform>)['aspect'].value = aspect;
    }
    if (this.shouldUsePathTracer()) {
      this.pathTracer.updateCamera();
    }
    this.requestRender();
  };

  public applyLightingPreset(presetId: LightingPresetId): void {
    const cfg = LIGHTING_PRESETS[presetId] ?? LIGHTING_PRESETS.technical_studio;
    this.state.lightingPreset = presetId;
    this.scene.background = new THREE.Color(cfg.background);
    this.scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
    this.keyLight.color.set(cfg.keyColor);
    this.keyLight.intensity = cfg.keyIntensity;
    this.keyLight.position.set(...cfg.keyPosition);
    this.hemiLight.color.set(cfg.fillSkyColor);
    this.hemiLight.groundColor.set(cfg.fillGroundColor);
    this.hemiLight.intensity = cfg.fillIntensity;
    this.rimLight.color.set(cfg.rimColor);
    this.rimLight.intensity = cfg.rimIntensity;
    this.renderer.toneMappingExposure = this.state.exposure || cfg.exposure;

    const gridMats = Array.isArray(this.gridHelper.material) ? this.gridHelper.material : [this.gridHelper.material];
    gridMats.forEach((m) => {
      const lm = m as THREE.LineBasicMaterial;
      lm.color.set(cfg.gridColor);
      lm.transparent = true;
      lm.opacity = cfg.gridOpacity;
    });
    if (this.pathTracerSceneSynced) {
      this.pathTracer.reset();
    }
    this.requestRender();
  }

  public loadProject(project: DecoderProject, resetCamera = true): void {
    this.project = project;
    this.runtime.setProject(project);
    this.lastGoodSimulation = undefined;
    this.state.time = 0;
    this.paramValues = this.runtime.getDefaultParameters();
    this.explosionPlan = buildExplosionPlan(project);
    this.pathTracerSceneSynced = false;

    this.transformControls.detach();
    if (this.outlinePass) this.outlinePass.selectedObjects = [];
    this.modelRoot.clear();
    this.componentObjects.clear();
    this.baseTransforms.clear();
    this.componentMaterials.clear();
    this.interactables = [];

    const matMap = new Map(project.materials.map((m) => [m.id, m]));
    const objMap = new Map<string, THREE.Object3D>();

    for (const comp of project.components) {
      const mSpec = comp.materialId ? matMap.get(comp.materialId) : undefined;
      const baseMat = this.matLib.getMaterial(mSpec).clone();
      baseMat.clippingPlanes = [this.clipPlane];
      this.componentMaterials.set(comp.id, baseMat);

      const obj = createComponentMesh(comp, this.kernel, baseMat);
      obj.name = comp.id;
      obj.userData.componentId = comp.id;
      obj.userData.component = comp;

      const pos: Vec3 = comp.transform?.position ? [...comp.transform.position] : [0, 0, 0];
      const rot: Vec3 = comp.transform?.rotation ? [...comp.transform.rotation] : [0, 0, 0];
      const scale: Vec3 = comp.transform?.scale ? [...comp.transform.scale] : [1, 1, 1];
      obj.position.set(...pos);
      obj.rotation.set(...rot);
      obj.scale.set(...scale);

      this.baseTransforms.set(comp.id, { pos, rot, scale });
      this.componentObjects.set(comp.id, obj);
      objMap.set(comp.id, obj);
      if ((obj as THREE.Mesh).isMesh) {
        this.interactables.push(obj);
      }
    }

    for (const comp of project.components) {
      const obj = objMap.get(comp.id)!;
      if (comp.parentId && objMap.has(comp.parentId)) {
        objMap.get(comp.parentId)!.add(obj);
      } else {
        this.modelRoot.add(obj);
      }
    }

    // Scale ground contact shadow & grid height cleanly to model footprint
    this.modelRoot.updateMatrixWorld(true);
    _tmpBox.setFromObject(this.modelRoot);
    this.modelRadius = _tmpBox.isEmpty() ? 0 : _tmpBox.getSize(_tmpSize).length() / 2;
    this.restReach = this.measureReach();
    this.explodeZoom = 1;
    this.lastFitExplosion = 0;
    _tmpBox.setFromObject(this.modelRoot);
    if (!_tmpBox.isEmpty()) {
      _tmpBox.getSize(_tmpSize);
      const footprint = Math.max(2.2, Math.max(_tmpSize.x, _tmpSize.z) * 1.9);
      this.shadowDisc.scale.set(footprint / 6.8, 1, footprint / 6.8);
      const floorY = Math.min(-0.02, _tmpBox.min.y - 0.015);
      this.shadowDisc.position.y = floorY + 0.005;
      this.gridHelper.position.y = floorY;
    }

    this.effectsManager.buildForProject(project.effects);
    this.findSealedHeatEffects(project);
    this.applyViewOffset(this.container.clientWidth || 800, Math.max(1, this.container.clientHeight || 600));
    this.rebuildRelationshipOverlay();
    this.applyLightingPreset(project.lightingPreset);

    if (resetCamera) {
      this.setCameraPose(project.defaultCamera, false);
    }
    this.applyExaminationMaterials();
    this.stepSimulation(0);
    this.controls.update();
    this.renderFrame();
    if (!this.state.playing) {
      this.requestRender();
    }
  }

  public setCameraProjection(proj: CameraProjection): void {
    const activeProj: CameraProjection = this.camera === this.orthoCamera ? 'orthographic' : 'perspective';
    if (activeProj === proj) return;
    const prevCam = this.camera;
    this.state.cameraProjection = proj;

    const aspect = this.frameAspect();
    if (proj === 'orthographic') {
      this.orthoCamera.position.copy(prevCam.position);
      this.orthoCamera.quaternion.copy(prevCam.quaternion);
      this.syncOrthoFrustum(aspect);
      this.camera = this.orthoCamera;
    } else {
      this.perspCamera.position.copy(prevCam.position);
      this.perspCamera.quaternion.copy(prevCam.quaternion);
      this.perspCamera.aspect = aspect;
      this.perspCamera.updateProjectionMatrix();
      this.camera = this.perspCamera;
    }

    this.controls.object = this.camera;
    this.transformControls.camera = this.camera;
    if (this.renderPass) this.renderPass.camera = this.camera;
    if (this.gtaoPass) this.gtaoPass.camera = this.camera;
    if (this.outlinePass) this.outlinePass.renderCamera = this.camera;
    if (this.bokehPass) {
      this.bokehPass.enabled = this.state.enableDof && proj === 'perspective';
    }
    this.controls.update();
    if (this.pathTracerSceneSynced) {
      this.pathTracer.setCamera(this.camera);
    }
    this.requestRender();
  }

  public applyCameraPreset(preset: CameraPresetId): void {
    this.modelRoot.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(this.modelRoot);

    if (preset === 'macro') {
      const targetCompId =
        this.state.selectedComponentId ??
        this.project.components.find((c) => c.layer === 'core')?.id ??
        this.project.components[0]?.id;
      const targetObj = targetCompId ? this.componentObjects.get(targetCompId) : null;
      if (targetObj) {
        const partBox = new THREE.Box3().setFromObject(targetObj);
        if (!partBox.isEmpty()) box = partBox;
      }
    }

    if (box.isEmpty()) {
      this.setCameraPose(this.project.defaultCamera, true);
      return;
    }

    box.getCenter(_tmpCenter);
    box.getSize(_tmpSize);
    const maxDim = Math.max(0.35, _tmpSize.length());
    const fov = preset === 'macro' ? 32 : (this.project.defaultCamera.fov ?? 38);
    const distScale = preset === 'macro' ? 1.15 : 1.05;
    const dist = ((maxDim * 0.58) / Math.tan(THREE.MathUtils.degToRad(fov * 0.5))) * distScale;

    let dir = new THREE.Vector3(0.75, 0.42, 0.85);
    if (preset === 'front') dir.set(0, 0.08, 1);
    else if (preset === 'side') dir.set(1, 0.08, 0);
    else if (preset === 'top') dir.set(0, 1, 0.06);
    else if (preset === 'isometric') dir.set(1, 0.82, 1);
    else if (preset === 'macro') dir.set(0.72, 0.35, 0.78);
    else dir.set(0.74, 0.4, 0.84);

    dir.normalize().multiplyScalar(dist);
    const pos: Vec3 = [_tmpCenter.x + dir.x, _tmpCenter.y + dir.y, _tmpCenter.z + dir.z];
    const target: Vec3 = [_tmpCenter.x, _tmpCenter.y, _tmpCenter.z];
    this.setCameraPose({ position: pos, target, fov }, true);
  }

  public setCameraPose(pose: CameraPose, animate = true): void {
    const fov = pose.fov ?? 38;
    if (!animate || this.isSoftwareGl) {
      this.perspCamera.position.set(...pose.position);
      this.orthoCamera.position.set(...pose.position);
      this.controls.target.set(...pose.target);
      this.perspCamera.fov = fov;
      this.perspCamera.updateProjectionMatrix();
      const aspect = this.frameAspect();
      this.syncOrthoFrustum(aspect);
      this.controls.update();
      this.cameraTweenTarget = null;
      if (this.shouldUsePathTracer()) this.pathTracer.updateCamera();
      this.requestRender();
      return;
    }
    this.cameraTweenTarget = {
      pos: new THREE.Vector3(...pose.position),
      target: new THREE.Vector3(...pose.target),
      fov,
    };
    this.requestRender();
  }

  public setParameters(params: Record<string, number | boolean | string>): void {
    this.paramValues = { ...params };
    this.pathTracerSceneSynced = false;
    if (!this.state.playing) {
      this.stepSimulation(0);
      this.requestRender();
    }
  }

  public updateState(next: Partial<ViewportState>): void {
    // Playback time is owned by the viewport and changed only through setTime(),
    // so a full UI state snapshot cannot rewind the simulation.
    const { time: _time, ...partial } = next;
    const prevPlaying = this.state.playing;
    const prevMode = this.state.examinationMode;
    const prevSel = this.state.selectedComponentId;
    const prevTransformMode = this.state.transformMode;
    const prevQuality = this.state.renderQualityMode;
    const prevProj = this.state.cameraProjection;
    const prevExplosion = this.state.explosion;

    this.state = { ...this.state, ...partial };

    if (partial.lightingPreset) {
      this.applyLightingPreset(partial.lightingPreset);
    }

    if (partial.exposure !== undefined) {
      this.renderer.toneMappingExposure = partial.exposure;
    }

    if (partial.cameraProjection && partial.cameraProjection !== prevProj) {
      this.setCameraProjection(partial.cameraProjection);
    }

    if (this.gtaoPass && partial.enableAO !== undefined) {
      this.gtaoPass.enabled = partial.enableAO;
    }

    if (this.bokehPass && (partial.enableDof !== undefined || partial.cameraProjection !== undefined)) {
      this.bokehPass.enabled = this.state.enableDof && this.state.cameraProjection === 'perspective';
    }

    if (partial.examinationMode !== undefined && partial.examinationMode !== prevMode) {
      this.applyExaminationMaterials();
      this.pathTracerSceneSynced = false;
    } else if (
      partial.selectedComponentId !== prevSel ||
      partial.highlightedComponentIds !== undefined ||
      partial.hiddenComponentIds !== undefined ||
      partial.isolatedLayer !== undefined
    ) {
      this.applyExaminationMaterials();
      this.pathTracerSceneSynced = false;
    }

    if (partial.explosion !== undefined && Math.abs(partial.explosion - prevExplosion) > 0.001) {
      this.pathTracerSceneSynced = false;
    }

    if (partial.selectedComponentId !== prevSel || partial.showRelationships !== undefined) {
      this.rebuildRelationshipOverlay();
    }

    if (partial.transformMode !== prevTransformMode || partial.selectedComponentId !== prevSel) {
      this.syncTransformGizmo();
    }

    if (partial.renderQualityMode !== undefined && partial.renderQualityMode !== prevQuality) {
      this.pathTracerSceneSynced = false;
      this.notifyPathTracerStatus(true);
    }

    if (!prevPlaying && this.state.playing) {
      this.lastTickMs = performance.now();
      this.startLoop();
    } else if (!this.state.playing) {
      this.stepSimulation(0);
      this.requestRender();
    }
  }

  private syncTransformGizmo(): void {
    if (this.state.transformMode === 'none' || !this.state.selectedComponentId) {
      this.transformControls.detach();
      return;
    }
    const obj = this.componentObjects.get(this.state.selectedComponentId);
    if (obj) {
      this.transformControls.setMode(this.state.transformMode);
      this.transformControls.attach(obj);
    } else {
      this.transformControls.detach();
    }
  }

  /** Heat haze whose source sits inside a casing; it is shown only while the inside is on show. */
  private sealedHeatEffectIds = new Set<string>();

  private findSealedHeatEffects(project: DecoderProject): void {
    this.sealedHeatEffectIds = new Set();
    const shells: THREE.Box3[] = [];
    for (const comp of project.components) {
      if (comp.layer !== 'casing' && comp.layer !== 'exterior') continue;
      const obj = this.componentObjects.get(comp.id);
      if (obj) shells.push(new THREE.Box3().setFromObject(obj));
    }
    for (const effect of project.effects) {
      if (effect.type !== 'heat_gradient' && effect.type !== 'thermal_diffusion') continue;
      const origin = effect.path?.[0];
      if (origin && shells.some((box) => box.containsPoint(new THREE.Vector3(...origin)))) {
        this.sealedHeatEffectIds.add(effect.id);
      }
    }
  }

  /** Heat haze only reads as heat when the inside of the model is on show. */
  private showsInterior(): boolean {
    const mode = this.state.examinationMode;
    return (
      this.state.section.enabled ||
      ['cutaway', 'xray', 'transparent', 'thermal', 'cross_section', 'wireframe'].includes(mode)
    );
  }

  private rebuildRelationshipOverlay(): void {
    for (const child of this.relationshipGroup.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    }
    this.relationshipGroup.clear();
    const show = this.state.showRelationships || this.state.examinationMode === 'relationship_trace';
    this.relationshipGroup.visible = show;
    if (!show) return;

    const trace = this.state.selectedComponentId
      ? traceComponentRelationships(this.project, this.state.selectedComponentId)
      : null;

    const worldMap = new Map<string, THREE.Vector3>();
    this.modelRoot.updateMatrixWorld(true);
    for (const [id, obj] of this.componentObjects.entries()) {
      const v = new THREE.Vector3();
      obj.getWorldPosition(v);
      worldMap.set(id, v);
    }

    const loopIds = findLoopRelationshipIds(this.project.relationships);
    for (const rel of this.project.relationships) {
      const p1 = worldMap.get(rel.sourceId);
      const p2 = worldMap.get(rel.targetId);
      if (!p1 || !p2) continue;

      const highlighted = !trace || trace.highlightedRelationshipIds.has(rel.id);
      const pts = [p1, ...(rel.waypoints ?? []).map((w) => new THREE.Vector3(...w)), p2];
      if (pts.length === 2) {
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        mid.y += 0.25;
        pts.splice(1, 0, mid);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const style = RELATIONSHIP_LINE[rel.type] ?? 'solid';
      // Flows are neutral grey and told apart by line style; links in a feedback loop are pink.
      const color = loopIds.has(rel.id) ? FLOW_LOOP_COLOUR : FLOW_COLOUR;
      const baseOpacity = style === 'faint' ? 0.5 : 0.85;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: highlighted ? baseOpacity : 0.14,
        depthWrite: false,
      });
      for (const geo of flowLineGeometries(curve, style, highlighted ? 0.014 : 0.007)) {
        this.relationshipGroup.add(new THREE.Mesh(geo, mat));
      }
    }
  }

  private applyExaminationMaterials(): void {
    const mode = this.state.examinationMode;
    const selId = this.state.selectedComponentId;
    const matSpecMap = new Map(this.project.materials.map((m) => [m.id, m]));
    const trace = selId && mode === 'relationship_trace' ? traceComponentRelationships(this.project, selId) : null;

    for (const comp of this.project.components) {
      const obj = this.componentObjects.get(comp.id);
      const mat = this.componentMaterials.get(comp.id);
      if (!obj || !mat) continue;

      const origSpec = comp.materialId ? matSpecMap.get(comp.materialId) : undefined;
      const baseMat = this.matLib.getMaterial(origSpec);

      mat.color.copy(baseMat.color);
      mat.roughness = baseMat.roughness;
      mat.metalness = baseMat.metalness;
      mat.wireframe = false;
      mat.transparent = baseMat.transparent;
      mat.opacity = baseMat.opacity;
      mat.depthWrite = baseMat.depthWrite;
      mat.emissive.copy(baseMat.emissive);
      mat.emissiveIntensity = baseMat.emissiveIntensity;

      let visible = comp.visible !== false && !this.state.hiddenComponentIds.includes(comp.id);

      if (this.state.isolatedLayer && comp.layer !== this.state.isolatedLayer) {
        visible = false;
      }

      if (mode === 'cutaway' && (comp.layer === 'casing' || comp.layer === 'exterior')) {
        mat.transparent = true;
        mat.opacity = 0.16;
        mat.depthWrite = false;
      } else if (mode === 'xray') {
        mat.transparent = true;
        mat.opacity = comp.layer === 'core' || comp.layer === 'internal' ? 0.74 : 0.18;
        mat.depthWrite = false;
        mat.emissive.set('#6f7d8c');
        mat.emissiveIntensity = 0.18;
      } else if (mode === 'transparent') {
        mat.transparent = true;
        mat.opacity = 0.35;
        mat.depthWrite = false;
      } else if (mode === 'wireframe') {
        mat.wireframe = true;
      } else if (mode === 'isolated' && selId) {
        if (comp.id !== selId && comp.parentId !== selId) {
          mat.transparent = true;
          mat.opacity = 0.1;
          mat.depthWrite = false;
        }
      } else if (mode === 'layered' && comp.layer === 'casing') {
        visible = false;
      } else if (mode === 'thermal') {
        const tint =
          origSpec?.thermalTint ??
          (comp.layer === 'core' ? '#ef4444' : comp.layer === 'internal' ? '#f59e0b' : '#3b82f6');
        mat.color.set(tint);
        mat.roughness = 0.5;
        mat.metalness = 0.1;
      } else if (mode === 'material') {
        mat.wireframe = false;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      } else if (mode === 'relationship_trace' && trace) {
        const isRelated = comp.id === selId || trace.upstreamIds.has(comp.id) || trace.downstreamIds.has(comp.id);
        if (!isRelated) {
          mat.transparent = true;
          mat.opacity = 0.14;
          mat.depthWrite = false;
        }
      }

      if (comp.id === selId || this.state.highlightedComponentIds.includes(comp.id)) {
        // Selection is a thin pink outline plus a faint neutral lift, so the material keeps its colour.
        // Selection is a thin pink outline (drawn by the outline pass) and a faint lift that keeps the
        // material's own colour. Without post-processing, a low pink glow stands in for the outline.
        if (mat.emissiveIntensity < 0.06) {
          const outlined = Boolean(this.outlinePass) && !this.isSoftwareGl;
          mat.emissive.set(outlined ? '#ffffff' : '#ff4f9a');
          mat.emissiveIntensity = outlined ? 0.03 : 0.06;
        }
      }

      obj.visible = visible;
    }
    this.updateSelectionOutline();
  }

  /** Feeds the selected and highlighted parts to the outline pass. */
  private updateSelectionOutline(): void {
    if (!this.outlinePass) return;
    const selId = this.state.selectedComponentId;
    const ids = new Set([...(selId ? [selId] : []), ...this.state.highlightedComponentIds]);
    const meshes: THREE.Object3D[] = [];
    for (const id of ids) {
      const obj = this.componentObjects.get(id);
      if (!obj) continue;
      const collect = (node: THREE.Object3D) => {
        if ((node as THREE.Mesh).isMesh) meshes.push(node);
        for (const child of node.children) {
          const childId = child.userData.componentId as string | undefined;
          if (childId && childId !== id) continue;
          collect(child);
        }
      };
      collect(obj);
    }
    this.outlinePass.selectedObjects = meshes;
  }

  private applySectionPlane(): void {
    const sec = this.state.section;
    const active = sec.enabled || this.state.examinationMode === 'cross_section';
    this.renderer.localClippingEnabled = active;
    this.sectionHelperMesh.visible = active;

    if (!active) {
      this.clipPlane.constant = 999;
      return;
    }

    const dir = sec.invert ? -1 : 1;
    if (sec.axis === 'x') {
      this.clipPlane.normal.set(-dir, 0, 0);
      this.sectionHelperMesh.rotation.set(0, Math.PI / 2, 0);
      this.sectionHelperMesh.position.set(sec.position * 2, 0.5, 0);
    } else if (sec.axis === 'y') {
      this.clipPlane.normal.set(0, -dir, 0);
      this.sectionHelperMesh.rotation.set(Math.PI / 2, 0, 0);
      this.sectionHelperMesh.position.set(0, sec.position * 2 + 0.5, 0);
    } else {
      this.clipPlane.normal.set(0, 0, -dir);
      this.sectionHelperMesh.rotation.set(0, 0, 0);
      this.sectionHelperMesh.position.set(0, 0.5, sec.position * 2);
    }
    this.clipPlane.constant = sec.position * 2 * dir;
  }

  public stepSimulation(dt: number): EvaluatedSimulationState {
    if (this.state.playing && dt > 0) {
      this.state.time += dt * this.state.playbackSpeed;
    }

    let simState: EvaluatedSimulationState;
    try {
      simState = this.runtime.evaluate(this.state.time, this.paramValues);
      this.lastGoodSimulation = simState;
    } catch (error) {
      this.state.playing = false;
      this.callbacks.onSimulationError?.(error instanceof Error ? error.message : String(error));
      if (this.lastGoodSimulation) return this.lastGoodSimulation;
      throw error;
    }

    const targetExp =
      this.state.examinationMode === 'exploded' ? Math.max(0.45, this.state.explosion) : this.state.explosion;
    this.currentExplosion = this.isSoftwareGl
      ? targetExp
      : THREE.MathUtils.damp(this.currentExplosion, targetExp, 7, Math.max(0.016, dt));

    for (const comp of this.project.components) {
      const obj = this.componentObjects.get(comp.id);
      const base = this.baseTransforms.get(comp.id);
      if (!obj || !base) continue;

      const beh = simState.transforms[comp.id];
      const expOffset = computeHierarchicalExplosionOffset(comp, this.currentExplosion, this.explosionPlan);

      obj.position.set(
        base.pos[0] + (beh?.position_x ?? 0) + expOffset[0],
        base.pos[1] + (beh?.position_y ?? 0) + expOffset[1],
        base.pos[2] + (beh?.position_z ?? 0) + expOffset[2],
      );
      obj.rotation.set(
        base.rot[0] + (beh?.rotation_x ?? 0),
        base.rot[1] + (beh?.rotation_y ?? 0),
        base.rot[2] + (beh?.rotation_z ?? 0),
      );
      const su = beh?.scale_uniform ?? 1;
      obj.scale.set(
        base.scale[0] * (beh?.scale_x ?? 1) * su,
        base.scale[1] * (beh?.scale_y ?? 1) * su,
        base.scale[2] * (beh?.scale_z ?? 1) * su,
      );

      if (beh?.visible !== undefined) {
        obj.visible = beh.visible !== 0 && !this.state.hiddenComponentIds.includes(comp.id);
      }

      const mat = this.componentMaterials.get(comp.id);
      if (mat) {
        if (beh?.emissive_intensity !== undefined) {
          mat.emissiveIntensity = beh.emissive_intensity;
        }
        if (beh?.color_temperature !== undefined) {
          const heat = Math.max(0, Math.min(1, beh.color_temperature));
          mat.emissive.setRGB(heat * 0.9, heat * 0.25, (1 - heat) * 0.05);
          mat.emissiveIntensity = Math.max(mat.emissiveIntensity, heat * 0.75);
        }
        if (beh?.opacity !== undefined) {
          mat.transparent = beh.opacity < 0.99;
          mat.opacity = beh.opacity;
        }
      }
    }

    this.refitForExplosion();
    this.applySectionPlane();
    this.effectsManager.update(
      this.state.time,
      simState,
      this.state.showEffects,
      this.camera.quaternion,
      this.showsInterior() ? undefined : this.sealedHeatEffectIds,
    );

    // Update DOF focal distance dynamically when enabled
    if (this.bokehPass && this.bokehPass.enabled) {
      let focusDist = this.camera.position.distanceTo(this.controls.target);
      if (this.state.selectedComponentId) {
        const selObj = this.componentObjects.get(this.state.selectedComponentId);
        if (selObj) {
          selObj.getWorldPosition(_tmpCenter);
          focusDist = this.camera.position.distanceTo(_tmpCenter);
        }
      }
      (this.bokehPass.uniforms as Record<string, THREE.IUniform>)['focus'].value = Math.max(0.2, focusDist);
    }

    // Camera tween damping
    if (this.cameraTweenTarget) {
      const alpha = 1 - Math.exp(-6 * Math.max(0.016, dt));
      _dampPos.copy(this.camera.position).lerp(this.cameraTweenTarget.pos, alpha);
      _dampTarget.copy(this.controls.target).lerp(this.cameraTweenTarget.target, alpha);
      this.camera.position.copy(_dampPos);
      this.controls.target.copy(_dampTarget);
      if (this.camera === this.perspCamera) {
        this.perspCamera.fov = THREE.MathUtils.lerp(this.perspCamera.fov, this.cameraTweenTarget.fov, alpha);
        this.perspCamera.updateProjectionMatrix();
      } else {
        const aspect = this.frameAspect();
        this.syncOrthoFrustum(aspect);
      }
      if (
        this.camera.position.distanceTo(this.cameraTweenTarget.pos) < 0.015 &&
        this.controls.target.distanceTo(this.cameraTweenTarget.target) < 0.015
      ) {
        this.cameraTweenTarget = null;
        if (this.shouldUsePathTracer()) this.pathTracer.updateCamera();
      }
    }

    const now = performance.now();
    if (now - this.lastHudNotifyMs >= 95 || !this.state.playing) {
      this.lastHudNotifyMs = now;
      this.callbacks.onSimUpdate?.(simState);
    }

    return simState;
  }

  private notifyPathTracerStatus(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastPtNotifyMs < 140) return;
    this.lastPtNotifyMs = now;
    this.callbacks.onPathTracerStatus?.(this.pathTracer.getStatus(this.shouldUsePathTracer()));
  }

  private renderFrame(): void {
    if (this.shouldUsePathTracer()) {
      // Swap equirectangular HDR texture for WebGLPathTracer sampling
      if (this.hdrEquirectTex && this.scene.environment !== this.hdrEquirectTex) {
        this.scene.environment = this.hdrEquirectTex;
      }
      if (!this.pathTracerSceneSynced) {
        this.effectsManager.root.visible = false;
        this.gridHelper.visible = false;
        const ok = this.pathTracer.syncScene(this.scene, this.camera);
        this.gridHelper.visible = true;
        this.effectsManager.root.visible = this.state.showEffects;
        this.pathTracerSceneSynced = ok;
      }
      if (this.pathTracerSceneSynced) {
        this.pathTracer.renderSample();
        this.notifyPathTracerStatus();
        return;
      }
    }

    // Restore PMREM environment for rasterization + EffectComposer
    if (this.pmremEnvTex && this.scene.environment !== this.pmremEnvTex) {
      this.scene.environment = this.pmremEnvTex;
    }

    if (this.composer && !this.isSoftwareGl && this.state.transformMode === 'none') {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.notifyPathTracerStatus();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public requestRender(): void {
    if (this.disposed || this.state.playing) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;
      this.controls.update();
      this.renderFrame();
      const done = () => {
        this.renderBusy = false;
        const ptNeedsMoreSamples =
          this.shouldUsePathTracer() && this.pathTracer.getStatus(true).samples < this.pathTracer.targetSamples;
        if (this.renderDirty || this.cameraTweenTarget || ptNeedsMoreSamples) {
          if (this.cameraTweenTarget) this.stepSimulation(0.016);
          this.requestRender();
        }
      };
      if (this.isSoftwareGl) this.afterDraw(done);
      else done();
    });
  }

  private startLoop(): void {
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    // Cancelling may drop an on-demand render before its completion callback runs; release it so
    // requestRender() is not locked out for good.
    this.renderBusy = false;

    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTickMs) / 1000));
      this.lastTickMs = now;

      if (this.state.playing) {
        this.stepSimulation(dt);
      }
      this.controls.update();
      this.renderFrame();

      if (this.state.playing) {
        if (this.isSoftwareGl) {
          this.afterDraw(tick);
        } else {
          this.frameId = requestAnimationFrame(tick);
        }
      }
    };

    if (this.state.playing) {
      if (this.isSoftwareGl) this.afterDraw(tick);
      else this.frameId = requestAnimationFrame(tick);
    } else {
      this.requestRender();
    }
  }

  public setTime(t: number): void {
    this.runtime.reset();
    this.state.time = Math.max(0, t);
    this.pathTracerSceneSynced = false;
    this.stepSimulation(0);
    this.requestRender();
  }

  public capturePngDataUrl(): string {
    this.renderFrame();
    return this.renderer.domElement.toDataURL('image/png');
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('webglcontextlost', this.onWebglContextLost);
    dom.removeEventListener('webglcontextrestored', this.onWebglContextRestored);
    window.removeEventListener('resize', this.onResize);

    this.outlinePass?.dispose();
    this.pathTracer.dispose();
    this.composer?.dispose();
    this.transformControls.dispose();
    this.controls.dispose();
    this.effectsManager.dispose();
    this.matLib.dispose();
    this.kernel.dispose();
    this.hdrEquirectTex?.dispose();
    this.pmremEnvTex?.dispose();
    this.shadowTex?.dispose();
    this.shadowDisc.geometry.dispose();
    (this.shadowDisc.material as THREE.Material).dispose();
    for (const m of this.componentMaterials.values()) m.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
