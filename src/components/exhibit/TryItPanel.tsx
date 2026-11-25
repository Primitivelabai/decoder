import { RotateCcw } from 'lucide-react';
import type { DecoderProject, EvaluatedSimulationState } from '../../engine/types';
import { ParameterControl } from '../ParameterControl';
import { SidePanel } from '../ui/controls';
import { splitReadout } from '../ui/labels';

interface TryItPanelProps {
  project: DecoderProject;
  parameters: Record<string, number | boolean | string>;
  simState: EvaluatedSimulationState | null;
  onUpdateParameter: (id: string, value: number | boolean | string) => void;
  onResetParameters: () => void;
  onClose: () => void;
  className?: string;
}

/** Change the inputs and watch the readings answer. */
export function TryItPanel({
  project,
  parameters,
  simState,
  onUpdateParameter,
  onResetParameters,
  onClose,
  className,
}: TryItPanelProps) {
  const outputs = simState?.outputs ?? [];
  const assumptions = project.simulation.assumptions;
  return (
    <SidePanel
      label="Try it"
      eyebrow="Try it"
      title="Change one thing. Watch what follows."
      onClose={onClose}
      className={className}
      footer={
        project.parameters.length > 0 && (
          <button type="button" onClick={onResetParameters} className="dc-btn dc-btn-outline h-9 px-3.5">
            <RotateCcw size={16} strokeWidth={1.5} />
            <span>Reset</span>
          </button>
        )
      }
    >
      {project.parameters.length === 0 ? (
        <p className="pt-4 text-ink/60">This exhibit has nothing to change yet. Add inputs in the Studio.</p>
      ) : (
        project.parameters.map((param) => (
          <div key={param.id} className="py-[18px] border-b border-ink/8">
            <ParameterControl
              param={param}
              value={parameters[param.id] ?? param.defaultValue}
              onChange={(v) => onUpdateParameter(param.id, v)}
            />
          </div>
        ))
      )}

      {outputs.length > 0 && (
        <div className="pt-[18px]">
          <div className="dc-label">Live readings</div>
          <dl className="mt-2.5 mb-0 flex flex-col">
            {outputs.map((out) => {
              const { value, unit } = splitReadout(out.formatted, out.unit);
              return (
                <div key={out.id} className="flex justify-between gap-3 py-2 border-b border-ink/8 last:border-b-0">
                  <dt className="text-ink/60">{out.label}</dt>
                  <dd className="m-0 font-mono text-ink tabular-nums whitespace-nowrap">
                    {value}
                    {unit && ` ${unit}`}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      <details className="mt-[18px] px-3.5 py-3 bg-ink/3 border-l-2 border-model rounded-r-lg">
        <summary className="cursor-pointer text-ink">Modelled, not measured · level {project.simulation.level}</summary>
        {assumptions.length > 0 ? (
          <ul className="mt-2.5 mb-0 pl-4 text-[12px] text-ink/60 flex flex-col gap-1.5">
            {assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2.5 mb-0 text-[12px] text-ink/60">The exhibit lists no assumptions for its model.</p>
        )}
      </details>
    </SidePanel>
  );
}
