import type {ReactNode} from 'react';

export interface ChipProps {
  active?: boolean;
  /** Чип-контекст показывает крестик: щелчок снимает фильтр. */
  context?: boolean;
  verified?: boolean;
  count?: number;
  onClick?(): void;
  children: ReactNode;
}

export function Chip({active, context, verified, count, onClick, children}: ChipProps) {
  const classes = ['chip'];
  if (active) classes.push('active');
  if (context) classes.push('context');
  if (verified) classes.push('verified');
  return (
    <button type="button" className={classes.join(' ')} onClick={onClick}>
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
