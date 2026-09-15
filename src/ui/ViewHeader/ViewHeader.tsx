import type {ReactNode} from 'react';

export interface ViewHeaderProps {
  eyebrow?: ReactNode;
  title: string;
  /** Кнопки справа от заголовка. */
  actions?: ReactNode;
  children?: ReactNode;
}

export const ViewHeader = ({eyebrow, title, actions, children}: ViewHeaderProps) => (
  <div className="page-head">
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
    </div>
    {children}
    {actions}
  </div>
);

export interface StatProps {
  value: ReactNode;
  children: ReactNode;
}

export const Stat = ({value, children}: StatProps) => (
  <span className="stat"><strong>{value}</strong> {children}</span>
);

export const Stats = ({children}: {children: ReactNode}) => (
  <div className="stats">{children}</div>
);
