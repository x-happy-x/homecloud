import type {ButtonHTMLAttributes, ReactNode} from 'react';
import {Icon, type IconName} from '../Icon/Icon';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'title'> {
  icon: IconName;
  /** Идёт и в подсказку при наведении, и в подпись для чтения с экрана. */
  label: string;
  tiny?: boolean;
  danger?: boolean;
  badge?: ReactNode;
}

export function IconButton({
  icon, label, tiny, danger, badge, type = 'button', ...rest
}: IconButtonProps) {
  const classes = ['icon-button'];
  if (tiny) classes.push('tiny');
  if (danger) classes.push('danger');
  return (
    <button type={type} className={classes.join(' ')} title={label} aria-label={label} {...rest}>
      <Icon name={icon} />
      {badge}
    </button>
  );
}
