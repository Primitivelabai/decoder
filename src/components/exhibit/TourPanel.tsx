import { Play, Square } from 'lucide-react';
import type { DecoderProject } from '../../engine/types';
import { SidePanel } from '../ui/controls';

interface TourPanelProps {
  project: DecoderProject;
  activeIndex: number | null;
  onSelectChapter: (index: number | null) => void;
  onClose: () => void;
  className?: string;
}

/** Every tour step at a glance. Picking one moves the camera and the model to that step. */
export function TourPanel({ project, activeIndex, onSelectChapter, onClose, className }: TourPanelProps) {
  const total = project.chapters.length;
  const running = activeIndex !== null;
  return (
    <SidePanel
      label="Tour"
      eyebrow={`Tour · ${total} ${total === 1 ? 'step' : 'steps'}`}
      title="Walk through it one step at a time."
      onClose={onClose}
      className={className}
      footer={
        total > 0 && (
          <button
            type="button"
            onClick={() => onSelectChapter(running ? null : 0)}
            className="dc-btn dc-btn-outline h-9 px-3.5 text-ink"
          >
            {running ? <Square size={14} strokeWidth={1.5} /> : <Play size={14} strokeWidth={1.5} />}
            <span>{running ? 'Hide the tour' : 'Start the tour'}</span>
          </button>
        )
      }
    >
      {total === 0 ? (
        <p className="pt-4 text-ink/60">This exhibit has no tour yet. Add steps in the Studio.</p>
      ) : (
        <ol className="m-0 p-0 list-none flex flex-col">
          {project.chapters.map((ch, i) => {
            const on = activeIndex === i;
            return (
              <li key={ch.id} className="border-b border-ink/8 last:border-b-0">
                <button
                  type="button"
                  aria-current={on ? 'step' : undefined}
                  onClick={() => onSelectChapter(i)}
                  className="w-full text-left py-3.5 flex gap-3 group"
                >
                  <span
                    className={`mt-0.5 w-6 h-6 shrink-0 rounded-full grid place-items-center font-mono text-[11px] border ${
                      on ? 'bg-ink border-ink text-chrome' : 'border-ink/18 text-ink/60'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-ink group-hover:underline decoration-ink/30">{ch.title}</span>
                    <span className="block mt-0.5 text-[13px] text-ink/60 line-clamp-2">{ch.narration}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </SidePanel>
  );
}
