import type { ParameterSpec } from '../engine/types';
import { Range, Switch } from './ui/controls';
import { formatNumber, unitText } from './ui/labels';

interface ParameterControlProps {
  param: ParameterSpec;
  value: number | boolean | string;
  onChange: (value: number | boolean | string) => void;
  /** Show the description under the control. */
  showDescription?: boolean;
}

/** One exhibit parameter as a slider, switch, number field or choice. Changed values fill pink. */
export function ParameterControl({ param, value, onChange, showDescription = true }: ParameterControlProps) {
  const id = `param-${param.id}`;
  const unit = unitText(param.unit);

  if (param.control === 'switch' || typeof param.defaultValue === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="text-ink">
            {param.label}
          </label>
          {showDescription && param.description && <p className="mt-1 text-[12px] text-ink/60">{param.description}</p>}
        </div>
        <Switch id={id} label={param.label} checked={Boolean(value)} onChange={onChange} />
      </div>
    );
  }

  if (param.control === 'select' && param.options?.length) {
    return (
      <div>
        <label htmlFor={id} className="block text-ink mb-2">
          {param.label}
        </label>
        <select
          id={id}
          value={String(value)}
          onChange={(e) => {
            const opt = param.options?.find((o) => String(o.value) === e.target.value);
            onChange(opt ? opt.value : e.target.value);
          }}
          className="dc-field"
        >
          {param.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        {showDescription && param.description && <p className="mt-2.5 text-[12px] text-ink/60">{param.description}</p>}
      </div>
    );
  }

  const num = Number(value);
  const min = param.min ?? 0;
  const max = param.max ?? 100;
  const changed = num !== Number(param.defaultValue);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ink">
          {param.label}
        </label>
        <span className="text-ink tabular-nums shrink-0">
          {formatNumber(num, param.step)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      {param.control === 'number' ? (
        <input
          id={id}
          type="number"
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          value={num}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="dc-field mt-2 font-mono tabular-nums"
        />
      ) : (
        <Range
          id={id}
          label={param.label}
          min={min}
          max={max}
          step={param.step ?? 1}
          value={num}
          accent={changed}
          onChange={onChange}
          className="w-full mt-2"
        />
      )}
      {(param.minLabel || param.maxLabel) && (
        <div className="flex justify-between text-[12px] text-ink/50">
          <span>{param.minLabel}</span>
          <span>{param.maxLabel}</span>
        </div>
      )}
      {showDescription && param.description && <p className="mt-2.5 text-[12px] text-ink/60">{param.description}</p>}
    </div>
  );
}
