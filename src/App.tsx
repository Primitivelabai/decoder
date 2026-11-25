import { useCallback, useEffect, useRef, useState } from 'react';
import { ExhibitView } from './components/ExhibitView';
import { ExportModal } from './components/ExportModal';
import { IllustrationModal } from './components/IllustrationModal';
import { PartFinder } from './components/PartFinder';
import { StudioView } from './components/StudioView';
import { TopBar, type AppMode } from './components/TopBar';
import { ViewportCanvas } from './components/ViewportCanvas';
import { LIGHTING_PRESETS } from './engine/materials';
import type { PathTracerStatus } from './engine/pathtracer';
import type { DecoderViewport, ViewportState } from './engine/renderer';
import { createProjectTemplate } from './engine/schema';
import type { CameraPose, CameraPresetId, DecoderProject, EvaluatedSimulationState, Vec3 } from './engine/types';
import { BUILTIN_EXHIBITS } from './projects/index';

function getDefaultsForProject(proj: DecoderProject): Record<string, number | boolean | string> {
  const map: Record<string, number | boolean | string> = {};
  for (const p of proj.parameters) {
    map[p.id] = p.defaultValue;
  }
  return map;
}

export default function App() {
  const [exhibits, setExhibits] = useState<DecoderProject[]>(() => BUILTIN_EXHIBITS);
  const [activeId, setActiveId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const req = params.get('exhibit');
    if (req && BUILTIN_EXHIBITS.some((e) => e.id === req)) return req;
    return BUILTIN_EXHIBITS[0].id;
  });

  const [mode, setMode] = useState<AppMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'studio' ? 'studio' : 'exhibit';
  });

  const currentProject = exhibits.find((e) => e.id === activeId) ?? exhibits[0];

  // Undo / Redo stacks for Studio edits
  const [undoStack, setUndoStack] = useState<DecoderProject[]>([]);
  const [redoStack, setRedoStack] = useState<DecoderProject[]>([]);

  const [viewportState, setViewportState] = useState<ViewportState>(() => ({
    explosion: 0,
    examinationMode: 'assembled',
    section: { enabled: false, axis: 'x', position: 0 },
    playing: true,
    playbackSpeed: 1,
    time: 0,
    selectedComponentId: null,
    highlightedComponentIds: [],
    hiddenComponentIds: [],
    isolatedLayer: null,
    lightingPreset: currentProject.lightingPreset,
    showEffects: true,
    showRelationships: false,
    transformMode: 'none',
    renderQualityMode: 'interactive',
    cameraProjection: 'perspective',
    exposure: LIGHTING_PRESETS[currentProject.lightingPreset]?.exposure ?? 1.08,
    enableAO: true,
    enableDof: false,
  }));

  const [parameters, setParameters] = useState<Record<string, number | boolean | string>>(() =>
    getDefaultsForProject(currentProject),
  );
  const [simState, setSimState] = useState<EvaluatedSimulationState | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number | null>(0);
  const [cameraCommand, setCameraCommand] = useState<{ pose: CameraPose; seq: number } | null>(null);
  const [cameraPresetCommand, setCameraPresetCommand] = useState<{ preset: CameraPresetId; seq: number } | null>(null);
  const [seekCommand, setSeekCommand] = useState<{ time: number; seq: number } | null>(null);
  const [pathTracerStatus, setPathTracerStatus] = useState<PathTracerStatus | null>(null);
  const [pathTracingSupported, setPathTracingSupported] = useState(false);

  const [showIllustration, setShowIllustration] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showFinder, setShowFinder] = useState(false);
  /** The last saved copy of each exhibit, so the studio can say whether there are unsaved changes. */
  const [saved, setSaved] = useState<Record<string, { project: DecoderProject; at: number }>>({});
  const [now, setNow] = useState(() => Date.now());

  const viewportRef = useRef<DecoderViewport | null>(null);

  const updateViewport = useCallback((partial: Partial<ViewportState>) => {
    setViewportState((prev) => ({ ...prev, ...partial }));
  }, []);

  const applyCameraPreset = useCallback((preset: CameraPresetId) => {
    setCameraPresetCommand((c) => ({ preset, seq: (c?.seq ?? 0) + 1 }));
  }, []);

  const switchExhibit = useCallback(
    (nextId: string) => {
      const found = exhibits.find((e) => e.id === nextId);
      if (!found) return;
      setActiveId(nextId);
      setUndoStack([]);
      setRedoStack([]);
      setParameters(getDefaultsForProject(found));
      setActiveChapterIndex(found.chapters.length > 0 ? 0 : null);
      setViewportState((prev) => ({
        ...prev,
        explosion: 0,
        examinationMode: 'assembled',
        section: { enabled: false, axis: 'x', position: 0 },
        playing: true,
        selectedComponentId: null,
        highlightedComponentIds: [],
        hiddenComponentIds: [],
        isolatedLayer: null,
        lightingPreset: found.lightingPreset,
        transformMode: 'none',
        renderQualityMode: 'interactive',
        exposure: LIGHTING_PRESETS[found.lightingPreset]?.exposure ?? 1.08,
      }));
      setCameraCommand((c) => ({ pose: found.defaultCamera, seq: (c?.seq ?? 0) + 1 }));
    },
    [exhibits],
  );

  const mutateCurrentProject = useCallback(
    (next: DecoderProject) => {
      setUndoStack((u) => [...u.slice(-24), currentProject]);
      setRedoStack([]);
      setExhibits((list) => list.map((p) => (p.id === currentProject.id ? next : p)));
    },
    [currentProject],
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, currentProject]);
    setExhibits((list) => list.map((p) => (p.id === currentProject.id ? prev : p)));
  }, [undoStack, currentProject]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, currentProject]);
    setExhibits((list) => list.map((p) => (p.id === currentProject.id ? next : p)));
  }, [redoStack, currentProject]);

  const handleSelectChapter = useCallback(
    (idx: number | null) => {
      setActiveChapterIndex(idx);
      if (idx === null) return;
      const ch = currentProject.chapters[idx];
      if (!ch) return;

      setCameraCommand((c) => ({ pose: ch.camera, seq: (c?.seq ?? 0) + 1 }));
      setViewportState((prev) => ({
        ...prev,
        explosion: ch.explosion,
        examinationMode: ch.examinationMode ?? (ch.explosion > 0.05 ? 'exploded' : 'assembled'),
        highlightedComponentIds: ch.highlightedComponentIds ?? [],
        hiddenComponentIds: ch.hiddenComponentIds ?? [],
        playing: ch.playing ?? prev.playing,
        showRelationships:
          (ch.highlightedRelationshipIds?.length ?? 0) > 0 || ch.examinationMode === 'relationship_trace',
      }));
      if (ch.parameterOverrides) {
        setParameters((p) => ({ ...p, ...ch.parameterOverrides }));
      }
    },
    [currentProject],
  );

  const handleTransformChange = useCallback(
    (componentId: string, pos: Vec3, rot: Vec3, scale: Vec3) => {
      setExhibits((list) =>
        list.map((p) =>
          p.id !== currentProject.id
            ? p
            : {
                ...p,
                components: p.components.map((c) =>
                  c.id === componentId ? { ...c, transform: { position: pos, rotation: rot, scale } } : c,
                ),
              },
        ),
      );
    },
    [currentProject.id],
  );

  const handleImportProject = useCallback((proj: DecoderProject) => {
    setExhibits((list) => {
      const exists = list.some((p) => p.id === proj.id);
      return exists ? list.map((p) => (p.id === proj.id ? proj : p)) : [proj, ...list];
    });
    setActiveId(proj.id);
    setParameters(getDefaultsForProject(proj));
    setCameraCommand((c) => ({ pose: proj.defaultCamera, seq: (c?.seq ?? 0) + 1 }));
  }, []);

  const handleNewProject = useCallback(() => {
    const id = `custom_${Date.now().toString(36)}`;
    const proj = createProjectTemplate(id, 'New exhibit');
    setExhibits((list) => [proj, ...list]);
    setActiveId(proj.id);
    setParameters(getDefaultsForProject(proj));
    setCameraCommand((c) => ({ pose: proj.defaultCamera, seq: (c?.seq ?? 0) + 1 }));
  }, []);

  const resetCamera = useCallback(() => {
    setCameraCommand((c) => ({ pose: currentProject.defaultCamera, seq: (c?.seq ?? 0) + 1 }));
  }, [currentProject]);

  const changeMode = useCallback(
    (next: AppMode) => {
      setMode(next);
      if (next === 'exhibit') updateViewport({ transformMode: 'none' });
    },
    [updateViewport],
  );

  const handleSave = useCallback((): boolean => {
    try {
      localStorage.setItem(`decoder_project_${currentProject.id}`, JSON.stringify(currentProject));
      const at = Date.now();
      setSaved((s) => ({ ...s, [currentProject.id]: { project: currentProject, at } }));
      setNow(at);
      return true;
    } catch {
      return false;
    }
  }, [currentProject]);

  // Keep "saved 2 min ago" current while the studio is open.
  useEffect(() => {
    if (mode !== 'studio') return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [mode]);

  const savedEntry = saved[currentProject.id];
  let editingStatus = 'Editing · not saved yet';
  if (savedEntry && savedEntry.project !== currentProject) editingStatus = 'Editing · unsaved changes';
  else if (savedEntry) {
    const mins = Math.floor((now - savedEntry.at) / 60_000);
    editingStatus = mins < 1 ? 'Editing · saved just now' : `Editing · saved ${mins} min ago`;
  }

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowFinder((v) => !v);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;

      if (e.code === 'Space' && !mod) {
        if (target?.closest('button, a, [role="slider"], [role="switch"], [role="option"]')) return;
        e.preventDefault();
        setViewportState((prev) => ({ ...prev, playing: !prev.playing }));
      } else if (mod && e.key.toLowerCase() === 'z') {
        if (mode !== 'studio') return;
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (mode === 'studio' && !mod && !e.altKey) {
        const tools: Record<string, ViewportState['transformMode']> = {
          v: 'none',
          g: 'translate',
          r: 'rotate',
          s: 'scale',
        };
        const tool = tools[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          setViewportState((prev) => ({ ...prev, transformMode: tool }));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, mode]);

  const canvasElement = (
    <ViewportCanvas
      project={currentProject}
      viewportState={viewportState}
      parameters={parameters}
      cameraCommand={cameraCommand}
      cameraPresetCommand={cameraPresetCommand}
      seekCommand={seekCommand}
      viewportRef={viewportRef}
      onSelectComponent={(id) => updateViewport({ selectedComponentId: id })}
      onSimUpdate={setSimState}
      onTransformChange={handleTransformChange}
      onPathTracerStatus={setPathTracerStatus}
      onPathTracerSupportChange={setPathTracingSupported}
    />
  );

  return (
    <div
      data-app-mode={mode}
      data-exhibit-id={currentProject.id}
      className="h-dvh w-full max-w-full flex flex-col overflow-hidden bg-chrome text-ink/72"
    >
      <TopBar
        mode={mode}
        exhibits={exhibits}
        current={currentProject}
        editingStatus={editingStatus}
        onSwitchExhibit={switchExhibit}
        onSetMode={changeMode}
        onFindPart={() => setShowFinder(true)}
        onOpenPlate={() => setShowIllustration(true)}
        onExport={() => setShowExport(true)}
      />

      <main className="flex-1 relative min-h-0 flex">
        {mode === 'exhibit' ? (
          <div className="flex-1 relative min-h-0 bg-stage">
            {canvasElement}
            <ExhibitView
              project={currentProject}
              viewportState={viewportState}
              parameters={parameters}
              simState={simState}
              activeChapterIndex={activeChapterIndex}
              pathTracerStatus={pathTracerStatus}
              pathTracingSupported={pathTracingSupported}
              viewportRef={viewportRef}
              onUpdateViewport={updateViewport}
              onUpdateParameter={(id, val) => setParameters((p) => ({ ...p, [id]: val }))}
              onResetParameters={() => setParameters(getDefaultsForProject(currentProject))}
              onSelectChapter={handleSelectChapter}
              onApplyCameraPreset={applyCameraPreset}
              onResetCamera={resetCamera}
            />
          </div>
        ) : (
          <StudioView
            project={currentProject}
            viewportState={viewportState}
            parameters={parameters}
            simState={simState}
            pathTracerStatus={pathTracerStatus}
            pathTracingSupported={pathTracingSupported}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onMutateProject={mutateCurrentProject}
            onUpdateViewport={updateViewport}
            onUpdateParameter={(id, val) => setParameters((p) => ({ ...p, [id]: val }))}
            onSeekTime={(t) => setSeekCommand((s) => ({ time: t, seq: (s?.seq ?? 0) + 1 }))}
            onSelectChapter={(idx) => handleSelectChapter(idx)}
            onApplyCameraPreset={applyCameraPreset}
            onImportProject={handleImportProject}
            onNewProject={handleNewProject}
            onSave={handleSave}
          >
            {canvasElement}
          </StudioView>
        )}
      </main>

      {showFinder && (
        <PartFinder
          project={currentProject}
          onSelect={(id) => updateViewport({ selectedComponentId: id })}
          onClose={() => setShowFinder(false)}
        />
      )}

      {showIllustration && (
        <IllustrationModal
          project={currentProject}
          explosion={viewportState.explosion}
          onClose={() => setShowIllustration(false)}
        />
      )}

      {showExport && (
        <ExportModal project={currentProject} viewport={viewportRef.current} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}
