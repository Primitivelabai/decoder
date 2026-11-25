import { BookOpen, Box, FileText, FlaskConical, GitFork, type LucideIcon } from 'lucide-react';

export type ExhibitPanel = 'tour' | 'try' | 'parts' | 'flows' | 'plate';

const ITEMS: Array<{ id: ExhibitPanel; label: string; icon: LucideIcon }> = [
  { id: 'tour', label: 'Tour', icon: BookOpen },
  { id: 'try', label: 'Try it', icon: FlaskConical },
  { id: 'parts', label: 'Parts', icon: Box },
  { id: 'flows', label: 'Flows', icon: GitFork },
  { id: 'plate', label: 'Plate', icon: FileText },
];

interface RailProps {
  active: ExhibitPanel | null;
  onToggle: (panel: ExhibitPanel) => void;
}

/** Ways to learn about the object. Each opens one side panel; pressing it again closes it. */
export function Rail({ active, onToggle }: RailProps) {
  return (
    <nav
      aria-label="Learn"
      className="dc-surface pointer-events-auto flex md:flex-col gap-1 p-1.5 md:w-[72px] rounded-2xl"
    >
      {ITEMS.map((item, i) => {
        const on = active === item.id;
        return (
          <div key={item.id} className="contents">
            {i === ITEMS.length - 1 && (
              <span className="w-px md:w-auto md:h-px self-stretch md:mx-2 my-1 md:my-1 bg-ink/12" />
            )}
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(item.id)}
              className="dc-btn relative flex-1 md:flex-none h-[52px] md:h-[60px] flex-col justify-center !gap-1 text-[12px] px-1"
            >
              {on && (
                <span
                  aria-hidden="true"
                  className="absolute hidden md:block left-[-7px] top-3.5 bottom-3.5 w-0.5 rounded-sm bg-accent"
                />
              )}
              <item.icon size={20} strokeWidth={1.5} />
              <span>{item.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
