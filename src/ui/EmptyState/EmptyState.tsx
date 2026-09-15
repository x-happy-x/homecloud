import type {ReactNode} from 'react';

export interface EmptyStateProps {
  /** Крупный знак над заголовком — в старой вёрстке это был символ вроде «⌁». */
  mark?: string;
  title: string;
  children?: ReactNode;
}

export const EmptyState = ({mark, title, children}: EmptyStateProps) => (
  <div className="empty">
    {mark && <span className="mark" aria-hidden="true">{mark}</span>}
    <h2>{title}</h2>
    {children && <p>{children}</p>}
  </div>
);
