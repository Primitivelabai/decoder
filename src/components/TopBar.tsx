import { Download, FileText, Search } from 'lucide-react';
import type { DecoderProject } from '../engine/types';
import { ExhibitPicker } from './ExhibitPicker';
import { GhostMark } from './ui/GhostMark';

export type AppMode = 'exhibit' | 'studio';

interface TopBarProps {
  mode: AppMode;
  exhibits: DecoderProject[];
  current: DecoderProject;
  /** Studio only: "Editing · saved 2 min ago". */
  editingStatus?: string;
  onSwitchExhibit: (id: string) => void;
  onSetMode: (mode: AppMode) => void;
  onFindPart: () => void;
  onOpenPlate: () => void;
  onExport: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Where am I: logo, exhibit picker, Exhibit / Studio, find a part, export. */
export function TopBar({
  mode,
  exhibits,
  current,
  editingStatus,
  onSwitchExhibit,
  onSetMode,
  onFindPart,
  onOpenPlate,
  onExport,
}: TopBarProps) {
  return (
    <header className="relative z-30 h-14 shrink-0 flex items-center gap-2 md:gap-4 pl-3 pr-2 md:pl-5 md:pr-4 bg-chrome border-b border-ink/8">
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onSetMode('exhibit');
        }}
        aria-label="primitive decoder"
        className="flex items-center gap-2.5 text-ink no-underline shrink-0"
      >
        <GhostMark size={20} />
        <span className="hidden sm:flex items-baseline gap-[0.3em] font-wordmark text-[17px] tracking-[-0.02em]">
          <span className="font-bold">primitive</span>
          <span className="font-medium text-ink/50">decoder</span>
        </span>
      </a>
      <span className="hidden sm:block w-px h-6 bg-ink/12 shrink-0" />
      <div className="min-w-0 shrink">
        <ExhibitPicker
          exhibits={exhibits}
          current={current}
          eyebrow={mode === 'studio' ? editingStatus : undefined}
          onSelect={onSwitchExhibit}
        />
      </div>

      <div className="flex-1" />
      <div role="tablist" aria-label="Mode" className="flex p-[3px] gap-0.5 border border-ink/12 rounded-full shrink-0">
        {(['exhibit', 'studio'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => onSetMode(m)}
            className="dc-btn h-[30px] px-2.5 md:px-3.5"
          >
            {m === 'exhibit' ? 'Exhibit' : 'Studio'}
          </button>
        ))}
      </div>
      <div className="flex-1" />

      {mode === 'exhibit' ? (
        <button
          type="button"
          onClick={onFindPart}
          aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
          aria-label="Find a part"
          className="dc-btn h-9 px-2.5 text-ink/50 shrink-0 hidden sm:inline-flex"
        >
          <Search size={16} strokeWidth={1.5} />
          <span className="hidden lg:inline">Find a part</span>
          <span className="dc-kbd hidden lg:inline">{isMac ? '⌘K' : 'Ctrl K'}</span>
        </button>
      ) : (
        <button type="button" onClick={onOpenPlate} className="dc-btn h-9 px-3 shrink-0" aria-label="Plate">
          <FileText size={16} strokeWidth={1.5} />
          <span className="hidden md:inline">Plate</span>
        </button>
      )}
      <button
        type="button"
        onClick={onExport}
        aria-label="Export"
        className="dc-btn dc-btn-outline h-9 px-3 md:px-3.5 text-ink shrink-0"
      >
        <Download size={16} strokeWidth={1.5} />
        <span className="hidden sm:inline">Export</span>
      </button>
    </header>
  );
}
