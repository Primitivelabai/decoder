/**
 * Decoder Universal System Visualisation Engine
 * Versioned .decoder.json specification and runtime contracts.
 */

export type DecoderSchemaVersion = '1.0.0';

export type MeasurementUnit =
  | 'mm'
  | 'cm'
  | 'm'
  | 'um'
  | 'deg'
  | 'rad'
  | 'rpm'
  | 'bar'
  | 'kPa'
  | 'MPa'
  | 'C'
  | 'K'
  | 'W'
  | 'V'
  | 'A'
  | 'Hz'
  | 'GHz'
  | 'ml/s'
  | 'L/min'
  | 'N'
  | 'Nm'
  | 'ratio'
  | '%'
  | 'unitless';

export type EvidenceClassification = 'observed' | 'documented' | 'inferred' | 'illustrative' | 'unknown';

export type SimulationValidityLevel = 'A' | 'B' | 'C' | 'D';

export interface EvidenceMetadata {
  classification: EvidenceClassification;
  sources?: string[];
  assumptions?: string[];
  knownDimensions?: Record<string, string>;
  inferredDimensions?: Record<string, string>;
  confidenceNotes?: string;
  geometryProvenance?: 'procedural' | 'cad_brep' | 'mesh_scan' | 'schematic';
  simulationValidity?: SimulationValidityLevel;
}

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface TransformSpec {
  position?: Vec3;
  rotation?: Vec3; // Euler radians [x, y, z]
  scale?: Vec3;
}

export type MaterialPresetId =
  | 'polished_metal'
  | 'brushed_steel'
  | 'cast_aluminium'
  | 'brass'
  | 'copper'
  | 'chrome'
  | 'ceramic'
  | 'glass'
  | 'translucent_plastic'
  | 'abs_plastic'
  | 'silicone'
  | 'rubber'
  | 'painted_surface'
  | 'carbon_fibre'
  | 'wood'
  | 'stone'
  | 'organic_tissue'
  | 'semiconductor'
  | 'water_fluid';

export interface MaterialSpec {
  id: string;
  name: string;
  preset: MaterialPresetId;
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  transmission?: number;
  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  anisotropy?: number;
  sheen?: number;
  sheenColor?: string;
  thickness?: number;
  attenuationColor?: string;
  attenuationDistance?: number;
  normalScale?: number;
  roughnessVariation?: number;
  imperfection?: number;
  subsurfaceColor?: string;
  subsurfaceStrength?: number;
  emissive?: string;
  emissiveIntensity?: number;
  thermalTint?: string;
  textureScale?: number;
}

export type PrimitiveType =
  | 'box'
  | 'rounded_box'
  | 'cylinder'
  | 'tapered_cylinder'
  | 'sphere'
  | 'ellipsoid'
  | 'cone'
  | 'torus'
  | 'tube'
  | 'hollow_vessel'
  | 'dome'
  | 'extrude'
  | 'revolve'
  | 'loft'
  | 'sweep'
  | 'thin_shell'
  | 'rib'
  | 'gear'
  | 'thread'
  | 'spring'
  | 'bearing'
  | 'fastener'
  | 'flange'
  | 'gasket_ring'
  | 'pipe_network'
  | 'flexible_hose'
  | 'layered_surface'
  | 'branching_structure'
  | 'custom_mesh'
  | 'instanced'
  // Parameterized higher-level domain generators
  | 'piston_cylinder'
  | 'gear_train'
  | 'pump_unit'
  | 'electric_motor'
  | 'circuit_board'
  | 'heat_exchanger'
  | 'hydraulic_manifold'
  | 'vascular_branch'
  | 'molecular_lattice'
  | 'processor_die';

export type BooleanOpType = 'union' | 'subtract' | 'intersect';

export interface GeometryBooleanOp {
  op: BooleanOpType;
  target: GeometrySpec;
  transform?: TransformSpec;
}

export interface GeometryModifier {
  kind:
    | 'perforation'
    | 'slot'
    | 'groove'
    | 'bevel'
    | 'chamfer'
    | 'fasteners'
    | 'gasket'
    | 'o_ring'
    | 'ribs'
    | 'knurling'
    | 'seam';
  count?: number;
  radius?: number;
  width?: number;
  depth?: number;
  length?: number;
  spacing?: number;
  boltRadius?: number;
  axis?: 'x' | 'y' | 'z';
  offset?: Vec3;
}

export interface GeometrySpec {
  type: PrimitiveType;
  params: Record<string, unknown>;
  /** Optional CSG Boolean operations applied sequentially to this geometry */
  booleans?: GeometryBooleanOp[];
  /** Optional subtractive/edge modifiers (slots, grooves, perforations) */
  modifiers?: GeometryModifier[];
  /** Optional instancing transforms if type === 'instanced' or repeated */
  instances?: TransformSpec[];
}

export interface AttachmentInterface {
  id: string;
  label: string;
  localPosition: Vec3;
  normal: Vec3;
  matingType?:
    'threaded' | 'press_fit' | 'flange' | 'hinge' | 'sliding' | 'magnetic' | 'vascular' | 'electrical' | 'optical';
  targetComponentId?: string;
}

export type JointType = 'fixed' | 'revolute' | 'prismatic' | 'cylindrical' | 'spherical' | 'cam' | 'gear';

export interface ConstraintSpec {
  id: string;
  type: JointType;
  axis?: Vec3;
  limits?: [number, number];
  unit?: MeasurementUnit;
  parentComponentId?: string;
  ratio?: number;
}

export interface DisassemblySpec {
  direction: Vec3;
  distance: number;
  order: number;
  dependsOn?: string[];
  subsystem?: string;
}

export type ExaminationLayer = 'exterior' | 'casing' | 'structural' | 'internal' | 'core' | 'fluid' | 'annotation';

export interface ComponentNode {
  id: string;
  name: string;
  /** Short display name for lists ("Vibratory pump"). Falls back to `name`. */
  shortName?: string;
  description: string;
  workingPrinciple?: string;
  materialRationale?: string;
  failureMode?: string;
  keySpecs?: Array<{ label: string; value: string }>;
  parentId?: string | null;
  subsystem?: string;
  layer?: ExaminationLayer;
  visible?: boolean;
  transform?: TransformSpec;
  geometry?: GeometrySpec;
  materialId?: string;
  attachments?: AttachmentInterface[];
  constraints?: ConstraintSpec[];
  disassembly?: DisassemblySpec;
  evidence: EvidenceMetadata;
  partNumber?: string;
  metadata?: Record<string, string | number>;
}

export type RelationshipType =
  | 'force'
  | 'torque'
  | 'rotation'
  | 'translation'
  | 'electrical_power'
  | 'information'
  | 'signal'
  | 'liquid_flow'
  | 'gas_flow'
  | 'heat'
  | 'chemical_exchange'
  | 'optical_transmission'
  | 'control'
  | 'feedback'
  | 'logical_dependency';

export interface RelationshipSpec {
  id: string;
  type: RelationshipType;
  sourceId: string;
  targetId: string;
  label: string;
  mechanism?: string;
  quantityExpr?: string;
  unit?: MeasurementUnit;
  activeExpr?: string;
  bidirectional?: boolean;
  waypoints?: Vec3[];
  evidence: EvidenceMetadata;
}

export type EffectType =
  | 'liquid_flow'
  | 'steam_vapour'
  | 'smoke'
  | 'combustion'
  | 'heat_gradient'
  | 'thermal_diffusion'
  | 'electrical_current'
  | 'electromagnetic_field'
  | 'signal_pulse'
  | 'pressure_wave'
  | 'particles'
  | 'airflow'
  | 'magnetic_field'
  | 'optical_ray'
  | 'material_transport'
  | 'chemical_gradient'
  | 'cellular_activity';

export interface EffectSpec {
  id: string;
  type: EffectType;
  label: string;
  targetComponentId?: string;
  relationshipId?: string;
  path?: Vec3[];
  radius?: number;
  color?: string;
  secondaryColor?: string;
  direction?: Vec3;
  intensityExpr?: string;
  speedExpr?: string;
  density?: number;
  scale?: number;
  clippedToComponent?: boolean;
  validity: 'illustrative' | 'numerical';
}

export type BehaviourBindingKind =
  | 'rotation_x'
  | 'rotation_y'
  | 'rotation_z'
  | 'position_x'
  | 'position_y'
  | 'position_z'
  | 'scale_x'
  | 'scale_y'
  | 'scale_z'
  | 'scale_uniform'
  | 'visible'
  | 'emissive_intensity'
  | 'color_temperature'
  | 'opacity';

export interface BehaviourBinding {
  id: string;
  componentId: string;
  property: BehaviourBindingKind;
  expression: string;
  description?: string;
}

export interface StateTransitionRule {
  from: string;
  to: string;
  condition: string;
}

export interface StateMachineSpec {
  id: string;
  initialState: string;
  states: string[];
  transitions: StateTransitionRule[];
}

export interface DifferentialEquationSpec {
  variable: string;
  initialValue: number;
  derivativeExpr: string;
  min?: number;
  max?: number;
  unit?: MeasurementUnit;
}

export interface SimulationModelSpec {
  level: SimulationValidityLevel;
  cycleDuration: number; // seconds for 1 full cycle
  loop: boolean;
  assumptions: string[];
  variables: Record<string, string>; // variableName -> declarative expression
  odes?: DifferentialEquationSpec[];
  lookupTables?: Record<string, Array<[number, number]>>;
  stateMachines?: StateMachineSpec[];
  outputs: Array<{
    id: string;
    label: string;
    expression: string;
    unit: MeasurementUnit;
    precision?: number;
  }>;
}

export type ParameterControlType = 'slider' | 'switch' | 'button' | 'number' | 'select';

export interface ParameterSpec {
  id: string;
  label: string;
  description?: string;
  control: ParameterControlType;
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: MeasurementUnit;
  options?: Array<{ label: string; value: string | number }>;
  /** Words for the two ends of a slider ("Coarse", "Fine"). */
  minLabel?: string;
  maxLabel?: string;
}

export type ExaminationMode =
  | 'assembled'
  | 'exploded'
  | 'cutaway'
  | 'cross_section'
  | 'xray'
  | 'transparent'
  | 'isolated'
  | 'layered'
  | 'wireframe'
  | 'relationship_trace'
  | 'motion_study'
  | 'thermal'
  | 'material'
  | 'technical_illustration';

export type LightingPresetId =
  | 'technical_studio'
  | 'museum_exhibit'
  | 'photographic_product'
  | 'clinical_illustration'
  | 'dark_lab'
  | 'white_engineering';

export type IllustrationAesthetic =
  'patent' | 'museum_plate' | 'industrial_manual' | 'scientific_journal' | 'minimal_editorial' | 'technical_atlas';

export interface SectionPlaneState {
  enabled: boolean;
  axis: 'x' | 'y' | 'z';
  position: number; // normalized -1 to 1 across model bounds
  invert?: boolean;
}

export type RenderQualityMode = 'interactive' | 'photorealistic';

export type CameraProjection = 'perspective' | 'orthographic';

export type CameraPresetId = 'hero' | 'front' | 'side' | 'top' | 'isometric' | 'macro';

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  fov?: number;
}

export interface AnnotationSpec {
  id: string;
  componentId: string;
  title: string;
  body: string;
  offset?: Vec3;
}

export interface ChapterSpec {
  id: string;
  index: number;
  title: string;
  narration: string;
  durationSec: number;
  camera: CameraPose;
  explosion: number; // 0..1
  examinationMode?: ExaminationMode;
  section?: SectionPlaneState;
  visibleComponentIds?: string[];
  hiddenComponentIds?: string[];
  highlightedComponentIds?: string[];
  highlightedRelationshipIds?: string[];
  playing?: boolean;
  playbackSpeed?: number;
  parameterOverrides?: Record<string, number | boolean | string>;
  annotations?: AnnotationSpec[];
}

export interface DecoderProject {
  schemaVersion: DecoderSchemaVersion;
  id: string;
  title: string;
  subtitle: string;
  /** Short title for pickers and the top bar ("Espresso machine"). Falls back to `title`. */
  shortTitle?: string;
  /** Short subtitle for pickers ("Semi-automatic · fluid"). Falls back to `subtitle`. */
  shortSubtitle?: string;
  /** Display names for subsystem keys used by components ("supply" → "Water supply"). */
  subsystemLabels?: Record<string, string>;
  category: 'mechanical' | 'biological' | 'optical' | 'electronic' | 'fluid' | 'everyday';
  unit: MeasurementUnit;
  summary: string;
  author?: string;
  lightingPreset: LightingPresetId;
  defaultCamera: CameraPose;
  materials: MaterialSpec[];
  components: ComponentNode[];
  relationships: RelationshipSpec[];
  effects: EffectSpec[];
  simulation: SimulationModelSpec;
  behaviours: BehaviourBinding[];
  parameters: ParameterSpec[];
  chapters: ChapterSpec[];
  annotations: AnnotationSpec[];
  environment?: {
    ambientTempC?: number;
    gravity?: number;
    medium?: string;
  };
  evidenceSummary: EvidenceMetadata;
}

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  path: string;
  componentId?: string;
  message: string;
  repairHint?: string;
}

export interface ValidationReport {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: ValidationIssue[];
  stats: {
    componentCount: number;
    relationshipCount: number;
    effectCount: number;
    chapterCount: number;
    parameterCount: number;
    evidenceCoverage: number;
  };
}

export interface EvaluatedSimulationState {
  time: number;
  phase: number; // normalized 0..1
  cycleAngleDeg: number; // 0..360 or 0..720
  variables: Record<string, number>;
  states: Record<string, string>;
  outputs: Array<{
    id: string;
    label: string;
    value: number;
    unit: MeasurementUnit;
    formatted: string;
  }>;
  transforms: Record<string, Partial<Record<BehaviourBindingKind, number>>>;
  relationshipActivity: Record<string, { active: boolean; quantity: number }>;
  effectStates: Record<string, { intensity: number; speed: number }>;
}

export interface SceneDiagnostics {
  meshCount: number;
  triangleCount: number;
  estimatedMemoryKB: number;
  drawCallsEstimate: number;
  instancedMeshCount: number;
  boundsSize: Vec3;
  boundsCenter: Vec3;
}
