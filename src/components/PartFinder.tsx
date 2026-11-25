import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { DecoderProject } from '../engine/types';
import { exhibitTitle, partName, subsystemLabel } from './ui/labels';

interface PartFinderProps {
  project: DecoderProject;
  onSelect: (componentId: string) => void;
  onClose: () => void;
}

/** Command-style search over the current exhibit's parts (⌘K / Ctrl+K). */
export function PartFinder({ project, onSelect, onClose }: PartFinderProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return project.components.filter((c) =>
      !q
        ? true
        : [c.name, c.shortName, c.subsystem, subsystemLabel(project, c.subsystem), c.partNumber]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [project, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (id: string) => {
    onSelect(id);
    onClose();
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
      if (item) choose(item.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-chrome/60 flex justify-center pt-[12vh] px-3" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-label="Find a part"
        onPointerDown={(e) => e.stopPropagation()}
        className="dc-popover dc-anim-pop w-full max-w-[520px] h-fit overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-ink/8">
          <Search size={16} strokeWidth={1.5} className="text-ink/50 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={`Find a part in the ${exhibitTitle(project).toLowerCase()}`}
            aria-label="Find a part"
            aria-controls="part-finder-list"
            aria-activedescendant={items[active] ? `part-opt-${items[active].id}` : undefined}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-ink text-[15px] placeholder:text-ink/50"
          />
          <span className="dc-kbd">esc</span>
        </div>
        <div
          ref={listRef}
          id="part-finder-list"
          role="listbox"
          aria-label="Parts"
          className="p-1.5 max-h-[min(420px,60vh)] overflow-y-auto flex flex-col gap-0.5"
        >
          {items.length === 0 && <div className="px-3 py-4 text-ink/50">No part matches “{query}”.</div>}
          {items.map((c, i) => (
            <div
              key={c.id}
              id={`part-opt-${c.id}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onClick={() => choose(c.id)}
              onMouseMove={() => setActive(i)}
              className={`flex items-center justify-between gap-3 h-11 px-3 rounded-full cursor-pointer ${
                i === active ? 'bg-ink/6 text-ink' : 'text-ink/72'
              }`}
            >
              <span className="truncate">{partName(c)}</span>
              <span className="text-[12px] text-ink/40 shrink-0">{subsystemLabel(project, c.subsystem)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 px-4 py-2.5 border-t border-ink/8 text-[12px] text-ink/50">
          <span>↑↓ move</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
