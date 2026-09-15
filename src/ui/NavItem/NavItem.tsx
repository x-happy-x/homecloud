import {Icon, type IconName} from '../Icon/Icon';
import type {ViewName} from '../../app/routes';

export interface NavItemProps {
  view: ViewName;
  icon: IconName;
  label: string;
  /** Прочерк — счётчик ещё не посчитан. */
  count?: number | string;
  /** Счётчик проверки выделяется цветом и виден даже в нижней панели телефона. */
  attention?: boolean;
  active: boolean;
  onClick(view: ViewName): void;
}

export const NavItem = ({view, icon, label, count, attention, active, onClick}: NavItemProps) => (
  <button
    type="button"
    className={`nav-item${active ? ' active' : ''}`}
    aria-current={active ? 'page' : undefined}
    onClick={() => onClick(view)}
  >
    <Icon name={icon} />
    <span>{label}</span>
    {count !== undefined && (
      <span className={`nav-count${attention ? ' attention' : ''}${count === 0 ? ' zero' : ''}`}>
        {count === 0 && attention ? '' : count}
      </span>
    )}
  </button>
);
