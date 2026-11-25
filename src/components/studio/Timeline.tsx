import { useCallback, useRef, useState } from 'react';
import { ChevronUp, Pause, Play } from 'lucide-react';
import type { ViewportState } from '../../engine/renderer';
import type { DecoderProject, EvaluatedSimulationState } from '../../engine/types';
import { pullApartPatch } from '../exhibit/Dock';
import { Range, useDismiss } from '../ui/controls';

const SPEEDS = [0.25, 0.5, 1, 2];

interface TimelineProps {
  project: DecoderProject;
  viewportState: ViewportState;
  simState: EvaluatedSimulationState | null;
  onUpdateViewport: (partial: Partial<ViewportState>) => void;
  onSeekTime: (time: number) => void;
}

function SpeedMenu({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, [ref], close);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="dc-btn h-9 px-3"
      >
        <span>Speed</span>
        <span className="font-mono text-ink">{value}×</span>
        <ChevronUp size={14} strokeWidth={1.5} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Speed"
          className="dc-popover dc-anim-pop absolute bottom-[calc(100%+10px)] right-0 z-40 p-1.5 flex flex-col gap-0.5 w-32"
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={value === s}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className="dc-btn h-9 px-3 justify-between font-mono"
            >
              {s}×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Play, scrub through one cycle, change the speed and pull the parts apart. */
export function Timeline({ project, viewportState, simState, onUpdateViewport, onSeekTime }: TimelineProps) {
  const duration = project.simulation.cycleDuration;
  const time = (simState?.time ?? 0) % duration;
  return (
    <footer
      aria-label="Timeline"
      className="h-14 shrink-0 flex items-center gap-3 md:gap-4 px-3 md:px-4 bg-chrome border-t border-ink/8"
    >
      <button
        type="button"
        onClick={() => onUpdateViewport({ playing: !viewportState.playing })}
        aria-label={viewportState.playing ? 'Pause' : 'Play'}
        className="dc-btn dc-btn-accent w-10 h-10 justify-center shrink-0"
      >
        {viewportState.playing ? (
          <Pause size={16} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={16} fill="currentColor" strokeWidth={0} />
        )}
      </button>
      <span className="font-mono text-[13px] text-ink/72 tabular-nums w-14 shrink-0">{time.toFixed(2)} s</span>
      <Range
        label="Time"
        accent
        min={0}
        max={duration}
        step={0.02}
        value={time}
        onChange={(v) => {
          onUpdateViewport({ playing: false });
          onSeekTime(v);
        }}
        className="flex-1 min-w-16"
      />
      <span
        className="hidden sm:inline font-mono text-[12px] text-ink/50 tabular-nums w-10 text-right shrink-0"
        title="Point in the cycle"
      >
        {Math.round(simState?.cycleAngleDeg ?? 0)}°
      </span>
      <span className="hidden md:block w-px h-6 bg-ink/12 shrink-0" />
      <SpeedMenu value={viewportState.playbackSpeed} onChange={(s) => onUpdateViewport({ playbackSpeed: s })} />
      <label className="hidden sm:flex items-center gap-3 shrink-0">
        <span>Pull apart</span>
        <Range
          label="Pull apart"
          min={0}
          max={1}
          step={0.01}
          value={viewportState.explosion}
          onChange={(v) => onUpdateViewport(pullApartPatch(v, viewportState))}
          className="w-24 md:w-40"
        />
      </label>
    </footer>
  );
}
