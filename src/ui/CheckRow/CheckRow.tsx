import type {ReactNode} from 'react';

export interface CheckRowProps {
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  children: ReactNode;
}

export const CheckRow = ({checked, onChange, disabled, children}: CheckRowProps) => (
  <label className="check-row">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={event => onChange(event.target.checked)}
    />
    {children}
  </label>
);
