import type {ReactNode} from 'react';
import './SectionNav.scss';
import {Icon, type IconName} from '../Icon/Icon';

export interface SectionItem<T extends string> {
  id: T;
  icon: IconName;
  title: string;
  /** Строка под названием; на телефоне она скрыта. */
  note?: string;
  /** Число справа; не задано или ноль — не рисуется. */
  count?: number;
  /** attention — латунный значок (ждёт внимания), иначе спокойный. */
  tone?: 'attention' | 'quiet';
  /** Точка «идёт работа» на иконке. */
  running?: boolean;
}

export interface SectionNavProps<T extends string> {
  label: string;
  items: Array<SectionItem<T>>;
  active: T;
  onSelect(id: T): void;
}

/**
 * Колонка разделов экрана — «Настройки» и «Анализ»: иконка, название, строка
 * пояснения и счётчик. На телефоне становится лентой над содержимым.
 */
export function SectionNav<T extends string>({label, items, active, onSelect}: SectionNavProps<T>) {
  return (
    <nav className="section-nav" aria-label={label}>
      {items.map(item => {
        const current = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            className={current ? 'active' : ''}
            aria-current={current ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span className="section-nav-icon">
              <Icon name={item.icon} />
              {item.running && <i className="section-nav-run" aria-label="идёт работа" />}
            </span>
            <span className="section-nav-text">
              <strong>{item.title}</strong>
              {item.note && <small>{item.note}</small>}
            </span>
            {Boolean(item.count) && (
              <b className={`section-nav-count${item.tone === 'quiet' ? ' quiet' : ''}`}>{item.count}</b>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/** Раскладка «колонка разделов слева, содержимое справа». */
export const SectionLayout = ({nav, children}: {nav: ReactNode; children: ReactNode}) => (
  <div className="section-layout">
    {nav}
    <div className="section-content">{children}</div>
  </div>
);
