import { useCallback, useEffect, useState, type RefObject } from 'react';
import { LIGHTING_PRESETS } from '../engine/materials';
import type { PathTracerStatus } from '../engine/pathtracer';
import type { DecoderViewport, ViewportState } from '../engine/renderer';
import type { CameraPresetId, DecoderProject, EvaluatedSimulationState } from '../engine/types';
import { Dock } from './exhibit/Dock';
import { ExhibitSummary, TourStep } from './exhibit/ExhibitOverlay';
import { FlowsPanel } from './exhibit/FlowsPanel';
import { PartsPanel } from './exhibit/PartsPanel';
import { PlatePanel } from './exhibit/PlatePanel';
import { Rail, type ExhibitPanel } from './exhibit/Rail';
import { TourPanel } from './exhibit/TourPanel';
import { TryItPanel } from './exhibit/TryItPanel';
import { useIsWide, useViewInset } from './exhibit/useViewInset';
import { ViewportToolbar } from './exhibit/ViewportToolbar';
import type { FlowFilter } from './flows';
import { IllustrationModal } from './IllustrationModal';
import type { PlateOptions } from './plate';
import { FlowGraphDialog } from './RelationshipGraph';

interface ExhibitViewProps {
  project: DecoderProject;
  viewportState: ViewportState;
  parameters: Record<string, number | boolean | string>;
  simState: EvaluatedSimulationState | null;
  activeChapterIndex: number | null;
  pathTracerStatus: PathTracerStatus | null;
  pathTracingSupported: boolean;
  viewportRef: RefObject<DecoderViewport | null>;
  onUpdateViewport: (partial: Partial<ViewportState>) => void;
  onUpdateParameter: (id: string, value: number | boolean | string) => void;
  onResetParameters: () => void;
  onSelectChapter: (index: number | null) => void;
  onApplyCameraPreset: (preset: CameraPresetId) => void;
  onResetCamera: () => void;
}

/** Room the side panel takes from the right edge: 400px panel plus the 104px rail gutter. */
const PANEL_INSET = 504;
/** Summary column on wide screens: 32px margin, 300px card and a little air. */
const SUMMARY_INSET = 348;
/** The rail of panel buttons along the right edge. */
const RAIL_INSET = 96;

const PANEL_CLASS =
  'absolute z-20 left-2 right-2 bottom-[84px] top-[34%] md:left-auto md:top-2 md:right-[104px] md:bottom-6 md:w-[400px]';

/** Exhibit mode: the object in the middle, a dock to handle it, a rail of ways to learn about it. */
export function ExhibitView(props: ExhibitViewProps) {
  const {
    project,
    viewportState,
    parameters,
    simState,
    activeChapterIndex,
    viewportRef,
    onUpdateViewport,
    onSelectChapter,
    onResetCamera,
  } = props;
  const [panel, setPanel] = useState<ExhibitPanel | null>(null);
  const [graphFilter, setGraphFilter] = useState<FlowFilter | null>(null);
  const [plateLarge, setPlateLarge] = useState<PlateOptions | null>(null);
  const wide = useIsWide();

  // The summary column on the left and the rail (or an open panel) on the right stay clear of the model.
  useViewInset(viewportRef, wide ? SUMMARY_INSET : 0, wide ? (panel ? PANEL_INSET : RAIL_INSET) : 0);

  // A part picked in the viewport or the finder opens its details, unless the flows are being read.
  const selectedId = viewportState.selectedComponentId;
  useEffect(() => {
    if (selectedId) setPanel((p) => (p === 'flows' ? p : 'parts'));
  }, [selectedId]);

  // A new exhibit starts with the panels closed.
  useEffect(() => {
    setPanel(null);
    setGraphFilter(null);
    setPlateLarge(null);
  }, [project.id]);

  const closePanel = useCallback(() => {
    if (panel === 'parts') onUpdateViewport({ selectedComponentId: null });
    setPanel(null);
  }, [panel, onUpdateViewport]);

  const togglePanel = (next: ExhibitPanel) => {
    if (panel === next) closePanel();
    else {
      if (panel === 'parts' && next !== 'flows') onUpdateViewport({ selectedComponentId: null });
      setPanel(next);
    }
  };

  const selectPart = (id: string) => onUpdateViewport({ selectedComponentId: id });
  const panelOpen = panel !== null;
  // Overlay text sits straight on the scene, so it switches to dark ink over light backdrops.
  const onLight = LIGHTING_PRESETS[viewportState.lightingPreset]?.isLightBackdrop ? 'dc-on-light' : '';

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className={`absolute left-3 right-3 top-[60px] md:top-8 md:left-8 md:right-auto md:w-[300px] ${onLight}`}>
        <ExhibitSummary project={project} simState={simState} />
      </div>

      {activeChapterIndex !== null && project.chapters[activeChapterIndex] && (
        <div
          className={`absolute left-3 right-3 bottom-[156px] md:left-8 md:right-auto md:bottom-[120px] md:w-[300px] ${onLight} ${
            panelOpen ? 'hidden md:block' : ''
          }`}
        >
          <TourStep project={project} index={activeChapterIndex} onSelectChapter={onSelectChapter} />
        </div>
      )}

      <div
        className={`absolute z-30 top-3 right-3 md:top-4 transition-[right] duration-[420ms] ease-[cubic-bezier(.16,1,.3,1)] ${
          panelOpen ? 'md:right-[520px]' : 'md:right-[104px]'
        }`}
      >
        <ViewportToolbar
          viewportState={viewportState}
          pathTracerStatus={props.pathTracerStatus}
          pathTracingSupported={props.pathTracingSupported}
          onUpdateViewport={onUpdateViewport}
          onApplyCameraPreset={props.onApplyCameraPreset}
          onResetCamera={onResetCamera}
        />
      </div>

      <div className="absolute z-30 left-3 right-3 bottom-3 md:left-auto md:right-4 md:top-4 md:bottom-auto">
        <Rail active={panel} onToggle={togglePanel} />
      </div>

      {panel === 'tour' && (
        <TourPanel
          className={PANEL_CLASS}
          project={project}
          activeIndex={activeChapterIndex}
          onSelectChapter={onSelectChapter}
          onClose={closePanel}
        />
      )}
      {panel === 'try' && (
        <TryItPanel
          className={PANEL_CLASS}
          project={project}
          parameters={parameters}
          simState={simState}
          onUpdateParameter={props.onUpdateParameter}
          onResetParameters={props.onResetParameters}
          onClose={closePanel}
        />
      )}
      {panel === 'parts' && (
        <PartsPanel
          className={PANEL_CLASS}
          project={project}
          viewportState={viewportState}
          simState={simState}
          onUpdateViewport={onUpdateViewport}
          onApplyCameraPreset={props.onApplyCameraPreset}
          onOpenFlows={() => setPanel('flows')}
          onClose={closePanel}
        />
      )}
      {panel === 'flows' && (
        <FlowsPanel
          className={PANEL_CLASS}
          project={project}
          simState={simState}
          selectedComponentId={selectedId}
          onSelectComponent={selectPart}
          onOpenGraph={setGraphFilter}
          onClose={closePanel}
        />
      )}
      {panel === 'plate' && (
        <PlatePanel
          className={PANEL_CLASS}
          project={project}
          explosion={viewportState.explosion}
          onOpenLarge={setPlateLarge}
          onClose={closePanel}
        />
      )}

      <div
        className={`absolute z-20 bottom-[84px] md:bottom-6 left-1/2 -translate-x-1/2 max-w-[calc(100%-24px)] md:max-w-none transition-[left] duration-[420ms] ease-[cubic-bezier(.16,1,.3,1)] ${
          panelOpen ? 'hidden md:block md:left-[calc((100%-504px)/2)]' : ''
        }`}
      >
        <Dock viewportState={viewportState} onUpdateViewport={onUpdateViewport} />
      </div>

      {graphFilter !== null && (
        <div className="pointer-events-auto">
          <FlowGraphDialog
            project={project}
            selectedComponentId={selectedId}
            simState={simState}
            initialFilter={graphFilter}
            onSelectComponent={selectPart}
            onClose={() => setGraphFilter(null)}
          />
        </div>
      )}
      {plateLarge && (
        <div className="pointer-events-auto">
          <IllustrationModal
            project={project}
            explosion={viewportState.explosion}
            initialOptions={plateLarge}
            onClose={() => setPlateLarge(null)}
          />
        </div>
      )}
    </div>
  );
}
