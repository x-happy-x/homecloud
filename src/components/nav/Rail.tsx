import './Rail.scss';
import {NAV_GROUPS, type NavGroupSpec} from '../../app/navItems';
import type {ViewName} from '../../app/routes';
import {Icon} from '../../ui/Icon/Icon';
import {NavItem} from '../../ui/NavItem/NavItem';

export interface RailProps {
  view: ViewName;
  onNavigate(group: NavGroupSpec): void;
}

export const Rail = ({view, onNavigate}: RailProps) => (
  <aside className="rail">
    <div className="brand">
      <span className="brand-mark" aria-hidden="true"><Icon name="brand" /></span>
      <span className="brand-text">HomeCloud<small>семейный архив</small></span>
    </div>

    <nav className="rail-nav" aria-label="Разделы">
      {NAV_GROUPS.map(group => (
        <NavItem
          key={group.id}
          icon={group.icon}
          label={group.label}
          active={group.views.includes(view)}
          onClick={() => onNavigate(group)}
        />
      ))}
    </nav>
  </aside>
);
