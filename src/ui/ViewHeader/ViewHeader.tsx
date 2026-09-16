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

export interface SectionHeadProps {
  title: string;
  /** Одна-две строки о том, что на экране, — вместо отдельной врезки-пояснения. */
  note?: ReactNode;
  actions?: ReactNode;
}

/** Заголовок раздела внутри экрана: вкладки «Анализа» и группы настроек. */
export const SectionHead = ({title, note, actions}: SectionHeadProps) => (
  <div className="section-head">
    <div>
      <h2>{title}</h2>
      {note && <p>{note}</p>}
    </div>
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
