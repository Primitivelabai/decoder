import { useEffect, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw, Waves } from 'lucide-react';
import { ViewMenu, type ViewMenuProps } from '../ViewMenu';

interface ViewportToolbarProps extends ViewMenuProps {
  onResetCamera: () => void;
}

function useFullscreen() {
  const [on, setOn] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };
  return { on, toggle, supported: Boolean(document.fullscreenEnabled) };
}

/** View settings, flow lines, camera reset and full screen, in the viewport corner. */
export function ViewportToolbar({ onResetCamera, ...view }: ViewportToolbarProps) {
  const fullscreen = useFullscreen();
  const flowOn = view.viewportState.showRelationships;

  return (
    <div
      role="toolbar"
      aria-label="View"
      className="dc-surface rounded-full pointer-events-auto flex items-center gap-1 p-1"
    >
      <ViewMenu {...view} align="right" />
      <button
        type="button"
        aria-pressed={flowOn}
        onClick={() => view.onUpdateViewport({ showRelationships: !flowOn })}
        title="Show flow lines between parts"
        className="dc-btn h-9 px-2.5"
      >
        <Waves size={16} strokeWidth={1.5} />
        <span className="hidden sm:inline">Show flow</span>
      </button>
      <button
        type="button"
        aria-label="Reset camera"
        title="Reset camera"
        onClick={onResetCamera}
        className="dc-btn w-9 h-9 justify-center"
      >
        <RotateCcw size={16} strokeWidth={1.5} />
      </button>
      {fullscreen.supported && (
        <button
          type="button"
          aria-label={fullscreen.on ? 'Leave full screen' : 'Full screen'}
          title={fullscreen.on ? 'Leave full screen' : 'Full screen'}
          onClick={fullscreen.toggle}
          className="dc-btn w-9 h-9 justify-center"
        >
          {fullscreen.on ? <Minimize2 size={16} strokeWidth={1.5} /> : <Maximize2 size={16} strokeWidth={1.5} />}
        </button>
      )}
    </div>
  );
}
