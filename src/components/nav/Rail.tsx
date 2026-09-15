import './Rail.scss';
import {NAV_ITEMS} from '../../app/navItems';
import type {ViewName} from '../../app/routes';
import {Icon} from '../../ui/Icon/Icon';
import {NavItem} from '../../ui/NavItem/NavItem';
import {AccountMenu} from './AccountMenu';

export interface RailProps {
  view: ViewName;
  counts: Partial<Record<ViewName, number | string>>;
  onNavigate(view: ViewName): void;
}

export const Rail = ({view, counts, onNavigate}: RailProps) => (
  <aside className="rail">
    <div className="brand">
      <span className="brand-mark" aria-hidden="true"><Icon name="brand" /></span>
      <span className="brand-text">HomeCloud<small>семейный архив</small></span>
    </div>

    <nav className="rail-nav" aria-label="Разделы">
      {NAV_ITEMS.map(item => (
        <NavItem
          key={item.view}
          view={item.view}
          icon={item.icon}
          label={item.label}
          count={counts[item.view]}
          attention={item.attention}
          active={item.view === view}
          onClick={onNavigate}
        />
      ))}
    </nav>

    <div className="rail-foot">
      <AccountMenu />
      <div className="note">
        <Icon name="shield" />
        <div><strong>Только домашняя сеть</strong>Оригиналы лежат на ПК, облака нет</div>
      </div>
    </div>
  </aside>
);
