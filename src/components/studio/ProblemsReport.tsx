import type { SceneDiagnostics, ValidationReport } from '../../engine/types';
import { NoteBox } from '../ui/controls';

/** What would stop the exhibit exporting cleanly, with the scene's size. */
export function ProblemsReport({
  validation,
  diagnostics,
}: {
  validation: ValidationReport;
  diagnostics: SceneDiagnostics;
}) {
  const stats = [
    { label: 'Triangles', value: diagnostics.triangleCount.toLocaleString() },
    { label: 'Geometry', value: `${diagnostics.estimatedMemoryKB} KB` },
    { label: 'Evidence', value: `${Math.round(validation.stats.evidenceCoverage * 100)}%` },
    { label: 'Errors · warnings', value: `${validation.errorCount} · ${validation.warningCount}` },
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="dc-label">{s.label}</dt>
            <dd className="m-0 mt-1 font-mono text-[16px] text-ink tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {validation.issues.length === 0 ? (
        <p className="m-0 text-ink/72">No problems. The parts, links, expressions and evidence all check out.</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {validation.issues.map((iss, i) => (
            <li key={i}>
              <NoteBox
                tone={iss.severity === 'error' ? 'plain' : 'model'}
                className={iss.severity === 'error' ? '!border-danger' : ''}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-ink">{iss.message}</span>
                  <span className="font-mono text-[11px] text-ink/40 shrink-0">{iss.severity}</span>
                </div>
                {iss.repairHint && <p className="mt-1 mb-0 text-[12px] text-ink/60">Fix: {iss.repairHint}</p>}
                <div className="mt-1 font-mono text-[11px] text-ink/40 break-all">{iss.code}</div>
              </NoteBox>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
