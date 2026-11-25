import { useCallback, useRef, useState } from 'react';
import { ChevronUp, Pause, Play } from 'lucide-react';
import type { ViewportState } from '../../engine/renderer';
import type { ExaminationMode, SectionPlaneState } from '../../engine/types';
import { Range, useDismiss } from '../ui/controls';
import { DOCK_MODES, examModeLabel, MORE_MODES } from '../ui/labels';

interface DockProps {
  viewportState: ViewportState;
  onUpdateViewport: (partial: Partial<ViewportState>) => void;
}

const MORE_COUNT = MORE_MODES.reduce((n, g) => n + g.modes.length, 0);

/** Moving between views keeps the old rules: exploded pulls apart, whole puts back, section turns the plane on. */
export function examineModePatch(mode: ExaminationMode, state: ViewportState): Partial<ViewportState> {
  return {
    examinationMode: mode,
    explosion: mode === 'exploded' && state.explosion < 0.45 ? 0.65 : mode === 'assembled' ? 0 : state.explosion,
    section: { ...state.section, enabled: mode === 'cross_section' ? true : state.section.enabled },
  };
}

export function pullApartPatch(value: number, state: ViewportState): Partial<ViewportState> {
  return {
    explosion: value,
    examinationMode:
      value > 0.02 && state.examinationMode === 'assembled'
        ? 'exploded'
        : value === 0 && state.examinationMode === 'exploded'
          ? 'assembled'
          : state.examinationMode,
  };
}

/** Handle the object: play, pull apart, and the ways to look at it. */
export function Dock({ viewportState, onUpdateViewport }: DockProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  useDismiss(moreOpen, [moreRef], closeMore);

  const mode = viewportState.examinationMode;
  const moreActive = MORE_MODES.flatMap((g) => g.modes).find((m) => m.id === mode);
  const showSection = viewportState.section.enabled || mode === 'cross_section';
  const setMode = (m: ExaminationMode) => onUpdateViewport(examineModePatch(m, viewportState));
  const updateSection = (patch: Partial<SectionPlaneState>) =>
    onUpdateViewport({ section: { ...viewportState.section, ...patch } });

  return (
    <div
      role="toolbar"
      aria-label="Playback and examine"
      className="dc-surface rounded-full pointer-events-auto flex items-center gap-1.5 p-1.5 whitespace-nowrap max-w-full overflow-x-auto md:overflow-visible shadow-[0_1px_2px_rgba(0,0,0,.4)]"
    >
      <button
        type="button"
        onClick={() => onUpdateViewport({ playing: !viewportState.playing })}
        aria-label={viewportState.playing ? 'Pause' : 'Play'}
        className="dc-btn dc-btn-accent w-11 h-11 justify-center shrink-0"
      >
        {viewportState.playing ? (
          <Pause size={18} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={18} fill="currentColor" strokeWidth={0} />
        )}
      </button>

      <label className="flex items-center gap-3 pl-3.5 pr-3 h-11 text-ink/72 shrink-0">
        <span className="hidden sm:inline">Pull apart</span>
        <Range
          label="Pull apart"
          min={0}
          max={1}
          step={0.01}
          value={viewportState.explosion}
          onChange={(v) => onUpdateViewport(pullApartPatch(v, viewportState))}
          className="w-20 sm:w-24 md:w-[140px]"
        />
        <span className="hidden sm:inline w-8 text-right text-ink/50 tabular-nums">
          {Math.round(viewportState.explosion * 100)}%
        </span>
      </label>

      <span className="w-px h-7 bg-ink/12 shrink-0" />

      <div role="radiogroup" aria-label="Examine" className="flex gap-0.5 shrink-0">
        {DOCK_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            title={m.hint}
            onClick={() => setMode(m.id)}
            className="dc-btn h-11 px-3.5 hidden sm:inline-flex"
          >
            {m.label}
          </button>
        ))}
        <div ref={moreRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            data-active={Boolean(moreActive)}
            onClick={() => setMoreOpen((v) => !v)}
            className="dc-btn h-11 pl-3.5 pr-2.5"
          >
            <span className="hidden sm:inline">{moreActive ? moreActive.label : `${MORE_COUNT} more`}</span>
            <span className="sm:hidden">{examModeLabel(mode)}</span>
            <ChevronUp size={14} strokeWidth={1.5} className={moreOpen ? 'rotate-180' : ''} />
          </button>
          {moreOpen && (
            <div
              role="menu"
              aria-label="More ways to examine"
              className="dc-popover dc-anim-pop fixed md:absolute bottom-[calc(100%+14px)] right-0 max-sm:right-auto max-sm:left-1/2 max-sm:-ml-[min(170px,calc(50vw-12px))] md:right-[-6px] z-40 w-[min(340px,calc(100vw-24px))] max-h-[calc(100dvh-290px)] md:max-h-[calc(100vh-180px)] overflow-y-auto p-1.5 flex flex-col gap-0.5"
            >
              {[{ group: 'Main views', modes: DOCK_MODES, phoneOnly: true }, ...MORE_MODES].map((group, gi) => (
                <div key={group.group} className={`flex flex-col gap-0.5 ${'phoneOnly' in group ? 'sm:hidden' : ''}`}>
                  {gi > 1 && <div className="h-px mx-1 my-1.5 bg-ink/8" />}
                  <div className="dc-label px-2.5 pt-2.5 pb-1">{group.group}</div>
                  {group.modes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode === m.id}
                      onClick={() => {
                        setMode(m.id);
                        setMoreOpen(false);
                      }}
                      className="dc-btn !rounded-full h-[52px] px-2.5 flex-col !items-start justify-center !gap-0 text-left"
                    >
                      <span className="text-ink">{m.label}</span>
                      <span className="text-[12px] text-ink/50">{m.hint}</span>
                    </button>
                  ))}
                </div>
              ))}
              <div className="hidden sm:block h-px mx-1 my-1.5 bg-ink/8" />
              <p className="hidden sm:block m-0 px-2.5 pt-1 pb-2 text-[12px] text-ink/50">
                {DOCK_MODES.map((m) => m.label)
                  .join(', ')
                  .replace(/, ([^,]*)$/, ' and $1')}{' '}
                stay in the dock.
              </p>
            </div>
          )}
        </div>
      </div>

      {showSection && (
        <>
          <span className="w-px h-7 bg-ink/12 shrink-0" />
          <div className="flex items-center gap-2 pl-1 pr-2 h-11 shrink-0">
            <div role="radiogroup" aria-label="Section plane" className="flex gap-0.5">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <button
                  key={axis}
                  type="button"
                  role="radio"
                  aria-checked={viewportState.section.axis === axis}
                  onClick={() => updateSection({ axis, enabled: true })}
                  className="dc-btn h-8 w-8 justify-center uppercase font-mono text-[12px]"
                >
                  {axis}
                </button>
              ))}
            </div>
            <Range
              label="Section plane position"
              min={-1}
              max={1}
              step={0.02}
              value={viewportState.section.position}
              onChange={(v) => updateSection({ position: v, enabled: true })}
              className="w-20"
            />
          </div>
        </>
      )}
    </div>
  );
}
