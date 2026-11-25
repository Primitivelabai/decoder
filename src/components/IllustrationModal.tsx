import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import type { DecoderProject } from '../engine/types';
import { PlateControls, usePlate, type PlateOptions } from './plate';
import { exhibitTitle } from './ui/labels';

interface IllustrationModalProps {
  project: DecoderProject;
  explosion: number;
  /** Carry over the settings from the Plate panel. */
  initialOptions?: PlateOptions;
  onClose: () => void;
}

/** Large plate preview with its controls and downloads. */
export function IllustrationModal({ project, explosion, initialOptions, onClose }: IllustrationModalProps) {
  const plate = usePlate(project, explosion, initialOptions);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Plate"
      className="fixed inset-0 z-50 bg-chrome/80 flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="dc-popover dc-anim-pop w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-ink/8">
          <div>
            <div className="dc-label">Plate</div>
            <h2 className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ink">
              {exhibitTitle(project)}, drawn from the model
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={plate.downloadSvg} className="dc-btn dc-btn-outline h-9 px-3.5 text-ink">
              <Download size={16} strokeWidth={1.5} />
              SVG
            </button>
            <button type="button" onClick={plate.downloadPng} className="dc-btn dc-btn-outline h-9 px-3.5 text-ink">
              <Download size={16} strokeWidth={1.5} />
              PNG
            </button>
            <button type="button" onClick={onClose} aria-label="Close plate" className="dc-btn w-9 h-9 justify-center">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          <div className="lg:w-80 shrink-0 p-5 border-b lg:border-b-0 lg:border-r border-ink/8 overflow-y-auto">
            <PlateControls options={plate.options} update={plate.update} />
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-5 bg-stage flex items-center justify-center">
            <div
              className="w-full max-w-5xl rounded-lg overflow-hidden border border-ink/12 [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
              dangerouslySetInnerHTML={{ __html: plate.svg }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
