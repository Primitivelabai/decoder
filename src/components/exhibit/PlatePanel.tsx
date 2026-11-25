import { Download, Maximize2 } from 'lucide-react';
import type { DecoderProject } from '../../engine/types';
import { PlateControls, usePlate, type PlateOptions } from '../plate';
import { SidePanel } from '../ui/controls';

interface PlatePanelProps {
  project: DecoderProject;
  explosion: number;
  onOpenLarge: (options: PlateOptions) => void;
  onClose: () => void;
  className?: string;
}

/** A printable technical drawing of the exhibit, drawn from the model. */
export function PlatePanel({ project, explosion, onOpenLarge, onClose, className }: PlatePanelProps) {
  const plate = usePlate(project, explosion);
  return (
    <SidePanel
      label="Plate"
      eyebrow="Plate"
      title="A drawing you can print."
      onClose={onClose}
      className={className}
      footer={
        <>
          <button type="button" onClick={plate.downloadSvg} className="dc-btn dc-btn-outline h-9 px-3.5">
            <Download size={16} strokeWidth={1.5} />
            <span>SVG</span>
          </button>
          <button type="button" onClick={plate.downloadPng} className="dc-btn dc-btn-outline h-9 px-3.5">
            <Download size={16} strokeWidth={1.5} />
            <span>PNG</span>
          </button>
        </>
      }
    >
      <button
        type="button"
        onClick={() => onOpenLarge(plate.options)}
        aria-label="Open the plate large"
        className="group relative block w-full mt-4 mb-5 rounded-lg overflow-hidden border border-ink/12 hover:border-ink/28 transition-colors"
      >
        <div
          className="pointer-events-none [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
          dangerouslySetInnerHTML={{ __html: plate.svg }}
        />
        <span className="absolute right-2 bottom-2 dc-surface rounded-full h-8 px-3 flex items-center gap-1.5 text-[12px] text-ink opacity-90 group-hover:opacity-100">
          <Maximize2 size={14} strokeWidth={1.5} />
          Open large
        </span>
      </button>
      <PlateControls options={plate.options} update={plate.update} />
    </SidePanel>
  );
}
