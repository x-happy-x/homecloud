import type {ReactNode} from 'react';
import {IconButton} from '../IconButton/IconButton';

export interface SidePanelTab<T extends string> {
  id: T;
  label: string;
}

export interface SidePanelProps<T extends string> {
  open: boolean;
  title: string;
  onClose(): void;
  tabs?: Array<SidePanelTab<T>>;
  activeTab?: T;
  onTab?(tab: T): void;
  className?: string;
  children: ReactNode;
}

/** Выезжающая справа панель: подборки с фильтрами и список уведомлений. */
export function SidePanel<T extends string>({
  open, title, onClose, tabs, activeTab, onTab, className, children,
}: SidePanelProps<T>) {
  return (
    <>
      <div className="sidepage-backdrop" hidden={!open} onClick={onClose} />
      <aside
        className={['sidepage', className].filter(Boolean).join(' ')}
        hidden={!open}
        aria-label={title}
      >
        <header className="sidepage-head">
          <strong>{title}</strong>
          <IconButton icon="close" label="Закрыть панель" onClick={onClose} />
        </header>
        {tabs && (
          <nav className="sidepage-tabs" aria-label="Разделы панели">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`sidepage-tab${tab.id === activeTab ? ' active' : ''}`}
                onClick={() => onTab?.(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
        <div className="sidepage-body">{children}</div>
      </aside>
    </>
  );
}
