import {useId, type ReactNode} from 'react';

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  children(id: string): ReactNode;
}

/**
 * Подпись, поле и пояснение. Идентификатор выдаётся React, а не берётся из
 * захардкоженного id в разметке.
 */
export function Field({label, hint, children}: FieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export interface TextFieldProps {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
}

export const TextField = ({
  label, hint, value, onChange, placeholder, disabled, multiline,
}: TextFieldProps) => (
  <Field label={label} hint={hint}>
    {id => multiline
      ? <textarea id={id} value={value} placeholder={placeholder} disabled={disabled}
          onChange={event => onChange(event.target.value)} />
      : <input id={id} type="text" value={value} placeholder={placeholder} disabled={disabled}
          onChange={event => onChange(event.target.value)} />}
  </Field>
);

export interface NumberFieldProps {
  label: string;
  hint?: ReactNode;
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export const NumberField = ({
  label, hint, value, onChange, min, max, step, disabled,
}: NumberFieldProps) => (
  <Field label={label} hint={hint}>
    {id => (
      <input
        id={id} type="number" value={value} min={min} max={max} step={step} disabled={disabled}
        onChange={event => onChange(Number(event.target.value))}
      />
    )}
  </Field>
);

export interface SelectFieldProps {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange(value: string): void;
  options: Array<{value: string; label: string}>;
  disabled?: boolean;
}

export const SelectField = ({
  label, hint, value, onChange, options, disabled,
}: SelectFieldProps) => (
  <Field label={label} hint={hint}>
    {id => (
      <select id={id} value={value} disabled={disabled}
        onChange={event => onChange(event.target.value)}>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    )}
  </Field>
);
