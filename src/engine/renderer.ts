import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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
const _wPosA = new THREE.Vector3();
const _wPosB = new THREE.Vector3();
const _wDir = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);

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
 * High-contrast horological / industrial studio HDRI (512x256 Float32).
 * Uses deliberate dark negative-fill bands between bright softbox strips so watch crystals,
 * brushed steel, and warm brass catch sharp, unmistakable reflections even on a phone screen,
 * and works identically under both hardware WebGL2 and software SwiftShader PMREM.
 */
function createStudioHdrEquirectTexture(): THREE.DataTexture {
  const width = 512;
  const height = 256;
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const theta = (1 - v) * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const phi = u * Math.PI * 2;
      const dx = sinT * Math.cos(phi);
      const dy = cosT;
      const dz = sinT * Math.sin(phi);

      // Deep negative-fill studio surround so metals & watch crystals reflect high-contrast dark contours
      const horizonGlow = Math.pow(Math.max(0, 1.0 - Math.abs(dy)), 7.0) * 0.028;
      const groundBounce = Math.max(0, -dy) * 0.014;
      let r = 0.005 + horizonGlow + groundBounce;
      let g = 0.006 + horizonGlow * 1.05 + groundBounce;
      let b = 0.009 + horizonGlow * 1.18 + groundBounce * 1.1;

      // 1. Sharp overhead horological softbox with dark centre bar (classic watchmaker dial reflection!)
      if (dy > 0.18) {
        const projX = dx / (dy + 0.32);
        const projZ = dz / (dy + 0.32);
        const boxX = 1 - THREE.MathUtils.smoothstep(Math.abs(projX), 0.34, 0.42);
        const boxZ = 1 - THREE.MathUtils.smoothstep(Math.abs(projZ), 0.2, 0.27);
        // Subtle twin-tube louver split gives crisp double specular lines across curved glass & bezels
        const louverSplit = 0.35 + 0.65 * THREE.MathUtils.smoothstep(Math.abs(projZ), 0.015, 0.055);
        const overhead = boxX * boxZ * louverSplit * THREE.MathUtils.smoothstep(dy, 0.22, 0.68);
        r += overhead * 6.4;
        g += overhead * 6.25;
        b += overhead * 6.0;
      }

      // 2. Key 45-degree warm-daylight strobe softbox (enhances golden brass & copper warmth)
      const keyDot = dx * 0.6 + dy * 0.5 + dz * 0.62;
      const keyPanel = THREE.MathUtils.smoothstep(keyDot, 0.875, 0.945);
      r += keyPanel * 8.2;
      g += keyPanel * 7.6;
      b += keyPanel * 6.8;

      // 3. Crisp ice-blue vertical rim strip-box (separates cool steel & glass bevels at thumbnail scale)
      const rimDot = -dx * 0.58 + dy * 0.26 - dz * 0.77;
      const rimVertical = 1 - THREE.MathUtils.smoothstep(Math.abs(dy - 0.22), 0.36, 0.52);
      const rimStrip = THREE.MathUtils.smoothstep(rimDot, 0.9, 0.965) * rimVertical;
      r += rimStrip * 9.2;
      g += rimStrip * 10.6;
      b += rimStrip * 12.8;

      // 4. Secondary diagonal crystal glint strip (catches watch crystal dome & boiler glass)
      const crystalDot = -dx * 0.42 + dy * 0.68 + dz * 0.6;
      const crystalStrip = THREE.MathUtils.smoothstep(crystalDot, 0.935, 0.978);
      r += crystalStrip * 7.5;
      g += crystalStrip * 8.0;
      b += crystalStrip * 8.8;

      // 5. Restrained cool fill bounce card (front-left)
      const fillDot = -dx * 0.78 + dy * 0.24 + dz * 0.58;
      const fillCard = THREE.MathUtils.smoothstep(fillDot, 0.82, 0.92);
      r += fillCard * 0.75;
      g += fillCard * 0.88;
      b += fillCard * 1.05;

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

class PartOutlinePass extends OutlinePass {
  _updateSelectionCache(): void {
    const cache = (this as unknown as { _selectionCache: Set<THREE.Object3D> })._selectionCache;
    cache.clear();
    for (const obj of this.selectedObjects) cache.add(obj);
  }
}

const FLOW_COLOUR = 0xc9cdd3;
const FLOW_LOOP_COLOUR = 0xff4f9a;

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

function createMachinedSectionCapMaterial(clipPlane: THREE.Plane): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#9aa3b0'),
    roughness: 0.34,
    metalness: 0.86,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
    side: THREE.DoubleSide,
  });

  if (typeof document !== 'undefined') {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#d8dce2';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#9aa2ae';
      ctx.lineWidth = 1.2;
      for (let i = -size; i < size * 2; i += 6) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(10, 10);
      mat.roughnessMap = tex;
      mat.bumpMap = tex;
      mat.bumpScale = 0.004;
    }
  }

  mat.clippingPlanes = [];
  void clipPlane;
  return mat;
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
  private gtaoPass: GTAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private bokehPass: BokehPass | null = null;
  private outlinePass: PartOutlinePass | null = null;
  private outputPass: OutputPass | null = null;

  private hdrEquirectTex: THREE.DataTexture | null = null;
  private pmremEnvTex: THREE.Texture | null = null;

  private modelRoot = new THREE.Group();
  private explosionGuidesGroup = new THREE.Group();
  private stencilCapGroup = new THREE.Group();
  private relationshipGroup = new THREE.Group();
  private sectionHelperMesh: THREE.Mesh;
  private sectionCapMesh: THREE.Mesh;
  private gridHelper: THREE.GridHelper;
  private shadowDisc: THREE.Mesh;
  private ptFloorCatcher: THREE.Mesh;

  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private rectLightTop: THREE.RectAreaLight | null = null;
  private rectLightSide: THREE.RectAreaLight | null = null;
  private clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  private shadowTex: THREE.CanvasTexture | null = null;

  private contactShadowCam: THREE.OrthographicCamera | null = null;
  private contactShadowRT: THREE.WebGLRenderTarget | null = null;
  private contactShadowBlurRT: THREE.WebGLRenderTarget | null = null;
  private contactShadowDepthMat: THREE.ShaderMaterial | null = null;
  private contactShadowHBlurMat: THREE.ShaderMaterial | null = null;
  private contactShadowVBlurMat: THREE.ShaderMaterial | null = null;
  private contactShadowBlurQuad: THREE.Mesh | null = null;
  private contactShadowBlurScene: THREE.Scene | null = null;
  private contactShadowBlurCam: THREE.OrthographicCamera | null = null;
  private lastContactShadowExplosion = -1;
  private contactShadowFrameTick = 0;

  private componentObjects = new Map<string, THREE.Object3D>();
  private baseTransforms = new Map<string, { pos: Vec3; rot: Vec3; scale: Vec3 }>();
  private componentMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
  // De-cluttered, phone-readable 3D tubular explosion guide rods + seated anchor rings
  private explosionGuideItems = new Map<string, { rod: THREE.Mesh; originRing: THREE.Mesh; partCollar: THREE.Mesh }>();
  // Per-component extra clearance nudge so stacked exploded parts never overlap along the same axis
  private explosionExtraClearance = new Map<string, Vec3>();
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
  private explosionVelocity = 0;
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
      stencil: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    // Enable crisp shadows on hardware, and keep studio HDRI reflections on BOTH hardware & software GL!
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    try {
      this.hdrEquirectTex = createStudioHdrEquirectTexture();
      pmrem.compileEquirectangularShader();
      this.pmremEnvTex = pmrem.fromEquirectangular(this.hdrEquirectTex).texture;
    } catch {
      this.hdrEquirectTex?.dispose();
      this.hdrEquirectTex = null;
      const room = new RoomEnvironment();
      try {
        this.pmremEnvTex = pmrem.fromScene(room, 0.04).texture;
      } finally {
        room.dispose();
      }
    } finally {
      pmrem.dispose();
    }
    this.scene.environment = this.pmremEnvTex;
    this.scene.environmentIntensity = 1.22;

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

    // High-contrast warm-key / cool-rim studio lighting (makes warm brass vs cool steel unmistakable at phone scale)
    this.hemiLight = new THREE.HemisphereLight('#b8d4ff', '#090b10', 0.18);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight('#fff2df', 2.15);
    this.keyLight.position.set(5.5, 8.5, 6.5);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(this.isSoftwareGl ? 512 : 2048, this.isSoftwareGl ? 512 : 2048);
    const d = 3.6;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 26;
    this.keyLight.shadow.bias = -0.00025;
    this.keyLight.shadow.normalBias = 0.012;
    this.keyLight.shadow.radius = 2.2;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight('#7dd3fc', 1.35);
    this.rimLight.position.set(-5.8, 4.8, -6.5);
    this.scene.add(this.rimLight);

    this.fillLight = new THREE.DirectionalLight('#dbeafe', 0.18);
    this.fillLight.position.set(-5, 2.5, 5);
    this.scene.add(this.fillLight);

    if (!this.isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      this.rectLightTop = new THREE.RectAreaLight('#ffffff', 1.25, 4.2, 2.4);
      this.rectLightTop.position.set(0, 5.8, 2.8);
      this.rectLightTop.lookAt(0, 0.4, 0);
      this.scene.add(this.rectLightTop);

      this.rectLightSide = new THREE.RectAreaLight('#bae6fd', 0.72, 2.8, 3.6);
      this.rectLightSide.position.set(-4.8, 2.8, 3.8);
      this.rectLightSide.lookAt(0, 0.4, 0);
      this.scene.add(this.rectLightSide);
    }

    this.gridHelper = new THREE.GridHelper(18, 24, '#2a3241', '#1f2531');
    this.gridHelper.position.y = -0.02;
    this.scene.add(this.gridHelper);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(128, 128, 6, 128, 128, 124);
      grad.addColorStop(0, 'rgba(0,0,0,0.72)');
      grad.addColorStop(0.42, 'rgba(0,0,0,0.34)');
      grad.addColorStop(0.75, 'rgba(0,0,0,0.08)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 256, 256);
    }
    this.shadowTex = new THREE.CanvasTexture(shadowCanvas);

    if (!this.isSoftwareGl) {
      this.initContactShadows();
    }

    const shadowGeo = new THREE.PlaneGeometry(6.8, 6.8);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.contactShadowRT ? this.contactShadowRT.texture : this.shadowTex,
      transparent: true,
      opacity: this.contactShadowRT ? 0.9 : 1.0,
      depthWrite: false,
    });
    this.shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowDisc.position.y = -0.015;
    this.scene.add(this.shadowDisc);

    const ptFloorGeo = new THREE.CircleGeometry(18, 64);
    ptFloorGeo.rotateX(-Math.PI / 2);
    const ptFloorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#12151c'),
      roughness: 0.82,
      metalness: 0.04,
    });
    this.ptFloorCatcher = new THREE.Mesh(ptFloorGeo, ptFloorMat);
    this.ptFloorCatcher.position.y = -0.018;
    this.ptFloorCatcher.visible = false;
    this.scene.add(this.ptFloorCatcher);

    const secGeo = new THREE.PlaneGeometry(5.5, 5.5);
    const secMat = new THREE.MeshBasicMaterial({
      color: 0xf5f5f5,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.sectionHelperMesh = new THREE.Mesh(secGeo, secMat);
    this.sectionHelperMesh.visible = false;
    this.scene.add(this.sectionHelperMesh);

    const capPlaneGeo = new THREE.PlaneGeometry(14, 14);
    const capMat = createMachinedSectionCapMaterial(this.clipPlane);
    this.sectionCapMesh = new THREE.Mesh(capPlaneGeo, capMat);
    this.sectionCapMesh.renderOrder = 2;
    this.sectionCapMesh.visible = false;
    this.scene.add(this.sectionCapMesh);

    this.explosionGuidesGroup.name = '__explosion_axis_guides__';
    this.stencilCapGroup.name = '__stencil_caps__';

    this.scene.add(this.modelRoot);
    this.scene.add(this.stencilCapGroup);
    this.scene.add(this.explosionGuidesGroup);
    this.scene.add(this.effectsManager.root);
    this.scene.add(this.relationshipGroup);

    if (!this.isSoftwareGl) {
      try {
        const pixelRatio = this.renderer.getPixelRatio();
        const hdrRenderTarget = new THREE.WebGLRenderTarget(
          Math.max(1, Math.floor(w * pixelRatio)),
          Math.max(1, Math.floor(h * pixelRatio)),
          {
            type: THREE.HalfFloatType,
            samples: 4,
            colorSpace: THREE.LinearSRGBColorSpace,
            stencilBuffer: true,
            depthBuffer: true,
          },
        );

        this.composer = new EffectComposer(this.renderer, hdrRenderTarget);
        this.composer.setPixelRatio(pixelRatio);
        this.composer.setSize(w, h);

        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        this.gtaoPass = new GTAOPass(this.scene, this.camera, w, h);
        this.gtaoPass.output = GTAOPass.OUTPUT.Default;
        this.gtaoPass.updateGtaoMaterial({
          radius: 0.26,
          distanceExponent: 1.6,
          thickness: 0.9,
          scale: 1.18,
          samples: 16,
          distanceFallOff: 1.0,
          screenSpaceRadius: false,
        });
        this.gtaoPass.blendIntensity = 0.88;
        this.composer.addPass(this.gtaoPass);

        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.36, 1.05);
        this.composer.addPass(this.bloomPass);

        this.bokehPass = new BokehPass(this.scene, this.perspCamera, {
          focus: 4.5,
          aperture: 0.00016,
          maxblur: 0.006,
        });
        this.bokehPass.enabled = false;
        this.composer.addPass(this.bokehPass);

        this.outlinePass = new PartOutlinePass(new THREE.Vector2(w, h), this.scene, this.camera);
        this.outlinePass.visibleEdgeColor.set('#ff4f9a');
        this.outlinePass.hiddenEdgeColor.set('#5c2a40');
        this.outlinePass.edgeStrength = 3.5;
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

  private initContactShadows(): void {
    const res = 256;
    this.contactShadowRT = new THREE.WebGLRenderTarget(res, res, {
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.contactShadowBlurRT = new THREE.WebGLRenderTarget(res, res, {
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });

    this.contactShadowCam = new THREE.OrthographicCamera(-3.4, 3.4, 3.4, -3.4, 0.01, 7.5);
    this.contactShadowCam.rotation.x = Math.PI / 2;

    this.contactShadowDepthMat = new THREE.ShaderMaterial({
      uniforms: {
        darkness: { value: 0.85 },
        maxHeight: { value: 4.8 },
      },
      vertexShader: `
        varying float vHeight;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vHeight = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float darkness;
        uniform float maxHeight;
        varying float vHeight;
        void main() {
          float falloff = clamp(1.0 - vHeight / maxHeight, 0.0, 1.0);
          float alpha = pow(falloff, 1.85) * darkness;
          gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: true,
    });

    const blurVert = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const makeBlurFrag = (horiz: boolean) => `
      uniform sampler2D tDiffuse;
      uniform float blurStep;
      varying vec2 vUv;
      void main() {
        vec4 sum = vec4(0.0);
        vec2 dir = ${horiz ? 'vec2(blurStep, 0.0)' : 'vec2(0.0, blurStep)'};
        sum += texture2D(tDiffuse, vUv - 4.0 * dir) * 0.051;
        sum += texture2D(tDiffuse, vUv - 3.0 * dir) * 0.0918;
        sum += texture2D(tDiffuse, vUv - 2.0 * dir) * 0.12245;
        sum += texture2D(tDiffuse, vUv - 1.0 * dir) * 0.1531;
        sum += texture2D(tDiffuse, vUv) * 0.1633;
        sum += texture2D(tDiffuse, vUv + 1.0 * dir) * 0.1531;
        sum += texture2D(tDiffuse, vUv + 2.0 * dir) * 0.12245;
        sum += texture2D(tDiffuse, vUv + 3.0 * dir) * 0.0918;
        sum += texture2D(tDiffuse, vUv + 4.0 * dir) * 0.051;
        vec2 edge = smoothstep(vec2(0.0), vec2(0.14), vUv) * (1.0 - smoothstep(vec2(0.86), vec2(1.0), vUv));
        gl_FragColor = vec4(0.0, 0.0, 0.0, sum.a * edge.x * edge.y);
      }
    `;

    this.contactShadowHBlurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, blurStep: { value: 1.5 / res } },
      vertexShader: blurVert,
      fragmentShader: makeBlurFrag(true),
      depthTest: false,
      depthWrite: false,
    });
    this.contactShadowVBlurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, blurStep: { value: 1.5 / res } },
      vertexShader: blurVert,
      fragmentShader: makeBlurFrag(false),
      depthTest: false,
      depthWrite: false,
    });

    this.contactShadowBlurScene = new THREE.Scene();
    this.contactShadowBlurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.contactShadowBlurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.contactShadowHBlurMat);
    this.contactShadowBlurScene.add(this.contactShadowBlurQuad);
  }

  private renderContactShadow(): void {
    if (
      this.isSoftwareGl ||
      !this.contactShadowRT ||
      !this.contactShadowBlurRT ||
      !this.contactShadowCam ||
      !this.contactShadowDepthMat ||
      !this.contactShadowHBlurMat ||
      !this.contactShadowVBlurMat ||
      !this.contactShadowBlurScene ||
      !this.contactShadowBlurCam ||
      !this.contactShadowBlurQuad
    ) {
      return;
    }

    this.contactShadowFrameTick++;
    if (
      this.state.playing &&
      Math.abs(this.currentExplosion - this.lastContactShadowExplosion) < 0.003 &&
      this.contactShadowFrameTick % 2 !== 0
    ) {
      return;
    }
    this.lastContactShadowExplosion = this.currentExplosion;

    const prevBg = this.scene.background;
    const prevEnv = this.scene.environment;
    const prevFog = this.scene.fog;
    const prevOverride = this.scene.overrideMaterial;
    const prevClearAlpha = this.renderer.getClearAlpha();
    const prevClearColor = this.renderer.getClearColor(new THREE.Color());
    const prevShadowEnabled = this.renderer.shadowMap.enabled;
    const prevClip = this.renderer.localClippingEnabled;

    const prevGridVis = this.gridHelper.visible;
    const prevShadowVis = this.shadowDisc.visible;
    const prevEffectsVis = this.effectsManager.root.visible;
    const prevGuidesVis = this.explosionGuidesGroup.visible;
    const prevRelVis = this.relationshipGroup.visible;
    const prevSecVis = this.sectionHelperMesh.visible;
    const prevCapVis = this.sectionCapMesh.visible;
    const prevStencilVis = this.stencilCapGroup.visible;
    const prevGizmoVis = this.transformControls.getHelper().visible;

    this.scene.background = null;
    this.scene.environment = null;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.contactShadowDepthMat;
    this.renderer.shadowMap.enabled = false;
    this.renderer.localClippingEnabled = false;

    this.gridHelper.visible = false;
    this.shadowDisc.visible = false;
    this.effectsManager.root.visible = false;
    this.explosionGuidesGroup.visible = false;
    this.relationshipGroup.visible = false;
    this.sectionHelperMesh.visible = false;
    this.sectionCapMesh.visible = false;
    this.stencilCapGroup.visible = false;
    this.transformControls.getHelper().visible = false;

    const blurScale = (1.35 + this.currentExplosion * 1.15) / 256;
    this.contactShadowHBlurMat.uniforms['blurStep'].value = blurScale;
    this.contactShadowVBlurMat.uniforms['blurStep'].value = blurScale;

    const prevRT = this.renderer.getRenderTarget();
    this.renderer.setClearColor(0x000000, 0);

    this.renderer.setRenderTarget(this.contactShadowRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.contactShadowCam);

    this.contactShadowBlurQuad.material = this.contactShadowHBlurMat;
    this.contactShadowHBlurMat.uniforms['tDiffuse'].value = this.contactShadowRT.texture;
    this.renderer.setRenderTarget(this.contactShadowBlurRT);
    this.renderer.clear();
    this.renderer.render(this.contactShadowBlurScene, this.contactShadowBlurCam);

    this.contactShadowBlurQuad.material = this.contactShadowVBlurMat;
    this.contactShadowVBlurMat.uniforms['tDiffuse'].value = this.contactShadowBlurRT.texture;
    this.renderer.setRenderTarget(this.contactShadowRT);
    this.renderer.clear();
    this.renderer.render(this.contactShadowBlurScene, this.contactShadowBlurCam);

    this.renderer.setRenderTarget(prevRT);
    this.renderer.setClearColor(prevClearColor, prevClearAlpha);
    this.renderer.shadowMap.enabled = prevShadowEnabled;
    this.renderer.localClippingEnabled = prevClip;

    this.scene.overrideMaterial = prevOverride;
    this.scene.background = prevBg;
    this.scene.environment = prevEnv;
    this.scene.fog = prevFog;

    this.gridHelper.visible = prevGridVis;
    this.shadowDisc.visible = prevShadowVis;
    this.effectsManager.root.visible = prevEffectsVis;
    this.explosionGuidesGroup.visible = prevGuidesVis;
    this.relationshipGroup.visible = prevRelVis;
    this.sectionHelperMesh.visible = prevSecVis;
    this.sectionCapMesh.visible = prevCapVis;
    this.stencilCapGroup.visible = prevStencilVis;
    this.transformControls.getHelper().visible = prevGizmoVis;
  }

  private resizeObserver: ResizeObserver | null = null;
  private viewInsets = { left: 0, right: 0 };

  public setViewInset(inset: number | { left?: number; right?: number }): void {
    const raw = typeof inset === 'number' ? { left: 0, right: inset } : inset;
    const left = Math.max(0, Math.round(raw.left ?? 0));
    const right = Math.max(0, Math.round(raw.right ?? 0));
    if (left === this.viewInsets.left && right === this.viewInsets.right) return;
    this.viewInsets = { left, right };
    this.onResize();
  }

  private modelRadius = 0;
  private restReach = 0;
  private explodeZoom = 1;
  private lastFitExplosion = 0;

  private measureReach(): number {
    _tmpBox.setFromObject(this.modelRoot);
    if (_tmpBox.isEmpty() || !this.project) return 0;
    const target = new THREE.Vector3(...this.project.defaultCamera.target);
    const centre = _tmpBox.getCenter(new THREE.Vector3());
    return centre.distanceTo(target) + _tmpBox.getSize(_tmpSize).length() / 2;
  }

  private refitForExplosion(): void {
    if (Math.abs(this.currentExplosion - this.lastFitExplosion) < 0.002) return;
    this.lastFitExplosion = this.currentExplosion;
    const reach = this.currentExplosion > 0.002 ? this.measureReach() : this.restReach;
    const zoom = this.restReach > 0 && reach > 0 ? Math.min(1, this.restReach / reach) : 1;
    if (Math.abs(zoom - this.explodeZoom) < 0.002) return;
    this.explodeZoom = zoom;
    this.applyViewOffset(this.container.clientWidth || 800, Math.max(1, this.container.clientHeight || 600));
  }

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

  private frameAspect(): number {
    const w = this.container.clientWidth || 800;
    const h = Math.max(1, this.container.clientHeight || 600);
    return w / h;
  }

  private applyViewOffset(w: number, h: number): void {
    const { scale, centreX } = this.frameFit(w, h);
    const identity = scale > 0.999 && Math.abs(centreX - w / 2) < 0.5;
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
    this.bloomPass?.setSize(w, h);
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
    this.scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity * 0.72);
    this.keyLight.color.set(cfg.keyColor);
    this.keyLight.intensity = cfg.keyIntensity * 0.85;
    this.keyLight.position.set(...cfg.keyPosition);
    this.hemiLight.color.set(cfg.fillSkyColor);
    this.hemiLight.groundColor.set(cfg.fillGroundColor);
    this.hemiLight.intensity = cfg.isLightBackdrop ? cfg.fillIntensity * 0.62 : cfg.fillIntensity * 0.24;
    this.rimLight.color.set(cfg.rimColor);
    this.rimLight.intensity = cfg.rimIntensity * 0.95;
    this.renderer.toneMappingExposure = this.state.exposure || cfg.exposure;

    (this.ptFloorCatcher.material as THREE.MeshStandardMaterial).color.set(
      cfg.isLightBackdrop ? '#dce2ec' : cfg.background,
    );

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

  /**
   * Increases clearance between nearby parts that separate along a shared axis.
   */
  private computeExplosionClearanceMap(project: DecoderProject): void {
    this.explosionExtraClearance.clear();
    this.modelRoot.updateMatrixWorld(true);

    interface PartSlot {
      id: string;
      parentId?: string;
      worldCenter: THREE.Vector3;
      halfHeight: number;
      halfRadius: number;
      baseOffset: THREE.Vector3;
      axisKey: string;
      projCoord: number;
    }

    const slots: PartSlot[] = [];
    for (const comp of project.components) {
      if (!comp.geometry || comp.layer === 'fluid') continue;
      const obj = this.componentObjects.get(comp.id);
      if (!obj) continue;
      const rawOff = computeHierarchicalExplosionOffset(comp, 1, this.explosionPlan);
      const baseVec = new THREE.Vector3(...rawOff);
      const len = baseVec.length();
      if (len < 0.025) continue;

      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) continue;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      // Classify primary explosion axis ('y', 'x', 'z', or 'radial')
      const ax = Math.abs(baseVec.x);
      const ay = Math.abs(baseVec.y);
      const az = Math.abs(baseVec.z);
      let axisKey = 'radial';
      if (ay >= ax * 1.35 && ay >= az * 1.35) {
        axisKey = 'y';
      } else if (ax >= ay * 1.35 && ax >= az * 1.35) {
        axisKey = 'x';
      } else if (az >= ax * 1.35 && az >= ay * 1.35) {
        axisKey = 'z';
      }

      const fullTarget = center.clone().add(baseVec);
      const projCoord =
        axisKey === 'y' ? fullTarget.y : axisKey === 'x' ? fullTarget.x : axisKey === 'z' ? fullTarget.z : len;
      const halfSpan =
        axisKey === 'y'
          ? size.y * 0.5
          : axisKey === 'x'
            ? size.x * 0.5
            : axisKey === 'z'
              ? size.z * 0.5
              : size.length() * 0.28;

      slots.push({
        id: comp.id,
        parentId: comp.parentId ?? undefined,
        worldCenter: center,
        halfHeight: Math.max(0.03, halfSpan),
        halfRadius: Math.max(size.x, size.z) * 0.5,
        baseOffset: baseVec,
        axisKey,
        projCoord,
      });
    }

    // Resolve overlaps along major axial stacks (especially vertical Y stacks in engine, watch & processor)
    for (const axis of ['y', 'x', 'z'] as const) {
      const group = slots.filter((s) => s.axisKey === axis);
      if (group.length < 2) continue;

      // Sort from bottom/negative to top/positive along the axis
      group.sort((a, b) => a.projCoord - b.projCoord);
      const minAirGap = Math.max(0.085, this.modelRadius * 0.11);

      // Forward & symmetric outward pass from stack median so parts fan out cleanly with visible daylight
      const midIdx = Math.floor(group.length / 2);
      const adjusted = group.map((g) => g.projCoord);

      for (let i = midIdx + 1; i < group.length; i++) {
        const prev = group[i - 1];
        const curr = group[i];
        // Check lateral proximity perpendicular to explosion axis
        const dx = axis === 'x' ? 0 : curr.worldCenter.x - prev.worldCenter.x;
        const dy = axis === 'y' ? 0 : curr.worldCenter.y - prev.worldCenter.y;
        const dz = axis === 'z' ? 0 : curr.worldCenter.z - prev.worldCenter.z;
        if (prev.parentId === curr.parentId && Math.hypot(dx, dy, dz) < (prev.halfRadius + curr.halfRadius) * 0.85) {
          const needed = adjusted[i - 1] + prev.halfHeight + curr.halfHeight + minAirGap;
          if (adjusted[i] < needed) adjusted[i] = needed;
        }
      }

      for (let i = midIdx - 1; i >= 0; i--) {
        const next = group[i + 1];
        const curr = group[i];
        const dx = axis === 'x' ? 0 : curr.worldCenter.x - next.worldCenter.x;
        const dy = axis === 'y' ? 0 : curr.worldCenter.y - next.worldCenter.y;
        const dz = axis === 'z' ? 0 : curr.worldCenter.z - next.worldCenter.z;
        if (next.parentId === curr.parentId && Math.hypot(dx, dy, dz) < (next.halfRadius + curr.halfRadius) * 0.85) {
          const maxAllowed = adjusted[i + 1] - (next.halfHeight + curr.halfHeight + minAirGap);
          if (adjusted[i] > maxAllowed) adjusted[i] = maxAllowed;
        }
      }

      for (let i = 0; i < group.length; i++) {
        const delta = adjusted[i] - group[i].projCoord;
        // Amplify overall axial spread slightly (+22%) + non-overlapping stack delta, capped cleanly
        const clampedDelta = THREE.MathUtils.clamp(delta, -this.modelRadius * 1.1, this.modelRadius * 1.1);
        const extra: Vec3 = [
          group[i].baseOffset.x * 0.22 + (axis === 'x' ? clampedDelta : 0),
          group[i].baseOffset.y * 0.22 + (axis === 'y' ? clampedDelta : 0),
          group[i].baseOffset.z * 0.22 + (axis === 'z' ? clampedDelta : 0),
        ];
        this.explosionExtraClearance.set(group[i].id, extra);
      }
    }

    // Give radial parts a clean +22% breathing boost too
    for (const s of slots) {
      if (!this.explosionExtraClearance.has(s.id)) {
        this.explosionExtraClearance.set(s.id, [s.baseOffset.x * 0.22, s.baseOffset.y * 0.22, s.baseOffset.z * 0.22]);
      }
    }
  }

  /**
   * Builds real 3D tubular disassembly guide rods + seated origin rings (works in BOTH hardware &
   * SwiftShader software WebGL, unlike 1px GL_LINES which vanish on Retina/mobile thumbnails!).
   */
  private rebuildExplosionGuides(project: DecoderProject): void {
    for (const item of this.explosionGuideItems.values()) {
      item.rod.geometry.dispose();
      (item.rod.material as THREE.Material).dispose();
      item.originRing.geometry.dispose();
      (item.originRing.material as THREE.Material).dispose();
      item.partCollar.geometry.dispose();
      (item.partCollar.material as THREE.Material).dispose();
    }
    this.explosionGuideItems.clear();
    this.explosionGuidesGroup.clear();

    const rodRadius = Math.max(0.0045, this.modelRadius * 0.0048);
    // Unit-height cylinder scaled dynamically between seated origin & exploded part
    const unitRodGeo = new THREE.CylinderGeometry(rodRadius, rodRadius, 1, 8, 1, false);
    const ringGeo = new THREE.TorusGeometry(rodRadius * 3.4, rodRadius * 0.85, 8, 20);
    ringGeo.rotateX(Math.PI / 2);
    const collarGeo = new THREE.SphereGeometry(rodRadius * 2.3, 10, 8);

    for (const comp of project.components) {
      if (!comp.geometry || comp.layer === 'fluid') continue;
      const maxOffset = computeHierarchicalExplosionOffset(comp, 1, this.explosionPlan);
      if (Math.hypot(maxOffset[0], maxOffset[1], maxOffset[2]) < 0.04) continue;

      const rodMat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const originMat = new THREE.MeshBasicMaterial({
        color: 0x64748b,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const collarMat = new THREE.MeshBasicMaterial({
        color: 0xff4f9a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });

      const rod = new THREE.Mesh(unitRodGeo.clone(), rodMat);
      const originRing = new THREE.Mesh(ringGeo.clone(), originMat);
      const partCollar = new THREE.Mesh(collarGeo.clone(), collarMat);

      rod.frustumCulled = false;
      this.explosionGuidesGroup.add(rod, originRing, partCollar);
      this.explosionGuideItems.set(comp.id, { rod, originRing, partCollar });
    }

    unitRodGeo.dispose();
    ringGeo.dispose();
    collarGeo.dispose();
  }

  private rebuildStencilSectionPasses(project: DecoderProject): void {
    for (const child of this.stencilCapGroup.children) {
      const m = child as THREE.Mesh;
      (m.material as THREE.Material | undefined)?.dispose();
    }
    this.stencilCapGroup.clear();
    if (this.isSoftwareGl) return;

    for (const comp of project.components) {
      if (!comp.geometry || comp.layer === 'fluid') continue;
      const srcObj = this.componentObjects.get(comp.id);
      if (!srcObj || !(srcObj as THREE.Mesh).isMesh) continue;
      const geo = (srcObj as THREE.Mesh).geometry;

      const backStencilMat = new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        clippingPlanes: [this.clipPlane],
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
        stencilWrite: true,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.IncrementWrapStencilOp,
      });

      const frontStencilMat = new THREE.MeshBasicMaterial({
        side: THREE.FrontSide,
        clippingPlanes: [this.clipPlane],
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
        stencilWrite: true,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.DecrementWrapStencilOp,
      });

      const backMesh = new THREE.Mesh(geo, backStencilMat);
      const frontMesh = new THREE.Mesh(geo, frontStencilMat);
      backMesh.renderOrder = 1;
      frontMesh.renderOrder = 1;
      backMesh.matrixAutoUpdate = false;
      frontMesh.matrixAutoUpdate = false;
      backMesh.userData.sourceComponentId = comp.id;
      frontMesh.userData.sourceComponentId = comp.id;

      this.stencilCapGroup.add(backMesh, frontMesh);
    }
  }

  public loadProject(project: DecoderProject, resetCamera = true): void {
    this.project = project;
    this.runtime.setProject(project);
    this.lastGoodSimulation = undefined;
    this.state.time = 0;
    this.currentExplosion = 0;
    this.explosionVelocity = 0;
    this.paramValues = this.runtime.getDefaultParameters();
    this.explosionPlan = buildExplosionPlan(project);
    this.pathTracerSceneSynced = false;
    this.lastContactShadowExplosion = -1;

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
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.InstancedMesh).isInstancedMesh) {
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

    this.modelRoot.updateMatrixWorld(true);
    _tmpBox.setFromObject(this.modelRoot);
    this.modelRadius = _tmpBox.isEmpty() ? 0 : _tmpBox.getSize(_tmpSize).length() / 2;
    this.restReach = this.measureReach();
    this.explodeZoom = 1;
    this.lastFitExplosion = 0;

    this.computeExplosionClearanceMap(project);
    this.rebuildExplosionGuides(project);
    this.rebuildStencilSectionPasses(project);

    _tmpBox.setFromObject(this.modelRoot);
    if (!_tmpBox.isEmpty()) {
      _tmpBox.getSize(_tmpSize);
      _tmpBox.getCenter(_tmpCenter);
      const footprint = Math.max(2.2, Math.max(_tmpSize.x, _tmpSize.z) * 2.15);
      this.shadowDisc.scale.set(footprint / 6.8, 1, footprint / 6.8);
      const floorY = Math.min(-0.02, _tmpBox.min.y - 0.015);
      this.shadowDisc.position.set(_tmpCenter.x, floorY + 0.005, _tmpCenter.z);
      this.ptFloorCatcher.position.set(_tmpCenter.x, floorY + 0.002, _tmpCenter.z);
      this.gridHelper.position.y = floorY;

      if (this.contactShadowCam && this.contactShadowDepthMat) {
        const halfSpan = footprint * 0.5;
        this.contactShadowCam.left = -halfSpan;
        this.contactShadowCam.right = halfSpan;
        this.contactShadowCam.top = halfSpan;
        this.contactShadowCam.bottom = -halfSpan;
        this.contactShadowCam.far = Math.max(4.5, _tmpSize.y * 3.2);
        this.contactShadowCam.position.set(_tmpCenter.x, floorY + 0.004, _tmpCenter.z);
        this.contactShadowCam.updateProjectionMatrix();
        this.contactShadowDepthMat.uniforms['maxHeight'].value = Math.max(2.8, _tmpSize.y * 2.4);
      }

      const shadowSpan = Math.max(2.0, this.modelRadius * 2.35);
      this.keyLight.shadow.camera.left = -shadowSpan;
      this.keyLight.shadow.camera.right = shadowSpan;
      this.keyLight.shadow.camera.top = shadowSpan;
      this.keyLight.shadow.camera.bottom = -shadowSpan;
      this.keyLight.shadow.camera.updateProjectionMatrix();
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
      mat.transmission = baseMat.transmission;
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
        mat.transmission = 0;
        mat.transparent = true;
        mat.opacity = 0.16;
        mat.depthWrite = false;
      } else if (mode === 'xray') {
        mat.transmission = 0;
        mat.transparent = true;
        mat.opacity = comp.layer === 'core' || comp.layer === 'internal' ? 0.74 : 0.18;
        mat.depthWrite = false;
        mat.emissive.set('#6f7d8c');
        mat.emissiveIntensity = 0.18;
      } else if (mode === 'transparent') {
        mat.transmission = 0;
        mat.transparent = true;
        mat.opacity = 0.35;
        mat.depthWrite = false;
      } else if (mode === 'wireframe') {
        mat.wireframe = true;
      } else if (mode === 'isolated' && selId) {
        if (comp.id !== selId && comp.parentId !== selId) {
          mat.transmission = 0;
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
        mat.transmission = 0;
      } else if (mode === 'material') {
        mat.wireframe = false;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      } else if (mode === 'relationship_trace' && trace) {
        const isRelated = comp.id === selId || trace.upstreamIds.has(comp.id) || trace.downstreamIds.has(comp.id);
        if (!isRelated) {
          mat.transmission = 0;
          mat.transparent = true;
          mat.opacity = 0.14;
          mat.depthWrite = false;
        }
      }

      if (comp.id === selId || this.state.highlightedComponentIds.includes(comp.id)) {
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
    this.stencilCapGroup.visible = active && !this.isSoftwareGl;
    this.sectionCapMesh.visible = active && !this.isSoftwareGl;

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

    this.clipPlane.coplanarPoint(this.sectionCapMesh.position);
    this.sectionCapMesh.lookAt(
      this.sectionCapMesh.position.x - this.clipPlane.normal.x,
      this.sectionCapMesh.position.y - this.clipPlane.normal.y,
      this.sectionCapMesh.position.z - this.clipPlane.normal.z,
    );

    if (this.stencilCapGroup.visible) {
      this.modelRoot.updateMatrixWorld(true);
      for (const child of this.stencilCapGroup.children) {
        const cid = child.userData.sourceComponentId as string | undefined;
        const src = cid ? this.componentObjects.get(cid) : undefined;
        if (src) {
          child.visible = src.visible;
          child.matrix.copy(src.matrixWorld);
          child.matrixWorld.copy(src.matrixWorld);
        }
      }
    }
  }

  private computeStagedComponentExplosionProgress(compId: string, globalExplosion: number): number {
    if (globalExplosion <= 0.0005) return 0;
    if (globalExplosion >= 0.999) return 1;
    const order = this.explosionPlan.order;
    const idx = order.indexOf(compId);
    if (idx === -1 || order.length <= 1) return globalExplosion;

    const rankFrac = idx / (order.length - 1);
    const windowSpan = 0.68;
    const delay = rankFrac * (1 - windowSpan);
    const t = THREE.MathUtils.clamp((globalExplosion - delay) / windowSpan, 0, 1);
    return t * t * (3 - 2 * t);
  }

  private updateExplosionGuideVisuals(): void {
    const showGuides = this.currentExplosion > 0.03;
    this.explosionGuidesGroup.visible = showGuides;
    if (!showGuides) return;

    this.modelRoot.updateMatrixWorld(true);
    const selId = this.state.selectedComponentId;
    const globalFade = THREE.MathUtils.smoothstep(this.currentExplosion, 0.03, 0.2);

    for (const [cid, guide] of this.explosionGuideItems.entries()) {
      const obj = this.componentObjects.get(cid);
      const base = this.baseTransforms.get(cid);
      if (!obj || !base || !obj.visible) {
        guide.rod.visible = false;
        guide.originRing.visible = false;
        guide.partCollar.visible = false;
        continue;
      }

      obj.getWorldPosition(_wPosB);
      if (obj.parent) {
        _wPosA.set(base.pos[0], base.pos[1], base.pos[2]).applyMatrix4(obj.parent.matrixWorld);
      } else {
        _wPosA.set(base.pos[0], base.pos[1], base.pos[2]);
      }

      _wDir.subVectors(_wPosB, _wPosA);
      const dist = _wDir.length();
      if (dist < 0.035) {
        guide.rod.visible = false;
        guide.originRing.visible = false;
        guide.partCollar.visible = false;
        continue;
      }

      guide.rod.visible = true;
      guide.originRing.visible = true;
      guide.partCollar.visible = true;

      // Orient & stretch 3D guide cylinder cleanly from seated origin to exploded component
      guide.rod.position.copy(_wPosA).addScaledVector(_wDir, 0.5);
      guide.rod.scale.set(1, dist, 1);
      _wDir.normalize();
      guide.rod.quaternion.setFromUnitVectors(_upVec, _wDir);

      guide.originRing.position.copy(_wPosA);
      guide.originRing.quaternion.setFromUnitVectors(_upVec, _wDir);
      guide.partCollar.position.copy(_wPosB);

      const isSelected = cid === selId || this.state.highlightedComponentIds.includes(cid);
      const rodMat = guide.rod.material as THREE.MeshBasicMaterial;
      rodMat.color.setHex(isSelected ? 0xff4f9a : 0x7dd3fc);
      rodMat.opacity = globalFade * (isSelected ? 0.88 : 0.36);

      const origMat = guide.originRing.material as THREE.MeshBasicMaterial;
      origMat.color.setHex(isSelected ? 0xff4f9a : 0x94a3b8);
      origMat.opacity = globalFade * (isSelected ? 0.9 : 0.48);

      const colMat = guide.partCollar.material as THREE.MeshBasicMaterial;
      colMat.color.setHex(isSelected ? 0xff4f9a : 0xe2e8f0);
      colMat.opacity = globalFade * (isSelected ? 0.95 : 0.62);
    }
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

    if (this.isSoftwareGl || dt <= 0) {
      this.currentExplosion = targetExp;
      this.explosionVelocity = 0;
    } else {
      const omega = 11.5;
      const x = this.currentExplosion - targetExp;
      const expTerm = Math.exp(-omega * dt);
      const temp = (this.explosionVelocity + omega * x) * dt;
      this.explosionVelocity = (this.explosionVelocity - omega * temp) * expTerm;
      this.currentExplosion = targetExp + (x + temp) * expTerm;
      if (Math.abs(this.currentExplosion - targetExp) < 0.0004 && Math.abs(this.explosionVelocity) < 0.002) {
        this.currentExplosion = targetExp;
        this.explosionVelocity = 0;
      }
    }

    for (const comp of this.project.components) {
      const obj = this.componentObjects.get(comp.id);
      const base = this.baseTransforms.get(comp.id);
      if (!obj || !base) continue;

      const beh = simState.transforms[comp.id];
      const stagedProgress = this.computeStagedComponentExplosionProgress(comp.id, this.currentExplosion);
      const expOffset = computeHierarchicalExplosionOffset(comp, stagedProgress, this.explosionPlan);
      const extraClear = this.explosionExtraClearance.get(comp.id);

      const ex = expOffset[0] + (extraClear ? extraClear[0] * stagedProgress : 0);
      const ey = expOffset[1] + (extraClear ? extraClear[1] * stagedProgress : 0);
      const ez = expOffset[2] + (extraClear ? extraClear[2] * stagedProgress : 0);

      obj.position.set(
        base.pos[0] + (beh?.position_x ?? 0) + ex,
        base.pos[1] + (beh?.position_y ?? 0) + ey,
        base.pos[2] + (beh?.position_z ?? 0) + ez,
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
    this.updateExplosionGuideVisuals();
    this.applySectionPlane();
    this.effectsManager.update(
      this.state.time,
      simState,
      this.state.showEffects,
      this.camera.quaternion,
      this.showsInterior() ? undefined : this.sealedHeatEffectIds,
    );

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
      if (this.hdrEquirectTex && this.scene.environment !== this.hdrEquirectTex) {
        this.scene.environment = this.hdrEquirectTex;
      }
      if (!this.pathTracerSceneSynced) {
        const prevEffects = this.effectsManager.root.visible;
        const prevGrid = this.gridHelper.visible;
        const prevShadow = this.shadowDisc.visible;
        const prevGuides = this.explosionGuidesGroup.visible;
        const prevSec = this.sectionHelperMesh.visible;
        const prevCap = this.sectionCapMesh.visible;
        const prevStencil = this.stencilCapGroup.visible;

        this.effectsManager.root.visible = false;
        this.gridHelper.visible = false;
        this.shadowDisc.visible = false;
        this.explosionGuidesGroup.visible = false;
        this.sectionHelperMesh.visible = false;
        this.sectionCapMesh.visible = false;
        this.stencilCapGroup.visible = false;
        this.ptFloorCatcher.visible = true;

        const ok = this.pathTracer.syncScene(this.scene, this.camera);

        this.ptFloorCatcher.visible = false;
        this.gridHelper.visible = prevGrid;
        this.shadowDisc.visible = prevShadow;
        this.explosionGuidesGroup.visible = prevGuides;
        this.sectionHelperMesh.visible = prevSec;
        this.sectionCapMesh.visible = prevCap;
        this.stencilCapGroup.visible = prevStencil;
        this.effectsManager.root.visible = prevEffects;
        this.pathTracerSceneSynced = ok;
      }
      if (this.pathTracerSceneSynced) {
        this.pathTracer.renderSample();
        this.notifyPathTracerStatus();
        return;
      }
    }

    if (this.pmremEnvTex && this.scene.environment !== this.pmremEnvTex) {
      this.scene.environment = this.pmremEnvTex;
    }

    this.renderContactShadow();

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

      const targetExp =
        this.state.examinationMode === 'exploded' ? Math.max(0.45, this.state.explosion) : this.state.explosion;
      const explosionSettling = !this.isSoftwareGl && Math.abs(this.currentExplosion - targetExp) > 0.0005;
      if (explosionSettling || this.cameraTweenTarget) {
        this.stepSimulation(0.016);
      }

      this.controls.update();
      this.renderFrame();
      const done = () => {
        this.renderBusy = false;
        const stillExploding = !this.isSoftwareGl && Math.abs(this.currentExplosion - targetExp) > 0.0005;
        const ptNeedsMoreSamples =
          this.shouldUsePathTracer() && this.pathTracer.getStatus(true).samples < this.pathTracer.targetSamples;
        if (this.renderDirty || this.cameraTweenTarget || stillExploding || ptNeedsMoreSamples) {
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

    for (const item of this.explosionGuideItems.values()) {
      item.rod.geometry.dispose();
      (item.rod.material as THREE.Material).dispose();
      item.originRing.geometry.dispose();
      (item.originRing.material as THREE.Material).dispose();
      item.partCollar.geometry.dispose();
      (item.partCollar.material as THREE.Material).dispose();
    }
    this.explosionGuideItems.clear();

    for (const child of this.stencilCapGroup.children) {
      ((child as THREE.Mesh).material as THREE.Material | undefined)?.dispose();
    }

    this.contactShadowRT?.dispose();
    this.contactShadowBlurRT?.dispose();
    this.contactShadowDepthMat?.dispose();
    this.contactShadowHBlurMat?.dispose();
    this.contactShadowVBlurMat?.dispose();
    this.contactShadowBlurQuad?.geometry.dispose();

    this.ptFloorCatcher.geometry.dispose();
    (this.ptFloorCatcher.material as THREE.Material).dispose();
    this.sectionCapMesh.geometry.dispose();
    (this.sectionCapMesh.material as THREE.Material).dispose();

    this.outlinePass?.dispose();
    this.bloomPass?.dispose();
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
