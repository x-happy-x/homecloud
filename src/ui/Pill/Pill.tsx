import type {ReactNode} from 'react';

export type PillTone = 'default' | 'running' | 'error';

export const Pill = ({tone = 'default', children}: {tone?: PillTone; children: ReactNode}) => (
  <span className={['pill', tone === 'default' ? '' : tone].filter(Boolean).join(' ')}>
    {children}
  </span>
);
