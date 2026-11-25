import type { ReactNode } from 'react';

/** A labelled block in the inspector, separated from the next by a hairline. */
export function Section({ label, aside, children }: { label?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="py-5 border-b border-ink/8 last:border-b-0 flex flex-col gap-3">
      {(label || aside) && (
        <div className="flex items-center justify-between gap-3 min-h-6">
          {label && <span className="dc-label">{label}</span>}
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  placeholder,
  multiline,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] text-ink/60">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="dc-field"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="dc-field"
        />
      )}
    </div>
  );
}

/** A number box that ignores half-typed values instead of writing NaN into the exhibit. */
export function NumberField({
  value,
  step,
  label,
  onChange,
  className,
}: {
  value: number;
  step: number;
  label: string;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <input
      type="number"
      aria-label={label}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className={`dc-field font-mono text-[13px] tabular-nums ${className ?? ''}`}
    />
  );
}
