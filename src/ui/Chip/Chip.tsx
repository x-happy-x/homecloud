import type {MouseEventHandler, ReactNode} from 'react';
import {Icon} from '../Icon/Icon';

export interface ChipProps {
  active?: boolean;
  /** Чип-контекст показывает крестик: щелчок снимает фильтр. */
  context?: boolean;
  verified?: boolean;
  count?: number;
  onClick?(): void;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  children: ReactNode;
}

export function Chip({
  active, context, verified, count, onClick, onContextMenu, className, children,
}: ChipProps) {
  const classes = ['chip'];
  if (active) classes.push('active');
  if (context) classes.push('context');
  if (verified) classes.push('verified');
  if (className) classes.push(className);
  return (
    <button type="button" className={classes.join(' ')} onClick={onClick} onContextMenu={onContextMenu}>
      {children}
      {count !== undefined && <small>{count}</small>}
      {context && <i aria-hidden="true">✕</i>}
    </button>
  );
}

export interface ChipsProps {
  className?: string;
  label?: string;
  children: ReactNode;
}

export const Chips = ({className, label, children}: ChipsProps) => (
  <div className={['chips', className].filter(Boolean).join(' ')} aria-label={label}>
    {children}
  </div>
);

export interface ToggleChipProps {
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  /** Подсказка при наведении: что именно включает переключатель. */
  title?: string;
  children: ReactNode;
}

/**
 * Чип-переключатель вместо флажка: включённый залит акцентом и несёт галочку,
 * выключенный — плюс. Для клавиатуры и чтения с экрана это switch.
 */
export const ToggleChip = ({checked, onChange, disabled, title, children}: ToggleChipProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    title={title}
    disabled={disabled}
    className={`chip toggle-chip${checked ? ' active' : ''}`}
    onClick={() => onChange(!checked)}
  >
    <span className="toggle-chip-knob" aria-hidden="true"><Icon name={checked ? 'check' : 'plus'} /></span>
    {children}
  </button>
);
