import type { LineStyle } from '../../engine/relationships';
import type {
  CameraPresetId,
  ComponentNode,
  DecoderProject,
  EvidenceClassification,
  ExaminationMode,
  LightingPresetId,
  MeasurementUnit,
  RelationshipType,
} from '../../engine/types';

/** "left_heart" → "Left heart". */
export function humanise(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function partName(comp: Pick<ComponentNode, 'name' | 'shortName'>): string {
  return comp.shortName?.trim() || comp.name;
}

export function exhibitTitle(project: DecoderProject): string {
  return project.shortTitle?.trim() || project.title;
}

export function exhibitSubtitle(project: DecoderProject): string {
  return project.shortSubtitle?.trim() || project.subtitle;
}

export function subsystemLabel(project: DecoderProject, key: string | undefined): string {
  const k = key ?? 'other';
  return project.subsystemLabels?.[k] ?? humanise(k);
}

export const CATEGORY_LABELS: Record<DecoderProject['category'], string> = {
  mechanical: 'Mechanism',
  biological: 'Living system',
  optical: 'Optical system',
  electronic: 'Electronic system',
  fluid: 'Fluid system',
  everyday: 'Everyday object',
};

export function evidenceTag(classification: EvidenceClassification, level?: string): string {
  return level ? `${humanise(classification)} · level ${level}` : humanise(classification);
}

/** Unit as a reader would write it after a number. */
export function unitText(unit: MeasurementUnit | undefined): string {
  if (!unit || unit === 'unitless' || unit === 'ratio') return '';
  if (unit === 'C') return '°C';
  if (unit === 'deg') return '°';
  if (unit === 'um') return 'µm';
  if (unit === 'Nm') return 'N·m';
  return unit;
}

export function formatNumber(value: number, step?: number): string {
  if (!Number.isFinite(value)) return '–';
  const decimals = step && step < 1 ? Math.min(3, Math.max(0, Math.ceil(-Math.log10(step)))) : 0;
  return value.toFixed(decimals);
}

/** Splits a runtime readout ("9.0 bar") into its number and unit. */
export function splitReadout(formatted: string, unit: MeasurementUnit): { value: string; unit: string } {
  const [value] = formatted.split(' ');
  return { value, unit: unitText(unit) };
}

export const LIGHTING_LABELS: Record<LightingPresetId, string> = {
  technical_studio: 'Studio',
  museum_exhibit: 'Museum',
  photographic_product: 'Product photo',
  clinical_illustration: 'Clinical',
  dark_lab: 'Dark lab',
  white_engineering: 'White sheet',
};

export const CAMERA_PRESETS: Array<{ id: CameraPresetId; label: string }> = [
  { id: 'hero', label: 'Hero' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
  { id: 'isometric', label: 'Iso' },
  { id: 'macro', label: 'Close' },
];

export interface ExamModeInfo {
  id: ExaminationMode;
  label: string;
  hint: string;
}

/** The four views that stay in the dock. */
export const DOCK_MODES: ExamModeInfo[] = [
  { id: 'assembled', label: 'Whole', hint: 'Everything in place' },
  { id: 'cutaway', label: 'Cutaway', hint: 'The shell cut open' },
  { id: 'xray', label: 'X-ray', hint: 'See through to the inside' },
  { id: 'thermal', label: 'Heat', hint: 'Coloured by temperature' },
];

/** The other views, under "more" in the dock. */
export const MORE_MODES: Array<{ group: string; modes: ExamModeInfo[] }> = [
  {
    group: 'Structure',
    modes: [
      { id: 'exploded', label: 'Exploded', hint: 'Every part pulled out along its axis' },
      { id: 'cross_section', label: 'Section', hint: 'Sliced through one plane' },
      { id: 'isolated', label: 'Isolated', hint: 'Only the part you picked' },
      { id: 'layered', label: 'Layered', hint: 'Shell, internals and core apart' },
      { id: 'wireframe', label: 'Wireframe', hint: 'Edges only' },
    ],
  },
  {
    group: 'Behaviour',
    modes: [
      { id: 'transparent', label: 'Transparent', hint: 'Every part see-through' },
      { id: 'relationship_trace', label: 'Trace', hint: 'Follow what moves through it' },
      { id: 'material', label: 'Material', hint: 'Coloured by what it is made of' },
    ],
  },
];

export function examModeLabel(mode: ExaminationMode): string {
  const all = [...DOCK_MODES, ...MORE_MODES.flatMap((g) => g.modes)];
  return all.find((m) => m.id === mode)?.label ?? humanise(mode);
}

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  force: 'Force',
  torque: 'Torque',
  rotation: 'Rotation',
  translation: 'Sliding',
  electrical_power: 'Power',
  information: 'Data',
  signal: 'Signal',
  liquid_flow: 'Liquid',
  gas_flow: 'Gas',
  heat: 'Heat',
  chemical_exchange: 'Chemical',
  optical_transmission: 'Light',
  control: 'Control',
  feedback: 'Feedback',
  logical_dependency: 'Depends on',
};

/** Flows are told apart by line style, never by colour. */
export { RELATIONSHIP_LINE, type LineStyle } from '../../engine/relationships';
export function lineBorder(style: LineStyle, color: string): string {
  switch (style) {
    case 'dashed':
    case 'faint':
      return `1.5px dashed ${color}`;
    case 'double':
      return `3px double ${color}`;
    case 'dotted':
      return `1.5px dotted ${color}`;
    default:
      return `1.5px solid ${color}`;
  }
}

/** SVG dash pattern for a line style. */
export function lineDash(style: LineStyle): string | undefined {
  if (style === 'dashed' || style === 'faint') return '6 4';
  if (style === 'dotted') return '1.5 3';
  return undefined;
}
