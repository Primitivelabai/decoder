import { Fragment, useMemo, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import type { DecoderProject, EvaluatedSimulationState } from '../../engine/types';
import { FlowKey } from '../FlowKey';
import { findLoops, findMainPath, linkQuantity, relationshipTypesIn, type FlowFilter } from '../flows';
import { FlowFilterChips } from '../RelationshipGraph';
import { NoteBox, SidePanel } from '../ui/controls';
import { lineBorder, partName, RELATIONSHIP_LABELS, RELATIONSHIP_LINE } from '../ui/labels';

interface FlowsPanelProps {
  project: DecoderProject;
  simState: EvaluatedSimulationState | null;
  selectedComponentId: string | null;
  onSelectComponent: (id: string) => void;
  onOpenGraph: (filter: FlowFilter) => void;
  onClose: () => void;
  className?: string;
}

const INK = 'rgba(245,245,245,.5)';

/** Keeps acronyms ("CPU core") but lowers ordinary words ("Brass boiler" → "brass boiler"). */
function lowerFirst(s: string): string {
  return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}
const ACCENT = 'var(--dc-accent)';

/** What pushes what: the main path through the exhibit, its feedback loops and a key. */
export function FlowsPanel({
  project,
  simState,
  selectedComponentId,
  onSelectComponent,
  onOpenGraph,
  onClose,
  className,
}: FlowsPanelProps) {
  const [filter, setFilter] = useState<FlowFilter>('all');
  const loops = useMemo(() => findLoops(project, filter), [project, filter]);
  const path = useMemo(() => findMainPath(project, filter), [project, filter]);
  const compMap = useMemo(() => new Map(project.components.map((c) => [c.id, c])), [project]);
  const name = (id: string) => {
    const c = compMap.get(id);
    return c ? partName(c) : id;
  };
  const loopCount = loops.cycles.length;

  return (
    <SidePanel
      label="Flows"
      eyebrow={`Flows · ${project.relationships.length} links`}
      title="What pushes what."
      onClose={onClose}
      className={className}
      toolbar={<FlowFilterChips project={project} value={filter} onChange={setFilter} />}
      footer={
        <button type="button" onClick={() => onOpenGraph(filter)} className="dc-btn dc-btn-outline h-9 px-3.5">
          <Maximize2 size={16} strokeWidth={1.5} />
          <span>Open full graph</span>
        </button>
      }
    >
      <div className="dc-label pt-3 pb-1.5">Main path</div>
      {path.nodeIds.length < 2 ? (
        <p className="m-0 text-ink/60">No chain of links of this kind.</p>
      ) : (
        <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] gap-x-3 items-center">
          {path.nodeIds.map((id, i) => {
            const link = path.links[i];
            const inLoop = loops.nodeIds.has(id);
            const selected = id === selectedComponentId;
            return (
              <Fragment key={`${id}-${i}`}>
                <span
                  aria-hidden="true"
                  className={`w-[9px] h-[9px] rounded-full justify-self-center ${inLoop ? 'bg-accent' : 'border-[1.5px] border-ink/72'}`}
                />
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectComponent(id)}
                  className="dc-btn h-9 px-2 -ml-2 text-ink justify-self-start max-w-full"
                >
                  <span className="truncate">{name(id)}</span>
                </button>
                <span />
                {link && (
                  <>
                    <span
                      aria-hidden="true"
                      className="w-0 h-[22px] justify-self-center"
                      style={{
                        borderLeft: lineBorder(RELATIONSHIP_LINE[link.type], loops.relIds.has(link.id) ? ACCENT : INK),
                      }}
                    />
                    <span className="text-[12px] text-ink/50 truncate">
                      {RELATIONSHIP_LABELS[link.type].toLowerCase()}
                    </span>
                    <span className="font-mono text-[12px] text-ink/60">{linkQuantity(link, simState) ?? ''}</span>
                  </>
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      {loopCount > 0 && (
        <NoteBox tone="accent" className="mt-[18px]">
          <div className="text-ink">
            {loopCount} feedback {loopCount === 1 ? 'loop' : 'loops'}
          </div>
          <p className="mt-1 mb-0 text-[13px] text-ink/60">
            {loops.backLinks.length > 0
              ? `${loops.backLinks
                  .slice(0, 2)
                  .map(
                    (r) => `The ${lowerFirst(name(r.sourceId))} feeds back into the ${lowerFirst(name(r.targetId))}.`,
                  )
                  .join(' ')} Each loop settles itself. Highlighted in pink.`
              : 'Some parts feed back into the ones that drive them. Highlighted in pink.'}
          </p>
        </NoteBox>
      )}

      <div className="mt-[18px] flex flex-col gap-2">
        <div className="dc-label">Key</div>
        <FlowKey types={relationshipTypesIn(project)} showLoop={loopCount > 0} />
      </div>
    </SidePanel>
  );
}
