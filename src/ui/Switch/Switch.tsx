export interface SwitchProps {
  checked: boolean;
  onChange(checked: boolean): void;
  /** Подпись для чтения с экрана, когда видимая подпись стоит отдельно. */
  label: string;
  disabled?: boolean;
}

/**
 * Выключатель «вкл/выкл». Под ним обычный флажок с ролью switch: фокус,
 * пробел и чтение с экрана работают без своей обработки клавиш.
 */
export const Switch = ({checked, onChange, label, disabled}: SwitchProps) => (
  <label className="switch">
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={event => onChange(event.target.checked)}
    />
    <span className="switch-track" aria-hidden="true" />
  </label>
);
