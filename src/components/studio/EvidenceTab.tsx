import type { ComponentNode, DecoderProject, EvidenceClassification } from '../../engine/types';
import { humanise } from '../ui/labels';
import { Section } from './fields';

const CLASSES: EvidenceClassification[] = ['observed', 'documented', 'inferred', 'illustrative', 'unknown'];

const CLASS_HINTS: Record<EvidenceClassification, string> = {
  observed: 'Seen or measured on a real one.',
  documented: 'Taken from a manual, patent or datasheet.',
  inferred: 'Worked out from how it must behave.',
  illustrative: 'Drawn to explain, not to match a real part.',
  unknown: 'Not yet checked.',
};

interface EvidenceTabProps {
  project: DecoderProject;
  comp: ComponentNode | null;
  onUpdateComponent: (updater: (c: ComponentNode) => ComponentNode) => void;
}

/** How sure we are about the selected part, and where the exhibit's facts come from. */
export function EvidenceTab({ project, comp, onUpdateComponent }: EvidenceTabProps) {
  const sources = project.evidenceSummary.sources ?? [];
  return (
    <div className="flex flex-col">
      {comp && (
        <Section label="This part">
          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-ink/60">How we know</span>
            <select
              value={comp.evidence.classification}
              onChange={(e) =>
                onUpdateComponent((c) => ({
                  ...c,
                  evidence: { ...c.evidence, classification: e.target.value as EvidenceClassification },
                }))
              }
              className="dc-field"
            >
              {CLASSES.map((cls) => (
                <option key={cls} value={cls}>
                  {humanise(cls)}
                </option>
              ))}
            </select>
            <span className="text-[12px] text-ink/50">{CLASS_HINTS[comp.evidence.classification]}</span>
          </label>
          <dl className="m-0 flex flex-col">
            <div className="flex justify-between gap-3 py-1.5 border-b border-ink/8">
              <dt className="text-ink/60">Shape comes from</dt>
              <dd className="m-0 text-ink">{humanise(comp.evidence.geometryProvenance ?? 'procedural')}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1.5">
              <dt className="text-ink/60">Model</dt>
              <dd className="m-0 text-ink">Level {project.simulation.level}</dd>
            </div>
          </dl>
          {comp.evidence.assumptions && comp.evidence.assumptions.length > 0 && (
            <ul className="m-0 pl-4 text-[13px] text-ink/60 flex flex-col gap-1">
              {comp.evidence.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section label={`Exhibit sources · ${sources.length}`}>
        {sources.length === 0 ? (
          <p className="m-0 text-ink/60">No sources listed yet.</p>
        ) : (
          <ul className="m-0 pl-4 text-[13px] text-ink/72 flex flex-col gap-1.5">
            {sources.map((s, i) => (
              <li key={i} className="break-words">
                {s}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {project.simulation.assumptions.length > 0 && (
        <Section label="Model assumptions">
          <ul className="m-0 pl-4 text-[13px] text-ink/60 flex flex-col gap-1.5">
            {project.simulation.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
