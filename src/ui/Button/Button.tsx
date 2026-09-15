import type {ButtonHTMLAttributes, ReactNode} from 'react';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  small?: boolean;
  children: ReactNode;
}

export function Button({variant = 'default', small, type = 'button', ...rest}: ButtonProps) {
  const classes = ['button'];
  if (variant !== 'default') classes.push(variant);
  if (small) classes.push('small');
  return <button type={type} className={classes.join(' ')} {...rest} />;
}
