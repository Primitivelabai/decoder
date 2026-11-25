import { useEffect, useRef, useState } from 'react';
import { DecoderViewport, type ViewportState } from '../engine/renderer';
import { GeometryKernel } from '../engine/geometry';
import { generateTechnicalIllustrationSVG } from '../engine/illustration';
import type { PathTracerStatus } from '../engine/pathtracer';
import type { CameraPose, CameraPresetId, DecoderProject, EvaluatedSimulationState, Vec3 } from '../engine/types';

interface ViewportCanvasProps {
  project: DecoderProject;
  viewportState: ViewportState;
  parameters: Record<string, number | boolean | string>;
  cameraCommand: { pose: CameraPose; seq: number } | null;
  cameraPresetCommand?: { preset: CameraPresetId; seq: number } | null;
  seekCommand: { time: number; seq: number } | null;
  viewportRef: React.MutableRefObject<DecoderViewport | null>;
  onSelectComponent: (componentId: string | null) => void;
  onSimUpdate: (simState: EvaluatedSimulationState) => void;
  onTransformChange?: (componentId: string, pos: Vec3, rot: Vec3, scale: Vec3) => void;
  onPathTracerStatus?: (status: PathTracerStatus) => void;
  onPathTracerSupportChange?: (supported: boolean) => void;
}

export function ViewportCanvas({
  project,
  viewportState,
  parameters,
  cameraCommand,
  cameraPresetCommand,
  seekCommand,
  viewportRef,
  onSelectComponent,
  onSimUpdate,
  onTransformChange,
  onPathTracerStatus,
  onPathTracerSupportChange,
}: ViewportCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<DecoderViewport | null>(null);
  const loadedProjectIdRef = useRef<string>(project.id);
  const loadedProjectObjRef = useRef<DecoderProject>(project);

  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [fallbackSvg, setFallbackSvg] = useState<string>('');

  const callbacksRef = useRef({
    onSelectComponent,
    onSimUpdate,
    onTransformChange,
    onPathTracerStatus,
    onPathTracerSupportChange,
  });
  callbacksRef.current = {
    onSelectComponent,
    onSimUpdate,
    onTransformChange,
    onPathTracerStatus,
    onPathTracerSupportChange,
  };

  // Mount WebGLRenderer once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    try {
      const vp = new DecoderViewport(container, project, {
        onSelectComponent: (id) => callbacksRef.current.onSelectComponent(id),
        onSimUpdate: (st) => {
          setSimulationError(null);
          callbacksRef.current.onSimUpdate(st);
        },
        onTransformChange: (id, pos, rot, scale) => callbacksRef.current.onTransformChange?.(id, pos, rot, scale),
        onPathTracerStatus: (st) => callbacksRef.current.onPathTracerStatus?.(st),
        onSimulationError: (message) => setSimulationError(`Simulation stopped: ${message}`),
        onContextLost: () => setWebglError('The 3D view stopped. Showing a drawing instead.'),
        onContextRestored: () => setWebglError(null),
      });
      instanceRef.current = vp;
      viewportRef.current = vp;
      callbacksRef.current.onPathTracerSupportChange?.(vp.isPathTracingSupported());
      vp.updateState(viewportState);
      vp.setParameters(parameters);

      return () => {
        vp.dispose();
        instanceRef.current = null;
        viewportRef.current = null;
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WebGL2 unavailable on this device.';
      setWebglError(msg);
      callbacksRef.current.onPathTracerSupportChange?.(false);
      const kernel = new GeometryKernel();
      setFallbackSvg(
        generateTechnicalIllustrationSVG(project, kernel, {
          aesthetic: 'technical_atlas',
          projection: 'axonometric',
          explosion: 0.25,
          showCallouts: true,
          showPartsList: true,
        }),
      );
      kernel.dispose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload scene when project changes
  useEffect(() => {
    const vp = instanceRef.current;
    if (!vp) {
      if (webglError) {
        const kernel = new GeometryKernel();
        setFallbackSvg(
          generateTechnicalIllustrationSVG(project, kernel, {
            aesthetic: 'technical_atlas',
            projection: 'axonometric',
            explosion: 0.25,
            showCallouts: true,
            showPartsList: true,
          }),
        );
        kernel.dispose();
      }
      return;
    }
    if (loadedProjectObjRef.current !== project) {
      const isNewExhibit = loadedProjectIdRef.current !== project.id;
      loadedProjectIdRef.current = project.id;
      loadedProjectObjRef.current = project;
      vp.loadProject(project, isNewExhibit);
    }
  }, [project, webglError]);

  // Sync viewport state
  useEffect(() => {
    instanceRef.current?.updateState(viewportState);
  }, [viewportState]);

  // Sync parameters
  useEffect(() => {
    instanceRef.current?.setParameters(parameters);
  }, [parameters]);

  // Sync camera commands
  useEffect(() => {
    if (cameraCommand && instanceRef.current) {
      instanceRef.current.setCameraPose(cameraCommand.pose, true);
    }
  }, [cameraCommand]);

  // Sync framing preset commands
  useEffect(() => {
    if (cameraPresetCommand && instanceRef.current) {
      instanceRef.current.applyCameraPreset(cameraPresetCommand.preset);
    }
  }, [cameraPresetCommand]);

  // Sync manual timeline seek
  useEffect(() => {
    if (seekCommand && instanceRef.current) {
      instanceRef.current.setTime(seekCommand.time);
    }
  }, [seekCommand]);

  if (webglError) {
    return (
      <div
        data-testid="webgl-fallback"
        className="w-full h-full flex flex-col items-center justify-center bg-stage p-6 overflow-auto"
      >
        <div className="max-w-4xl w-full dc-surface p-5">
          <div className="flex items-center justify-between gap-4 pb-3 mb-4 border-b border-ink/8">
            <div>
              <h2 className="text-[16px] font-semibold text-ink">{project.title}, drawn instead of 3D</h2>
              <p className="text-[13px] text-ink/60 mt-0.5">{webglError}</p>
            </div>
            <span className="text-[12px] font-mono text-ink/60 shrink-0">{project.components.length} parts</span>
          </div>
          <div
            className="w-full overflow-hidden rounded-lg border border-ink/12 [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
            dangerouslySetInnerHTML={{ __html: fallbackSvg }}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={mountRef} data-testid="decoder-viewport" className="w-full h-full relative select-none touch-none">
      {simulationError && (
        <div
          role="alert"
          className="absolute z-20 top-3 left-1/2 -translate-x-1/2 max-w-[min(560px,calc(100%-24px))] dc-surface border-l-2 border-l-danger text-ink px-3.5 py-3 text-[13px]"
        >
          {simulationError}
        </div>
      )}
    </div>
  );
}
