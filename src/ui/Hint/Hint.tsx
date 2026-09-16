import type {ReactNode} from 'react';

/** Мелкая приглушённая подпись под полем, списком или счётчиком. */
export const HintLine = ({children}: {children: ReactNode}) => (
  <p className="hint-line">{children}</p>
);
