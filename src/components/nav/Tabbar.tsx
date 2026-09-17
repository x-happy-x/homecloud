import './Tabbar.scss';
import {NAV_GROUPS, type NavGroupSpec} from '../../app/navItems';
import type {ViewName} from '../../app/routes';
import {NavItem} from '../../ui/NavItem/NavItem';

export interface TabbarProps {
  view: ViewName;
  onNavigate(group: NavGroupSpec): void;
}

/**
 * Нижняя панель на телефоне. Та же разметка, что и у боковой: пять пунктов
 * ложатся в ряд с короткими подписями.
 */
export const Tabbar = ({view, onNavigate}: TabbarProps) => (
  <nav className="tabbar" aria-label="Разделы">
    {NAV_GROUPS.map(group => (
      <NavItem
        key={group.id}
        icon={group.icon}
        label={group.short}
        active={group.views.includes(view)}
        onClick={() => onNavigate(group)}
      />
    ))}
  </nav>
);
