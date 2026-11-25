import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, Plus } from 'lucide-react';
import type { ViewportState } from '../../engine/renderer';
import type { DecoderProject, EvaluatedSimulationState } from '../../engine/types';
import { groupBySubsystem } from '../exhibit/PartsPanel';
import { RelationshipGraph } from '../RelationshipGraph';
import { partName } from '../ui/labels';

interface StudioSidebarProps {
  project: DecoderProject;
  viewportState: ViewportState;
  simState: EvaluatedSimulationState | null;
  selectedId: string | null;
  onUpdateViewport: (partial: Partial<ViewportState>) => void;
  onAddPart: () => void;
}

/** Parts grouped by subsystem, or the flow graph. */
export function StudioSidebar({
  project,
  viewportState,
  simState,
  selectedId,
  onUpdateViewport,
  onAddPart,
}: StudioSidebarProps) {
  const [tab, setTab] = useState<'parts' | 'flows'>('parts');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const hidden = viewportState.hiddenComponentIds;

  const toggleGroup = (key: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleHidden = (id: string) =>
    onUpdateViewport({ hiddenComponentIds: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id] });
  const select = (id: string) => onUpdateViewport({ selectedComponentId: id });

  return (
    <aside aria-label="Parts and flows" className="h-full flex flex-col min-h-0 bg-chrome">
      <div
        role="tablist"
        aria-label="Parts and flows"
        className="flex items-center gap-3 px-4 pt-2 border-b border-ink/8"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'parts'}
          onClick={() => setTab('parts')}
          className="dc-tab h-11 px-1"
        >
          Parts <span className="ml-1 text-ink/40">{project.components.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'flows'}
          onClick={() => setTab('flows')}
          className="dc-tab h-11 px-1"
        >
          Flows <span className="ml-1 text-ink/40">{project.relationships.length}</span>
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onAddPart}
          aria-label="Add part"
          title="Add part"
          className="dc-btn w-8 h-8 justify-center"
        >
          <Plus size={16} strokeWidth={1.5} />
        </button>
      </div>

      {tab === 'parts' ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
          {groupBySubsystem(project).map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <section key={group.key} aria-label={group.label} className="pt-3">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-2 h-7 dc-label hover:text-ink/72"
                >
                  <span className="truncate">{group.label}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {group.parts.length}
                    <ChevronDown size={12} strokeWidth={1.5} className={isCollapsed ? '-rotate-90' : ''} />
                  </span>
                </button>
                {!isCollapsed && (
                  <ul className="m-0 p-0 list-none">
                    {group.parts.map((comp) => {
                      const isSel = comp.id === selectedId;
                      const isHidden = hidden.includes(comp.id);
                      return (
                        <li
                          key={comp.id}
                          className={`group flex items-center rounded-full ${isSel ? 'bg-ink/8' : 'hover:bg-ink/5'}`}
                        >
                          <button
                            type="button"
                            aria-current={isSel ? 'true' : undefined}
                            onClick={() => select(comp.id)}
                            className={`flex-1 min-w-0 text-left h-9 px-2.5 truncate ${comp.parentId ? 'pl-5' : ''} ${
                              isHidden ? 'text-ink/40' : isSel ? 'text-ink' : 'text-ink/72'
                            }`}
                          >
                            {partName(comp)}
                          </button>
                          <button
                            type="button"
                            aria-label={`${isHidden ? 'Show' : 'Hide'} ${partName(comp)}`}
                            aria-pressed={isHidden}
                            onClick={() => toggleHidden(comp.id)}
                            className={`w-8 h-8 mr-0.5 grid place-items-center rounded-full text-ink/50 hover:text-ink ${
                              isHidden || isSel
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                            }`}
                          >
                            {isHidden ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <RelationshipGraph
            project={project}
            selectedComponentId={selectedId}
            simState={simState}
            onSelectComponent={select}
            onTraceIn3D={() => onUpdateViewport({ examinationMode: 'relationship_trace', showRelationships: true })}
          />
        </div>
      )}
    </aside>
  );
}
