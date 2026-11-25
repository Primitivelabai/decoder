import { useMemo, useState } from 'react';
import { triggerBlobDownload } from '../engine/exporters';
import { GeometryKernel } from '../engine/geometry';
import { generateTechnicalIllustrationSVG } from '../engine/illustration';
import type { DecoderProject, IllustrationAesthetic } from '../engine/types';
import { Range, Switch } from './ui/controls';

export type PlateProjection = 'axonometric' | 'front' | 'side' | 'top';

export const PLATE_STYLES: Array<{ id: IllustrationAesthetic; label: string }> = [
  { id: 'patent', label: 'Patent drawing' },
  { id: 'museum_plate', label: 'Museum plate' },
  { id: 'industrial_manual', label: 'Workshop manual' },
  { id: 'scientific_journal', label: 'Journal figure' },
  { id: 'minimal_editorial', label: 'Minimal' },
  { id: 'technical_atlas', label: 'Technical atlas' },
];

export const PLATE_VIEWS: Array<{ id: PlateProjection; label: string }> = [
  { id: 'axonometric', label: '3/4' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
];

export interface PlateOptions {
  aesthetic: IllustrationAesthetic;
  projection: PlateProjection;
  explosion: number;
  showCallouts: boolean;
  showPartsList: boolean;
  showHatching: boolean;
}

export function usePlate(project: DecoderProject, initialExplosion: number, initial?: PlateOptions) {
  const [options, setOptions] = useState<PlateOptions>(
    () =>
      initial ?? {
        aesthetic: 'patent',
        projection: 'axonometric',
        explosion: initialExplosion > 0 ? initialExplosion : 0.25,
        showCallouts: true,
        showPartsList: true,
        showHatching: true,
      },
  );

  const svg = useMemo(() => {
    const kernel = new GeometryKernel();
    const markup = generateTechnicalIllustrationSVG(project, kernel, options);
    kernel.dispose();
    return markup;
  }, [project, options]);

  const update = (patch: Partial<PlateOptions>) => setOptions((o) => ({ ...o, ...patch }));

  const downloadSvg = () => {
    triggerBlobDownload(svg, `${project.id}-${options.aesthetic}.svg`, 'image/svg+xml;charset=utf-8');
  };

  const downloadPng = () => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 1093;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) triggerBlobDownload(blob, `${project.id}-${options.aesthetic}.png`, 'image/png');
        }, 'image/png');
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return { options, update, svg, downloadSvg, downloadPng };
}

/** Style, view, pull-apart and annotation controls for a plate. */
export function PlateControls({
  options,
  update,
  columns = 1,
}: {
  options: PlateOptions;
  update: (patch: Partial<PlateOptions>) => void;
  columns?: 1 | 2;
}) {
  return (
    <div className={`grid gap-x-6 gap-y-4 ${columns === 2 ? 'md:grid-cols-2' : ''}`}>
      <div>
        <label htmlFor="plate-style" className="dc-label block mb-2">
          Style
        </label>
        <select
          id="plate-style"
          value={options.aesthetic}
          onChange={(e) => update({ aesthetic: e.target.value as IllustrationAesthetic })}
          className="dc-field"
        >
          {PLATE_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className="dc-label mb-2">View</div>
        <div
          role="radiogroup"
          aria-label="Plate view"
          className="grid grid-cols-4 gap-0.5 p-[3px] border border-ink/12 rounded-lg"
        >
          {PLATE_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={options.projection === v.id}
              onClick={() => update({ projection: v.id })}
              className="dc-btn h-8 justify-center text-[12px]"
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="plate-explode" className="dc-label">
            Pull apart
          </label>
          <span className="text-[12px] font-mono tabular-nums">{Math.round(options.explosion * 100)}%</span>
        </div>
        <Range
          id="plate-explode"
          label="Pull apart"
          min={0}
          max={1}
          step={0.05}
          value={options.explosion}
          onChange={(v) => update({ explosion: v })}
          className="w-full"
        />
      </div>
      <div className="flex flex-col">
        {(
          [
            ['showCallouts', 'Callouts'],
            ['showPartsList', 'Parts list'],
            ['showHatching', 'Hatching'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between h-10 border-b border-ink/8 last:border-b-0">
            <span>{label}</span>
            <Switch label={label} checked={options[key]} onChange={(v) => update({ [key]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}
