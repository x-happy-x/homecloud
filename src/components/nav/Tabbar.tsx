import {NAV_ITEMS} from '../../app/navItems';
import type {ViewName} from '../../app/routes';
import {NavItem} from '../../ui/NavItem/NavItem';

export interface TabbarProps {
  view: ViewName;
  counts: Partial<Record<ViewName, number | '—'>>;
  onNavigate(view: ViewName): void;
}

/**
 * Нижняя панель на телефоне. Та же разметка, что и у боковой: на узком
 * экране CSS оставляет из счётчиков только «Проверку», остальные цифры там
 * только мешают.
 */
export const Tabbar = ({view, counts, onNavigate}: TabbarProps) => (
  <nav className="tabbar" aria-label="Разделы">
    {NAV_ITEMS.map(item => (
      <NavItem
        key={item.view}
        view={item.view}
        icon={item.icon}
        label={item.short}
        count={counts[item.view]}
        attention={item.attention}
        active={item.view === view}
        onClick={onNavigate}
      />
    ))}
  </nav>
);
