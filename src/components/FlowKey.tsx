import type { RelationshipType } from '../engine/types';
import { lineBorder, RELATIONSHIP_LABELS, RELATIONSHIP_LINE, type LineStyle } from './ui/labels';

const STYLE_ORDER: LineStyle[] = ['solid', 'dashed', 'double', 'dotted', 'faint'];

/** Legend for flows: line style tells link types apart; pink marks a feedback loop. */
export function FlowKey({ types, showLoop = true }: { types: RelationshipType[]; showLoop?: boolean }) {
  const groups = STYLE_ORDER.map((style) => ({
    style,
    names: types.filter((t) => RELATIONSHIP_LINE[t] === style).map((t) => RELATIONSHIP_LABELS[t]),
  })).filter((g) => g.names.length > 0);

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-ink/72">
      {groups.map((g) => (
        <span key={g.style} className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-6 shrink-0"
            style={{
              borderTop: lineBorder(g.style, g.style === 'faint' ? 'rgba(245,245,245,.4)' : 'rgba(245,245,245,.72)'),
            }}
          />
          <span className="truncate">{g.names.join(', ')}</span>
        </span>
      ))}
      {showLoop && (
        <span className="flex items-center gap-2.5">
          <span className="w-6 shrink-0" style={{ borderTop: lineBorder('solid', 'var(--dc-accent)') }} />
          In a loop
        </span>
      )}
    </div>
  );
}
