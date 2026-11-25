import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { DecoderProject } from '../engine/types';
import { useDismiss } from './ui/controls';
import { exhibitSubtitle, exhibitTitle } from './ui/labels';

interface ExhibitPickerProps {
  exhibits: DecoderProject[];
  current: DecoderProject;
  /** Small line above the title; defaults to "Exhibit 01 / 07". */
  eyebrow?: string;
  onSelect: (id: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Searchable listbox of exhibits, opened from the top bar. */
export function ExhibitPicker({ exhibits, current, eyebrow, onSelect }: ExhibitPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, [wrapRef], close);

  const index = exhibits.findIndex((e) => e.id === current.id);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exhibits
      .map((ex, i) => ({ ex, n: i + 1 }))
      .filter(({ ex }) =>
        !q
          ? true
          : [ex.title, ex.shortTitle, ex.subtitle, ex.shortSubtitle, ex.category]
              .filter(Boolean)
              .some((s) => String(s).toLowerCase().includes(q)),
      );
  }, [exhibits, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(Math.max(0, index));
    requestAnimationFrame(() => inputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[active];
      if (item) choose(item.ex.id);
    }
  };

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Exhibit: ${exhibitTitle(current)}. Change exhibit`}
        onClick={() => setOpen((v) => !v)}
        className="dc-btn h-10 pl-3 pr-2.5 max-w-full"
      >
        <span className="flex flex-col items-start leading-[1.2] min-w-0">
          <span className="dc-label truncate max-w-full">
            {eyebrow ?? `Exhibit ${pad(index + 1)} / ${pad(exhibits.length)}`}
          </span>
          <span className="font-semibold text-[14px] text-ink tracking-[-0.01em] truncate max-w-full">
            {exhibitTitle(current)}
          </span>
        </span>
        <ChevronDown size={16} strokeWidth={1.5} className="shrink-0" />
      </button>

      {open && (
        <div className="dc-popover dc-anim-pop absolute left-0 top-[calc(100%+8px)] z-50 w-[min(460px,calc(100vw-24px))] overflow-hidden">
          <div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-ink/8">
            <Search size={16} strokeWidth={1.5} className="text-ink/50 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Find an exhibit"
              aria-label="Find an exhibit"
              aria-controls="exhibit-listbox"
              aria-activedescendant={items[active] ? `exhibit-opt-${items[active].ex.id}` : undefined}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-ink placeholder:text-ink/50"
            />
          </div>
          <div
            ref={listRef}
            id="exhibit-listbox"
            role="listbox"
            aria-label="Exhibits"
            className="p-1.5 flex flex-col gap-0.5 max-h-[min(440px,calc(100vh-200px))] overflow-y-auto"
          >
            {items.length === 0 && <div className="px-3 py-4 text-ink/50">No exhibit matches “{query}”.</div>}
            {items.map(({ ex, n }, i) => {
              const selected = ex.id === current.id;
              return (
                <div
                  key={ex.id}
                  id={`exhibit-opt-${ex.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(ex.id)}
                  onMouseMove={() => setActive(i)}
                  className={`flex items-center gap-2.5 h-[52px] px-2.5 rounded-full cursor-pointer transition-colors ${
                    i === active ? 'bg-ink/6' : ''
                  }`}
                >
                  <span className={`w-6 text-[12px] font-mono ${selected ? 'text-accent' : 'text-ink/40'}`}>
                    {pad(n)}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col leading-[1.3]">
                    <span className="font-semibold text-[14px] text-ink truncate">{exhibitTitle(ex)}</span>
                    <span className="text-[12px] text-ink/50 truncate">{exhibitSubtitle(ex)}</span>
                  </span>
                  {selected && <Check size={16} strokeWidth={1.5} className="text-accent shrink-0" />}
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 px-4 py-2.5 border-t border-ink/8 text-[12px] text-ink/50">
            <span>↑↓ move</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        </div>
      )}
    </div>
  );
}
