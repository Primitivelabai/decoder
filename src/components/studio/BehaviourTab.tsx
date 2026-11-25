import type { DecoderProject, EvaluatedSimulationState } from '../../engine/types';
import { ParameterControl } from '../ParameterControl';
import { splitReadout } from '../ui/labels';
import { Section } from './fields';

interface BehaviourTabProps {
  project: DecoderProject;
  parameters: Record<string, number | boolean | string>;
  simState: EvaluatedSimulationState | null;
  onUpdateParameter: (id: string, value: number | boolean | string) => void;
}

/** The inputs a viewer can change, the readings they produce, and the model's working. */
export function BehaviourTab({ project, parameters, simState, onUpdateParameter }: BehaviourTabProps) {
  const variables = Object.entries(project.simulation.variables);
  return (
    <div className="flex flex-col">
      <Section label={`Inputs · ${project.parameters.length}`}>
        {project.parameters.length === 0 ? (
          <p className="m-0 text-ink/60">No inputs. Add parameters in the .decoder.json file.</p>
        ) : (
          project.parameters.map((param) => (
            <ParameterControl
              key={param.id}
              param={param}
              value={parameters[param.id] ?? param.defaultValue}
              onChange={(v) => onUpdateParameter(param.id, v)}
              showDescription={false}
            />
          ))
        )}
      </Section>

      {simState && simState.outputs.length > 0 && (
        <Section label="Readings">
          <dl className="m-0 flex flex-col">
            {simState.outputs.map((out) => {
              const { value, unit } = splitReadout(out.formatted, out.unit);
              return (
                <div key={out.id} className="flex justify-between gap-3 py-1.5 border-b border-ink/8 last:border-b-0">
                  <dt className="text-ink/60">{out.label}</dt>
                  <dd className="m-0 font-mono text-ink tabular-nums">
                    {value}
                    {unit && ` ${unit}`}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Section>
      )}

      {variables.length > 0 && (
        <Section label={`Working · ${variables.length}`}>
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {variables.map(([key, expr]) => (
              <li key={key} className="px-3 py-2 rounded-lg bg-ink/3 border border-ink/8">
                <div className="flex justify-between gap-2 font-mono text-[12px]">
                  <span className="text-ink truncate">{key}</span>
                  <span className="text-ink/72 tabular-nums shrink-0">
                    {simState?.variables[key] !== undefined ? simState.variables[key].toFixed(3) : '–'}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-ink/50 break-all">{expr}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
