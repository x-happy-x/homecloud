import './SegmentNav.scss';
import {Icon, type IconName} from '../Icon/Icon';

export interface SegmentItem<T extends string> {
  id: T;
  icon: IconName;
  label: string;
  /** Строка под названием; на телефоне она скрыта. */
  note?: string;
  /** Показывается, только если есть что показать: ноля и прочерка тут не бывает. */
  count?: number;
  /** Точка «идёт работа» на иконке. */
  running?: boolean;
}

export interface SegmentNavProps<T extends string> {
  label: string;
  items: Array<SegmentItem<T>>;
  active: T;
  onSelect(id: T): void;
}

/**
 * Полоса разделов внутри экрана: вкладки «Анализа» и группы настроек. Раньше
 * такие разделы были отдельными пунктами боковой панели, и цифры рядом с ними
 * спорили с названиями.
 */
export function SegmentNav<T extends string>({label, items, active, onSelect}: SegmentNavProps<T>) {
  return (
    <nav className="segment-nav" aria-label={label}>
      {items.map(item => {
        const current = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            className={`segment${current ? ' active' : ''}`}
            aria-current={current ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span className="segment-mark">
              <Icon name={item.icon} />
              {item.running && <i className="segment-run" aria-hidden="true" />}
            </span>
            <span className="segment-body">
              <b>{item.label}</b>
              {item.note && <small>{item.note}</small>}
            </span>
            {item.count !== undefined && <span className="segment-count">{item.count}</span>}
          </button>
        );
      })}
    </nav>
  );
}
