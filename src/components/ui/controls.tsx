import { useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

/** Closes a popover on outside pointer down or Escape. */
export function useDismiss(open: boolean, refs: Array<RefObject<HTMLElement | null>>, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (refs.some((r) => r.current && target && r.current.contains(target))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, disabled, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="dc-switch"
    >
      <span />
    </button>
  );
}

interface RangeProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  accent?: boolean;
  className?: string;
  id?: string;
}

export function Range({ value, min, max, step = 0.01, onChange, label, accent, className, id }: RangeProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      id={id}
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`dc-range ${accent ? 'dc-range-accent' : ''} ${className ?? ''}`}
      style={{ '--fill': `${Math.max(0, Math.min(100, pct))}%` } as CSSProperties}
    />
  );
}

interface SidePanelProps {
  label: string;
  eyebrow: ReactNode;
  title: ReactNode;
  onClose: () => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** The one side panel pattern: eyebrow, title, close, scrolling body, optional footer. */
export function SidePanel({ label, eyebrow, title, onClose, toolbar, footer, children, className }: SidePanelProps) {
  return (
    <aside
      aria-label={label}
      className={`dc-surface dc-anim-panel pointer-events-auto flex flex-col overflow-hidden ${className ?? ''}`}
    >
      <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-ink/8">
        <div className="flex-1 min-w-0">
          <div className="dc-label">{eyebrow}</div>
          <h2 className="mt-1 text-[20px] font-bold leading-[1.15] tracking-[-0.03em] text-ink">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label.toLowerCase()}`}
          className="dc-btn w-9 h-9 justify-center shrink-0"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>
      {toolbar && <div className="px-5 py-3.5 border-b border-ink/8">{toolbar}</div>}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-5">{children}</div>
      {footer && <div className="flex flex-wrap gap-2 px-5 py-3.5 border-t border-ink/8">{footer}</div>}
    </aside>
  );
}

/** A quiet note box with a coloured left rule (grey for model notes, pink for loops). */
export function NoteBox({
  tone = 'model',
  children,
  className,
}: {
  tone?: 'model' | 'accent' | 'plain';
  children: ReactNode;
  className?: string;
}) {
  const border = tone === 'accent' ? 'border-accent' : tone === 'model' ? 'border-model' : 'border-ink/18';
  return <div className={`px-3.5 py-3 bg-ink/3 border-l-2 ${border} rounded-r-lg ${className ?? ''}`}>{children}</div>;
}
