import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DecoderProject, EvaluatedSimulationState } from '../../engine/types';
import { CATEGORY_LABELS, evidenceTag, splitReadout } from '../ui/labels';

interface ExhibitSummaryProps {
  project: DecoderProject;
  simState: EvaluatedSimulationState | null;
}

/** What is this: domain and evidence, title, one-line summary, live readouts. */
export function ExhibitSummary({ project, simState }: ExhibitSummaryProps) {
  const outputs = simState?.outputs ?? [];
  const cols = Math.min(3, Math.max(1, outputs.length));
  return (
    <section
      aria-label="Exhibit summary"
      className="flex flex-col gap-2.5 md:gap-3.5 pointer-events-auto max-md:bg-panel max-md:border max-md:border-ink/12 max-md:rounded-xl max-md:p-3"
    >
      <div className="flex flex-wrap gap-2 items-center">
        <span className="dc-label">{CATEGORY_LABELS[project.category]}</span>
        <span className="text-[11px] px-2 py-0.5 rounded-md border border-ink/18 text-ink/72">
          {evidenceTag(project.evidenceSummary.classification, project.simulation.level)}
        </span>
      </div>
      <h1 className="m-0 font-bold text-[22px] md:text-[28px] leading-[1.08] tracking-[-0.035em] text-ink">
        {project.title}
      </h1>
      <p className="m-0 text-ink/60 max-w-[34ch] hidden sm:block">{project.summary}</p>
      {outputs.length > 0 && (
        <dl
          aria-live="off"
          className="mt-0 sm:mt-2 grid border-t border-ink/12"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {outputs.map((out, i) => {
            const { value, unit } = splitReadout(out.formatted, out.unit);
            const col = i % cols;
            return (
              <div
                key={out.id}
                className={`pt-3 flex flex-col justify-between ${col === 0 ? 'pr-3' : col === cols - 1 ? 'pl-3' : 'px-3'} ${col > 0 ? 'border-l border-ink/12' : ''}`}
              >
                <dt className="dc-label leading-[1.4]">{out.label}</dt>
                <dd className="mt-1 m-0 whitespace-nowrap font-mono text-[18px] text-ink tracking-[-0.02em] tabular-nums">
                  {value}
                  {unit && <span className="text-[12px] text-ink/50">{unit === '°' ? unit : ` ${unit}`}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

interface TourStepProps {
  project: DecoderProject;
  index: number;
  onSelectChapter: (index: number) => void;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** The current tour step with progress, and previous / next. */
export function TourStep({ project, index, onSelectChapter }: TourStepProps) {
  const total = project.chapters.length;
  const chapter = project.chapters[index];
  if (!chapter) return null;
  const next = project.chapters[index + 1];
  return (
    <section
      aria-label="Tour"
      className="pointer-events-auto max-md:bg-panel max-md:border max-md:border-ink/12 max-md:rounded-xl max-md:p-3"
    >
      <div className="grid gap-1 mb-3.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {project.chapters.map((ch, i) => (
          <button
            key={ch.id}
            type="button"
            aria-label={`Step ${i + 1}: ${ch.title}`}
            aria-current={i === index ? 'step' : undefined}
            onClick={() => onSelectChapter(i)}
            className="h-3 flex items-center"
          >
            <span className={`block w-full h-0.5 rounded-sm ${i <= index ? 'bg-accent' : 'bg-ink/18'}`} />
          </button>
        ))}
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[12px] text-ink/50 shrink-0">
          {index + 1} of {total}
        </span>
        <h2 className="m-0 font-semibold text-[18px] tracking-[-0.02em] text-ink">{chapter.title}</h2>
      </div>
      <p className="mt-1.5 mb-3 text-ink/72 max-md:text-[13px] max-md:line-clamp-2">{chapter.narration}</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-label="Previous step"
          disabled={index === 0}
          onClick={() => onSelectChapter(index - 1)}
          className="dc-btn dc-btn-outline w-9 h-9 justify-center"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => onSelectChapter(next ? index + 1 : 0)}
          className="dc-btn dc-btn-outline h-9 px-3 text-ink min-w-0"
        >
          <span className="truncate">{next ? `Next: ${lowerFirst(next.title)}` : 'Back to the start'}</span>
          <ChevronRight size={16} strokeWidth={1.5} className="shrink-0" />
        </button>
      </div>
    </section>
  );
}
