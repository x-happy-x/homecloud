import type {ReactNode} from 'react';

export interface HintProps {
  title?: ReactNode;
  children: ReactNode;
}

/** Пояснение под заголовком экрана — врезка с полосой слева. */
export const Hint = ({title, children}: HintProps) => (
  <p className="hint">
    {title && <strong>{title}</strong>}
    {children}
  </p>
);

export const HintLine = ({children}: {children: ReactNode}) => (
  <p className="hint-line">{children}</p>
);
