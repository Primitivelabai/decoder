import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Focus, GitBranch, ScanSearch } from 'lucide-react';
import { getComponentRelationships } from '../../engine/relationships';
import type { ViewportState } from '../../engine/renderer';
import type {
  CameraPresetId,
  ComponentNode,
  DecoderProject,
  EvaluatedSimulationState,
  RelationshipSpec,
} from '../../engine/types';
import { linkQuantity } from '../flows';
import { NoteBox, SidePanel } from '../ui/controls';
import { evidenceTag, humanise, partName, RELATIONSHIP_LABELS, subsystemLabel } from '../ui/labels';

interface PartsPanelProps {
  project: DecoderProject;
  viewportState: ViewportState;
  simState: EvaluatedSimulationState | null;
  onUpdateViewport: (partial: Partial<ViewportState>) => void;
  onApplyCameraPreset: (preset: CameraPresetId) => void;
  onOpenFlows: () => void;
  onClose: () => void;
  className?: string;
}

/** Parts grouped by subsystem, in exhibit order. */
export function groupBySubsystem(
  project: DecoderProject,
): Array<{ key: string; label: string; parts: ComponentNode[] }> {
  const groups = new Map<string, ComponentNode[]>();
  for (const comp of project.components) {
    const key = comp.subsystem ?? 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(comp);
  }
  return Array.from(groups, ([key, parts]) => ({ key, label: subsystemLabel(project, key), parts }));
}

function PartList({ project, onSelect }: { project: DecoderProject; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col">
      {groupBySubsystem(project).map((group) => (
        <section key={group.key} aria-label={group.label} className="pt-4">
          <div className="dc-label flex justify-between pb-1.5">
            <span>{group.label}</span>
            <span>{group.parts.length}</span>
          </div>
          <ul className="m-0 p-0 list-none">
            {group.parts.map((comp) => (
              <li key={comp.id}>
                <button
                  type="button"
                  onClick={() => onSelect(comp.id)}
                  className="dc-btn w-[calc(100%+16px)] h-10 px-2 -mx-2 justify-between text-ink"
                >
                  <span className="truncate">{partName(comp)}</span>
                  <ChevronRight size={14} strokeWidth={1.5} className="text-ink/40 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LinkRow({
  rel,
  direction,
  other,
  simState,
  onSelect,
}: {
  rel: RelationshipSpec;
  direction: 'in' | 'out';
  other: ComponentNode | undefined;
  simState: EvaluatedSimulationState | null;
  onSelect: () => void;
}) {
  const qty = linkQuantity(rel, simState);
  const Arrow = direction === 'in' ? ArrowLeft : ArrowRight;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left flex flex-col gap-0.5 py-2.5 border-b border-ink/8 last:border-b-0 hover:bg-ink/3 rounded-sm"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0 text-ink">
          <Arrow size={14} strokeWidth={1.5} className="text-ink/50 shrink-0" />
          <span className="truncate">{other ? partName(other) : direction === 'in' ? rel.sourceId : rel.targetId}</span>
        </span>
        <span className="text-[12px] text-ink/50 shrink-0">
          {RELATIONSHIP_LABELS[rel.type]}
          {qty && <span className="font-mono text-ink/72"> · {qty}</span>}
        </span>
      </span>
      {(rel.mechanism ?? rel.label) && (
        <span className="pl-[22px] text-[12px] text-ink/60">{rel.mechanism ?? rel.label}</span>
      )}
    </button>
  );
}

function PartDetail({
  project,
  comp,
  viewportState,
  simState,
  onUpdateViewport,
  onApplyCameraPreset,
  onOpenFlows,
}: Omit<PartsPanelProps, 'onClose' | 'className'> & { comp: ComponentNode }) {
  const material = comp.materialId ? project.materials.find((m) => m.id === comp.materialId) : undefined;
  const links = getComponentRelationships(project, comp.id);
  const compMap = new Map(project.components.map((c) => [c.id, c]));
  const isolated = viewportState.examinationMode === 'isolated';
  const tracing = viewportState.examinationMode === 'relationship_trace';
  const specs = [
    ...(comp.keySpecs ?? []),
    ...Object.entries(comp.evidence.knownDimensions ?? {}).map(([label, value]) => ({ label: humanise(label), value })),
  ];

  return (
    <div className="flex flex-col gap-[18px] pt-4">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={isolated}
          onClick={() => onUpdateViewport({ examinationMode: isolated ? 'assembled' : 'isolated' })}
          className="dc-btn dc-btn-outline h-8 px-3 text-[13px]"
        >
          <Focus size={14} strokeWidth={1.5} />
          {isolated ? 'Show all' : 'Isolate'}
        </button>
        <button
          type="button"
          onClick={() => onApplyCameraPreset('macro')}
          className="dc-btn dc-btn-outline h-8 px-3 text-[13px]"
        >
          <ScanSearch size={14} strokeWidth={1.5} />
          Close-up
        </button>
        <button
          type="button"
          aria-pressed={tracing}
          onClick={() =>
            onUpdateViewport({
              examinationMode: tracing ? 'assembled' : 'relationship_trace',
              showRelationships: true,
            })
          }
          className="dc-btn dc-btn-outline h-8 px-3 text-[13px]"
        >
          <GitBranch size={14} strokeWidth={1.5} />
          {tracing ? 'Stop tracing' : 'Trace links'}
        </button>
      </div>

      <p className="m-0 text-ink/72">{comp.description}</p>

      {comp.workingPrinciple && (
        <div>
          <div className="dc-label mb-1.5">How it works</div>
          <p className="m-0 text-ink/72">{comp.workingPrinciple}</p>
        </div>
      )}

      {(material || comp.materialRationale || specs.length > 0) && (
        <div>
          <div className="dc-label mb-1.5">Material and specs</div>
          {material && (
            <div className="flex items-center gap-2.5 py-1.5">
              <span
                className="w-3.5 h-3.5 rounded-[3px] border border-ink/18 shrink-0"
                style={{ backgroundColor: material.color ?? '#8a8f98' }}
              />
              <span className="text-ink truncate">{material.name}</span>
              <span className="ml-auto text-[12px] text-ink/50 shrink-0">{humanise(material.preset)}</span>
            </div>
          )}
          {comp.materialRationale && <p className="mt-1 mb-0 text-[13px] text-ink/60">{comp.materialRationale}</p>}
          {specs.length > 0 && (
            <dl className="mt-2 mb-0 flex flex-col">
              {specs.map((sp, i) => (
                <div key={i} className="flex justify-between gap-3 py-1.5 border-b border-ink/8 last:border-b-0">
                  <dt className="text-ink/60">{sp.label}</dt>
                  <dd className="m-0 font-mono text-[13px] text-ink text-right">{sp.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {comp.failureMode && (
        <NoteBox tone="plain">
          <div className="text-ink">Limit</div>
          <p className="mt-1 mb-0 text-[13px] text-ink/60">{comp.failureMode}</p>
        </NoteBox>
      )}

      {comp.evidence.assumptions && comp.evidence.assumptions.length > 0 && (
        <NoteBox tone="model">
          <div className="text-ink">Model note</div>
          <p className="mt-1 mb-0 text-[13px] text-ink/60">{comp.evidence.assumptions[0]}</p>
        </NoteBox>
      )}

      {(links.incoming.length > 0 || links.outgoing.length > 0) && (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="dc-label">Links</span>
            <button
              type="button"
              onClick={onOpenFlows}
              className="text-[12px] text-ink/60 hover:text-ink underline decoration-ink/20"
            >
              See all flows
            </button>
          </div>
          {links.incoming.map((r) => {
            const otherId = r.sourceId === comp.id ? r.targetId : r.sourceId;
            return (
              <LinkRow
                key={`in-${r.id}`}
                rel={r}
                direction="in"
                other={compMap.get(otherId)}
                simState={simState}
                onSelect={() => onUpdateViewport({ selectedComponentId: otherId })}
              />
            );
          })}
          {links.outgoing.map((r) => {
            const otherId = r.targetId === comp.id ? r.sourceId : r.targetId;
            return (
              <LinkRow
                key={`out-${r.id}`}
                rel={r}
                direction="out"
                other={compMap.get(otherId)}
                simState={simState}
                onSelect={() => onUpdateViewport({ selectedComponentId: otherId })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Browse every part, or read about the selected one. */
export function PartsPanel(props: PartsPanelProps) {
  const { project, viewportState, onUpdateViewport, onClose, className } = props;
  const count = project.components.length;
  const index = viewportState.selectedComponentId
    ? project.components.findIndex((c) => c.id === viewportState.selectedComponentId)
    : -1;
  const comp = index >= 0 ? project.components[index] : null;
  const step = (delta: number) => {
    if (count === 0) return;
    const next = ((index >= 0 ? index : 0) + delta + count) % count;
    onUpdateViewport({ selectedComponentId: project.components[next].id });
  };

  if (!comp) {
    return (
      <SidePanel
        label="Parts"
        eyebrow={`Parts · ${count}`}
        title="Every piece, by what it does."
        onClose={onClose}
        className={className}
      >
        <PartList project={project} onSelect={(id) => onUpdateViewport({ selectedComponentId: id })} />
      </SidePanel>
    );
  }

  return (
    <SidePanel
      label="Parts"
      eyebrow={
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onUpdateViewport({ selectedComponentId: null })}
            className="hover:text-ink underline decoration-ink/20"
          >
            Parts
          </button>
          <span aria-hidden="true">/</span>
          <span>{subsystemLabel(project, comp.subsystem)}</span>
        </span>
      }
      title={comp.name}
      onClose={onClose}
      className={className}
      toolbar={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-ink/60 truncate">
            {humanise(comp.layer ?? 'component')} · {evidenceTag(comp.evidence.classification)}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label="Previous part"
              onClick={() => step(-1)}
              className="dc-btn w-8 h-8 justify-center"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <span className="font-mono text-[12px] text-ink/50 tabular-nums">
              {index + 1} / {count}
            </span>
            <button
              type="button"
              aria-label="Next part"
              onClick={() => step(1)}
              className="dc-btn w-8 h-8 justify-center"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </span>
        </div>
      }
    >
      <PartDetail {...props} comp={comp} />
    </SidePanel>
  );
}
