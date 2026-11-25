import type { DecoderProject } from '../../engine/types';
import { Section } from './fields';

/** The tour's steps in order. Picking one plays it in the viewport. */
export function TourTab({
  project,
  onSelectChapter,
}: {
  project: DecoderProject;
  onSelectChapter: (index: number) => void;
}) {
  return (
    <Section label={`Steps · ${project.chapters.length}`}>
      {project.chapters.length === 0 ? (
        <p className="m-0 text-ink/60">No tour steps. Add chapters in the .decoder.json file.</p>
      ) : (
        <ol className="m-0 p-0 list-none flex flex-col">
          {project.chapters.map((ch, i) => (
            <li key={ch.id} className="border-b border-ink/8 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelectChapter(i)}
                className="w-full text-left py-3 flex gap-3 group"
              >
                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full grid place-items-center font-mono text-[11px] border border-ink/18 text-ink/60">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-ink group-hover:underline decoration-ink/30">{ch.title}</span>
                  <span className="block mt-0.5 text-[13px] text-ink/60">{ch.narration}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
