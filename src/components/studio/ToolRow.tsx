import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CircleHelp,
  FolderOpen,
  Move,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Scaling,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { ViewportState } from '../../engine/renderer';
import type { SceneDiagnostics, ValidationReport } from '../../engine/types';
import { ViewMenu, type ViewMenuProps } from '../ViewMenu';
import { useDismiss } from '../ui/controls';
import { ProblemsReport } from './ProblemsReport';

const TOOLS: Array<{ id: ViewportState['transformMode']; label: string; key: string; icon: LucideIcon }> = [
  { id: 'none', label: 'Select', key: 'V', icon: MousePointer2 },
  { id: 'translate', label: 'Move', key: 'G', icon: Move },
  { id: 'rotate', label: 'Rotate', key: 'R', icon: RotateCw },
  { id: 'scale', label: 'Scale', key: 'S', icon: Scaling },
];

interface ToolRowProps extends ViewMenuProps {
  canUndo: boolean;
  canRedo: boolean;
  saveNotice: string | null;
  validation: ValidationReport;
  diagnostics: SceneDiagnostics;
  leftOpen: boolean;
  rightOpen: boolean;
  guideOpen: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleGuide: () => void;
}

function ToolButton({
  label,
  onClick,
  icon: Icon,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  icon: LucideIcon;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={children ? undefined : label}
      title={label}
      className={`dc-btn h-9 shrink-0 ${children ? 'px-3' : 'w-9 justify-center'}`}
    >
      <Icon size={16} strokeWidth={1.5} />
      {children}
    </button>
  );
}

function StatusMenu({ validation, diagnostics }: { validation: ValidationReport; diagnostics: SceneDiagnostics }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, [ref], close);
  const errors = validation.errorCount;
  const warnings = validation.warningCount;
  const problems = errors + warnings;
  const label =
    errors > 0
      ? `${errors} ${errors === 1 ? 'problem' : 'problems'}`
      : warnings > 0
        ? `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`
        : 'No problems';
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-active={open}
        onClick={() => setOpen((v) => !v)}
        className="dc-btn h-9 px-3"
      >
        {problems === 0 ? (
          <Check size={16} strokeWidth={1.5} />
        ) : (
          <AlertTriangle size={16} strokeWidth={1.5} className={validation.errorCount > 0 ? 'text-danger' : ''} />
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Problems"
          className="dc-popover dc-anim-pop absolute right-0 top-[calc(100%+10px)] z-40 w-[min(400px,calc(100vw-24px))] max-h-[calc(100vh-160px)] overflow-y-auto p-4"
        >
          <div className="dc-label mb-1">Check</div>
          <h2 className="m-0 mb-4 text-[18px] font-bold tracking-[-0.03em] text-ink">{label}</h2>
          <ProblemsReport validation={validation} diagnostics={diagnostics} />
        </div>
      )}
    </div>
  );
}

/** File actions, undo, transform tools, view settings, problems and help. */
export function ToolRow(props: ToolRowProps) {
  const { viewportState, onUpdateViewport } = props;
  return (
    <div
      role="toolbar"
      aria-label="File and tools"
      className="h-12 shrink-0 flex items-center gap-1 px-2 md:px-3 bg-chrome border-b border-ink/8"
    >
      <ToolButton
        label={props.leftOpen ? 'Hide parts list' : 'Show parts list'}
        icon={PanelLeft}
        onClick={props.onToggleLeft}
      />
      <ToolButton label="New exhibit" icon={Plus} onClick={props.onNew}>
        <span className="hidden md:inline">New</span>
      </ToolButton>
      <ToolButton label="Open a .decoder.json file" icon={FolderOpen} onClick={props.onOpen}>
        <span className="hidden md:inline">Open</span>
      </ToolButton>
      <ToolButton label="Save in this browser" icon={Save} onClick={props.onSave}>
        <span className="hidden md:inline">{props.saveNotice ?? 'Save'}</span>
      </ToolButton>
      <span className="w-px h-5 bg-ink/12 mx-1 shrink-0" />
      <ToolButton label="Undo" icon={Undo2} onClick={props.onUndo} disabled={!props.canUndo} />
      <ToolButton label="Redo" icon={Redo2} onClick={props.onRedo} disabled={!props.canRedo} />

      <div className="flex-1 min-w-2" />
      <div
        role="radiogroup"
        aria-label="Transform tool"
        className="flex gap-0.5 p-[3px] border border-ink/12 rounded-full shrink-0"
      >
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            role="radio"
            aria-checked={viewportState.transformMode === tool.id}
            aria-keyshortcuts={tool.key}
            title={`${tool.label} (${tool.key})`}
            onClick={() => onUpdateViewport({ transformMode: tool.id })}
            className="dc-btn h-[30px] px-2.5"
          >
            <tool.icon size={16} strokeWidth={1.5} />
            <span className="hidden lg:inline">{tool.label}</span>
            <span className="hidden lg:inline font-mono text-[11px] text-ink/40">{tool.key}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-2" />

      <div className="shrink-0">
        <ViewMenu
          align="right"
          viewportState={viewportState}
          pathTracerStatus={props.pathTracerStatus}
          pathTracingSupported={props.pathTracingSupported}
          onUpdateViewport={onUpdateViewport}
          onApplyCameraPreset={props.onApplyCameraPreset}
        />
      </div>
      <StatusMenu validation={props.validation} diagnostics={props.diagnostics} />
      <button
        type="button"
        aria-label="How the studio works"
        title="How the studio works"
        aria-pressed={props.guideOpen}
        onClick={props.onToggleGuide}
        className="dc-btn w-9 h-9 justify-center shrink-0"
      >
        <CircleHelp size={16} strokeWidth={1.5} />
      </button>
      <ToolButton
        label={props.rightOpen ? 'Hide inspector' : 'Show inspector'}
        icon={PanelRight}
        onClick={props.onToggleRight}
      />
    </div>
  );
}
