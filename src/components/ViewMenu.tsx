import { useCallback, useRef, useState } from 'react';
import { Camera, ChevronDown } from 'lucide-react';
import { LIGHTING_PRESETS } from '../engine/materials';
import type { PathTracerStatus } from '../engine/pathtracer';
import type { ViewportState } from '../engine/renderer';
import type { CameraPresetId, LightingPresetId } from '../engine/types';
import { Range, Switch, useDismiss } from './ui/controls';
import { CAMERA_PRESETS, LIGHTING_LABELS } from './ui/labels';

export interface ViewMenuProps {
  viewportState: ViewportState;
  pathTracerStatus: PathTracerStatus | null;
  pathTracingSupported: boolean;
  onUpdateViewport: (partial: Partial<ViewportState>) => void;
  onApplyCameraPreset: (preset: CameraPresetId) => void;
}

const segment = 'grid gap-0.5 p-[3px] border border-ink/12 rounded-lg';
const segmentBtn = 'dc-btn h-8 justify-center text-[12px] px-1';

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-11 py-1 border-b border-ink/8 last:border-b-0">
      <span className={`flex flex-col leading-[1.3] ${disabled ? 'text-ink/40' : 'text-ink'}`}>
        <span>{label}</span>
        {hint && <span className="text-[12px] text-ink/50">{hint}</span>}
      </span>
      <Switch label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/** Camera, projection, lighting, exposure and render toggles. Every control maps to a renderer setting. */
export function ViewSettings({
  viewportState,
  pathTracerStatus,
  pathTracingSupported,
  onUpdateViewport,
  onApplyCameraPreset,
}: ViewMenuProps) {
  const [lastPreset, setLastPreset] = useState<CameraPresetId | null>(null);
  const flat = viewportState.cameraProjection === 'orthographic';
  const photoreal = viewportState.renderQualityMode === 'photorealistic';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="dc-label mb-2">Camera</div>
        <div role="group" aria-label="Camera" className={`${segment} grid-cols-6`}>
          {CAMERA_PRESETS.map((cp) => (
            <button
              key={cp.id}
              type="button"
              data-active={lastPreset === cp.id}
              onClick={() => {
                setLastPreset(cp.id);
                onApplyCameraPreset(cp.id);
              }}
              className={segmentBtn}
            >
              {cp.label}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Projection" className={`${segment} grid-cols-2 mt-1.5`}>
          <button
            type="button"
            role="radio"
            aria-checked={!flat}
            onClick={() => onUpdateViewport({ cameraProjection: 'perspective' })}
            className={segmentBtn}
          >
            Perspective
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={flat}
            onClick={() => onUpdateViewport({ cameraProjection: 'orthographic' })}
            className={segmentBtn}
          >
            Flat (orthographic)
          </button>
        </div>
      </div>

      <div>
        <div className="dc-label mb-1.5">Lighting</div>
        <div role="radiogroup" aria-label="Lighting" className="grid grid-cols-2 gap-0.5">
          {(Object.keys(LIGHTING_PRESETS) as LightingPresetId[]).map((id) => {
            const active = viewportState.lightingPreset === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  onUpdateViewport({
                    lightingPreset: id,
                    exposure: LIGHTING_PRESETS[id]?.exposure ?? viewportState.exposure,
                  })
                }
                className="dc-btn h-9 px-2.5"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-accent' : ''}`} />
                {LIGHTING_LABELS[id] ?? LIGHTING_PRESETS[id].label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="view-exposure" className="dc-label">
            Exposure
          </label>
          <span className="text-[12px] font-mono tabular-nums">{viewportState.exposure.toFixed(2)} EV</span>
        </div>
        <Range
          id="view-exposure"
          label="Exposure"
          min={0.6}
          max={1.6}
          step={0.02}
          value={viewportState.exposure}
          onChange={(v) => onUpdateViewport({ exposure: v })}
          className="w-full"
        />
      </div>

      <div className="flex flex-col border-t border-ink/8">
        <ToggleRow
          label="Soft contact shadows"
          checked={viewportState.enableAO}
          onChange={(v) => onUpdateViewport({ enableAO: v })}
        />
        <ToggleRow
          label="Depth of field"
          hint={flat ? 'Needs perspective' : undefined}
          checked={viewportState.enableDof && !flat}
          disabled={flat}
          onChange={(v) => onUpdateViewport({ enableDof: v })}
        />
        <ToggleRow
          label="Moving effects"
          hint="Flow, heat and spark animations"
          checked={viewportState.showEffects}
          onChange={(v) => onUpdateViewport({ showEffects: v })}
        />
        <ToggleRow
          label="Photoreal render"
          hint={
            !pathTracingSupported
              ? 'Path traced · needs a GPU, not available here'
              : photoreal && viewportState.playing
                ? 'Pause to let the image build up'
                : photoreal && pathTracerStatus
                  ? `Path traced · ${pathTracerStatus.samples} of ${pathTracerStatus.targetSamples} samples`
                  : 'Path traced · needs a GPU'
          }
          checked={photoreal}
          disabled={!pathTracingSupported}
          onChange={(v) =>
            onUpdateViewport(
              v ? { renderQualityMode: 'photorealistic', playing: false } : { renderQualityMode: 'interactive' },
            )
          }
        />
      </div>
    </div>
  );
}

/** "View" trigger with its settings popover. */
export function ViewMenu({ align = 'left', ...props }: ViewMenuProps & { align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, [wrapRef], close);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-active={open}
        className={`dc-btn h-9 px-2.5`}
      >
        <Camera size={16} strokeWidth={1.5} />
        <span>View</span>
        <ChevronDown size={14} strokeWidth={1.5} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="View settings"
          className={`dc-popover dc-anim-pop absolute top-[calc(100%+10px)] ${align === 'right' ? 'right-0' : 'left-0'} z-40 w-[min(390px,calc(100vw-24px))] max-h-[calc(100vh-140px)] overflow-y-auto p-4`}
        >
          <ViewSettings {...props} />
        </div>
      )}
    </div>
  );
}
