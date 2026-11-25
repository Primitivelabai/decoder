import { MATERIAL_PRESET_DEFAULTS } from '../../engine/materials';
import type { ComponentNode, DecoderProject, MaterialPresetId, PrimitiveType, Vec3 } from '../../engine/types';
import { humanise } from '../ui/labels';
import { NumberField, Section, TextField } from './fields';

const PRIMITIVE_OPTIONS: PrimitiveType[] = [
  'box',
  'rounded_box',
  'cylinder',
  'tapered_cylinder',
  'sphere',
  'ellipsoid',
  'cone',
  'torus',
  'hollow_vessel',
  'fastener',
  'flange',
  'gasket_ring',
  'gear',
  'spring',
  'bearing',
  'piston_cylinder',
  'pump_unit',
  'electric_motor',
  'circuit_board',
  'heat_exchanger',
  'hydraulic_manifold',
  'processor_die',
];

const DEG = 180 / Math.PI;

interface ShapeTabProps {
  project: DecoderProject;
  comp: ComponentNode;
  onUpdateComponent: (updater: (c: ComponentNode) => ComponentNode) => void;
  onMutateProject: (next: DecoderProject) => void;
}

/** Name, place, form and material of the selected part. */
export function ShapeTab({ project, comp, onUpdateComponent, onMutateProject }: ShapeTabProps) {
  const material = comp.materialId ? project.materials.find((m) => m.id === comp.materialId) : undefined;
  const geometryType = comp.geometry?.type;
  const isKnownForm = geometryType ? PRIMITIVE_OPTIONS.includes(geometryType) : false;

  const setVec = (prop: 'position' | 'rotation' | 'scale', axis: number, value: number) => {
    onUpdateComponent((c) => {
      const base: Vec3 = c.transform?.[prop] ?? (prop === 'scale' ? [1, 1, 1] : [0, 0, 0]);
      const next: Vec3 = [...base];
      next[axis] = value;
      return { ...c, transform: { ...c.transform, [prop]: next } };
    });
  };

  const setFinish = (preset: MaterialPresetId) => {
    if (!material) return;
    const def = MATERIAL_PRESET_DEFAULTS[preset];
    onMutateProject({
      ...project,
      materials: project.materials.map((m) =>
        m.id === material.id
          ? { ...m, preset, color: def.color, roughness: def.roughness, metalness: def.metalness }
          : m,
      ),
    });
  };

  return (
    <div className="flex flex-col">
      <Section>
        <TextField
          id="part-name"
          label="Name"
          value={comp.name}
          onChange={(v) => onUpdateComponent((c) => ({ ...c, name: v }))}
        />
        <TextField
          id="part-short-name"
          label="Short name, for lists"
          value={comp.shortName ?? ''}
          placeholder={comp.name}
          onChange={(v) => onUpdateComponent((c) => ({ ...c, shortName: v.trim() ? v : undefined }))}
        />
        <TextField
          id="part-description"
          label="Description"
          multiline
          value={comp.description}
          onChange={(v) => onUpdateComponent((c) => ({ ...c, description: v }))}
        />
      </Section>

      <Section>
        <div className="grid grid-cols-[64px_repeat(3,minmax(0,1fr))] gap-2 items-center">
          <span className="dc-label">Place</span>
          {['X', 'Y', 'Z'].map((a) => (
            <span key={a} className="dc-label text-center">
              {a}
            </span>
          ))}
          {(['position', 'rotation', 'scale'] as const).map((prop) => {
            const vec: Vec3 = comp.transform?.[prop] ?? (prop === 'scale' ? [1, 1, 1] : [0, 0, 0]);
            return [
              <span key={`${prop}-label`} className="text-[13px] text-ink/60">
                {humanise(prop)}
              </span>,
              ...[0, 1, 2].map((axis) => (
                <NumberField
                  key={`${prop}-${axis}`}
                  label={`${humanise(prop)} ${'XYZ'[axis]}${prop === 'rotation' ? ' in degrees' : ''}`}
                  step={prop === 'rotation' ? 5 : prop === 'scale' ? 0.1 : 0.05}
                  value={prop === 'rotation' ? Math.round(vec[axis] * DEG * 10) / 10 : vec[axis]}
                  onChange={(v) => setVec(prop, axis, prop === 'rotation' ? v / DEG : v)}
                />
              )),
            ];
          })}
        </div>
        <p className="m-0 text-[12px] text-ink/50">Rotation is in degrees.</p>
      </Section>

      {comp.geometry && (
        <Section
          label="Form"
          aside={
            <select
              aria-label="Form"
              value={comp.geometry.type}
              onChange={(e) =>
                onUpdateComponent((c) => ({
                  ...c,
                  geometry: { ...c.geometry!, type: e.target.value as PrimitiveType },
                }))
              }
              className="dc-field !w-auto !h-8 text-[13px]"
            >
              {!isKnownForm && <option value={comp.geometry.type}>{humanise(comp.geometry.type)}</option>}
              {PRIMITIVE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {humanise(p)}
                </option>
              ))}
            </select>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(comp.geometry.params)
              .filter(([, v]) => typeof v === 'number')
              .map(([key, val]) => (
                <label key={key} className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-[12px] text-ink/60 truncate">{humanise(key)}</span>
                  <NumberField
                    label={humanise(key)}
                    step={0.05}
                    value={val as number}
                    onChange={(v) =>
                      onUpdateComponent((c) => ({
                        ...c,
                        geometry: { ...c.geometry!, params: { ...c.geometry!.params, [key]: v } },
                      }))
                    }
                  />
                </label>
              ))}
          </div>
        </Section>
      )}

      <Section label="Material">
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-[4px] border border-ink/18 pointer-events-none"
            style={{ backgroundColor: material?.color ?? '#8a8f98' }}
          />
          <select
            aria-label="Material"
            value={comp.materialId ?? ''}
            onChange={(e) => onUpdateComponent((c) => ({ ...c, materialId: e.target.value }))}
            className="dc-field !h-11 !rounded-full !pl-10"
          >
            {!comp.materialId && <option value="">None</option>}
            {project.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        {material && (
          <label className="flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="text-[13px] text-ink/60">Finish</span>
              <span className="text-[12px] text-ink/40">Shared by every part in this material</span>
            </span>
            <select
              value={material.preset}
              onChange={(e) => setFinish(e.target.value as MaterialPresetId)}
              className="dc-field !w-auto !h-8 text-[13px] shrink-0"
            >
              {(Object.keys(MATERIAL_PRESET_DEFAULTS) as MaterialPresetId[]).map((p) => (
                <option key={p} value={p}>
                  {humanise(p)}
                </option>
              ))}
            </select>
          </label>
        )}
      </Section>
    </div>
  );
}
