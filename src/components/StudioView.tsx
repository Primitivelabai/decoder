import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { GeometryKernel, computeSceneDiagnostics } from '../engine/geometry';
import type { PathTracerStatus } from '../engine/pathtracer';
import type { ViewportState } from '../engine/renderer';
import type { CameraPresetId, ComponentNode, DecoderProject, EvaluatedSimulationState } from '../engine/types';
import { validateProject } from '../engine/validator';
import { useIsWide } from './exhibit/useViewInset';
import { StudioGuide } from './StudioGuide';
import { BehaviourTab } from './studio/BehaviourTab';
import { EvidenceTab } from './studio/EvidenceTab';
import { ShapeTab } from './studio/ShapeTab';
import { StudioSidebar } from './studio/StudioSidebar';
import { Timeline } from './studio/Timeline';
import { ToolRow } from './studio/ToolRow';
import { TourTab } from './studio/TourTab';
import { partName } from './ui/labels';

const GUIDE_SEEN_KEY = 'decoder_studio_guide_seen';

type InspectorTab = 'shape' | 'behaviour' | 'evidence' | 'tour';

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: 'shape', label: 'Shape' },
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'tour', label: 'Tour' },
];

const TOOL_HINT: Record<ViewportState['transformMode'], string> = {
  none: 'press G to move',
  translate: 'drag to move',
  rotate: 'drag to rotate',
  scale: 'drag to scale',
};

function guideSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

interface StudioViewProps {
  project: DecoderProject;
  viewportState: ViewportState;
  parameters: Record<string, number | boolean | string>;
  simState: EvaluatedSimulationState | null;
  pathTracerStatus: PathTracerStatus | null;
  pathTracingSupported: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onMutateProject: (next: DecoderProject) => void;
  onUpdateViewport: (partial: Partial<ViewportState>) => void;
  onUpdateParameter: (id: string, value: number | boolean | string) => void;
  onSeekTime: (time: number) => void;
  onSelectChapter: (idx: number) => void;
  onApplyCameraPreset: (preset: CameraPresetId) => void;
  onImportProject: (proj: DecoderProject) => void;
  onNewProject: () => void;
  /** Saves in this browser; false when storage is unavailable. */
  onSave: () => boolean;
  /** The 3D viewport. */
  children: ReactNode;
}

/** Studio mode: parts on the left, the model in the middle, the inspector on the right, time along the bottom. */
export function StudioView({
  project,
  viewportState,
  parameters,
  simState,
  pathTracerStatus,
  pathTracingSupported,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onMutateProject,
  onUpdateViewport,
  onUpdateParameter,
  onSeekTime,
  onSelectChapter,
  onApplyCameraPreset,
  onImportProject,
  onNewProject,
  onSave,
  children,
}: StudioViewProps) {
  const wide = useIsWide('(min-width: 1024px)');
  const [leftOpen, setLeftOpen] = useState(wide);
  const [rightOpen, setRightOpen] = useState(wide);
  const [tab, setTab] = useState<InspectorTab>('shape');
  const [guideOpen, setGuideOpen] = useState(() => !guideSeen());
  const [notice, setNotice] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const validation = useMemo(() => validateProject(project), [project]);
  const diagnostics = useMemo(() => {
    const k = new GeometryKernel();
    const d = computeSceneDiagnostics(project, k);
    k.dispose();
    return d;
  }, [project]);

  const selectedId = viewportState.selectedComponentId;
  const selected = selectedId ? (project.components.find((c) => c.id === selectedId) ?? null) : null;
  // The inspector always shows a part: the selected one, or the first.
  const inspected = selected ?? project.components[0] ?? null;

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1800);
  };

  const updateComponent = (id: string, updater: (c: ComponentNode) => ComponentNode) => {
    onMutateProject({ ...project, components: project.components.map((c) => (c.id === id ? updater(c) : c)) });
  };

  const addPart = () => {
    const id = `part_${Date.now().toString(36)}`;
    const next: ComponentNode = {
      id,
      name: `New part ${project.components.length + 1}`,
      description: 'A new part.',
      layer: 'internal',
      materialId: project.materials[0]?.id ?? 'default_mat',
      transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      geometry: { type: 'rounded_box', params: { width: 0.4, height: 0.4, depth: 0.4, radius: 0.04 } },
      disassembly: { direction: [0, 1, 0], distance: 1.0, order: project.components.length + 1 },
      evidence: { classification: 'illustrative', geometryProvenance: 'procedural' },
    };
    onMutateProject({ ...project, components: [...project.components, next] });
    onUpdateViewport({ selectedComponentId: id });
    setTab('shape');
  };

  const openFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as DecoderProject;
        const report = validateProject(parsed);
        if (!report.valid) {
          setOpenError(
            report.issues.find((i) => i.severity === 'error')?.message ?? 'That file is not a valid exhibit.',
          );
          return;
        }
        setOpenError(null);
        onImportProject(parsed);
      } catch {
        setOpenError('That file is not a .decoder.json exhibit.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const closeGuide = () => {
    setGuideOpen(false);
    try {
      localStorage.setItem(GUIDE_SEEN_KEY, '1');
    } catch {
      // Storage unavailable: the help simply shows again next visit.
    }
  };

  const sideClass = 'absolute md:static inset-y-0 z-20 shrink-0 min-h-0';

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-chrome">
      <ToolRow
        viewportState={viewportState}
        pathTracerStatus={pathTracerStatus}
        pathTracingSupported={pathTracingSupported}
        onUpdateViewport={onUpdateViewport}
        onApplyCameraPreset={onApplyCameraPreset}
        canUndo={canUndo}
        canRedo={canRedo}
        saveNotice={notice}
        validation={validation}
        diagnostics={diagnostics}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        guideOpen={guideOpen}
        onNew={onNewProject}
        onOpen={() => fileInputRef.current?.click()}
        onSave={() => flash(onSave() ? 'Saved' : 'Could not save')}
        onUndo={onUndo}
        onRedo={onRedo}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
        onToggleGuide={() => (guideOpen ? closeGuide() : setGuideOpen(true))}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.decoder.json"
        onChange={openFile}
        className="hidden"
        aria-label="Open a .decoder.json file"
      />

      <div className="flex-1 flex min-h-0 relative">
        {leftOpen && (
          <div className={`${sideClass} left-0 w-[272px] max-w-[85vw] border-r border-ink/8`}>
            <StudioSidebar
              project={project}
              viewportState={viewportState}
              simState={simState}
              selectedId={selectedId}
              onUpdateViewport={onUpdateViewport}
              onAddPart={addPart}
            />
          </div>
        )}

        <div className="flex-1 relative min-w-0 min-h-0 bg-stage">
          {children}
          {selected && (
            <div className="pointer-events-none absolute top-3 left-4 z-10 flex items-center gap-2 text-[13px] text-ink/72">
              <span className="w-1.5 h-1.5 rounded-full bg-ink" />
              <span>
                {partName(selected)} selected · {TOOL_HINT[viewportState.transformMode]}
              </span>
            </div>
          )}
          {guideOpen && <StudioGuide onClose={closeGuide} />}
          {openError && (
            <div
              role="alert"
              className="absolute z-20 bottom-4 left-1/2 -translate-x-1/2 w-[min(480px,calc(100%-24px))] dc-surface border-l-2 border-l-danger px-4 py-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-ink">Could not open that file</div>
                <p className="m-0 mt-0.5 text-[13px] text-ink/60 break-words">{openError}</p>
              </div>
              <button type="button" onClick={() => setOpenError(null)} className="dc-btn h-8 px-3 text-[13px] shrink-0">
                Dismiss
              </button>
            </div>
          )}
        </div>

        {rightOpen && (
          <aside
            aria-label="Inspector"
            className={`${sideClass} right-0 w-[340px] max-w-[90vw] flex flex-col bg-chrome border-l border-ink/8`}
          >
            <div role="tablist" aria-label="Inspector" className="flex gap-3 px-4 pt-2 border-b border-ink/8 shrink-0">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className="dc-tab h-11 px-1"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="flex-1 min-h-0 overflow-y-auto px-5">
              {tab === 'shape' &&
                (inspected ? (
                  <ShapeTab
                    project={project}
                    comp={inspected}
                    onUpdateComponent={(u) => updateComponent(inspected.id, u)}
                    onMutateProject={onMutateProject}
                  />
                ) : (
                  <p className="py-5 m-0 text-ink/60">No parts yet. Add one with the plus in the parts list.</p>
                ))}
              {tab === 'behaviour' && (
                <BehaviourTab
                  project={project}
                  parameters={parameters}
                  simState={simState}
                  onUpdateParameter={onUpdateParameter}
                />
              )}
              {tab === 'evidence' && (
                <EvidenceTab
                  project={project}
                  comp={inspected}
                  onUpdateComponent={(u) => inspected && updateComponent(inspected.id, u)}
                />
              )}
              {tab === 'tour' && <TourTab project={project} onSelectChapter={onSelectChapter} />}
            </div>
          </aside>
        )}
      </div>

      <Timeline
        project={project}
        viewportState={viewportState}
        simState={simState}
        onUpdateViewport={onUpdateViewport}
        onSeekTime={onSeekTime}
      />
    </div>
  );
}
