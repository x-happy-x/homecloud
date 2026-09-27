import './Sidebar.scss';
import {activeNav, CATALOG_NAV, HIDDEN_NAV, PRIMARY_NAV, type NavEntry} from '../../app/navItems';
import type {Device} from '../../services/endpoints/backends';
import {useStore} from '../../store';
import {Icon} from '../../ui/Icon/Icon';
import {
  activeJob, AlbumList, JobCard, NavGroup, NavLink, NewAlbumButton, PeopleRow, SourceList,
  useNavCounts, type NavTarget,
} from './NavSections';

export interface SidebarProps {
  devices: Device[] | undefined;
  onNavigate(target: NavTarget): void;
  onOpenPanel(tab: 'albums' | 'folders'): void;
}

/**
 * Боковая панель: сверху то, что смотрят; ниже библиотека — люди, альбомы и
 * источники прямо в навигации, а не за кнопкой «Подборки и фильтры»; в самом
 * низу обслуживание каталога и идущее задание. Свёрнутая (кнопкой или на
 * узком экране) оставляет одни иконки.
 */
export function Sidebar({devices, onNavigate, onOpenPanel}: SidebarProps) {
  const view = useStore(state => state.view);
  const kind = useStore(state => state.filters.kind);
  const hidden = useStore(state => state.filters.hidden);
  const compact = useStore(state => state.prefs.navCompact);
  const setCompact = useStore(state => state.setNavCompact);
  const counts = useNavCounts();
  const active = activeNav(view, {kind, hidden});
  const job = activeJob(devices);
  const scan: NavEntry = {...CATALOG_NAV[0], view: 'scan', lastTab: false};

  const link = (entry: NavEntry) => (
    <NavLink key={entry.id} entry={entry} active={active === entry.id} count={counts[entry.id]}
      badge={entry.id === 'analysis'} onPick={onNavigate} />
  );

  return (
    <aside className={`sidebar${compact ? ' compact' : ''}`}>
      <div className="sidebar-brand">
        {/* Логотип с названием открывает скрытые снимки: в навигации их нет. */}
        <button type="button" className={`sidebar-home${active === 'hidden' ? ' secret' : ''}`}
          title="HomeCloud" onClick={() => onNavigate(active === 'hidden' ? PRIMARY_NAV[0] : HIDDEN_NAV)}>
          <img className="brand-logo" src="/favicon.svg" alt="" />
          <span className="brand-text">HomeCloud<small>семейный архив</small></span>
        </button>
        <button
          type="button"
          className="sidebar-toggle"
          title={compact ? 'Развернуть панель' : 'Свернуть панель'}
          aria-label={compact ? 'Развернуть панель' : 'Свернуть панель'}
          aria-pressed={compact}
          onClick={() => setCompact(!compact)}
        >
          <Icon name="sidebar" />
        </button>
      </div>

      <nav className="sidebar-scroll" aria-label="Разделы">
        <div className="nav-list">{PRIMARY_NAV.map(link)}</div>

        <div className="sidebar-library">
          <NavGroup id="people" title="Часто на снимках">
            <PeopleRow onPick={onNavigate} onAll={() => onNavigate(PRIMARY_NAV[2])} />
          </NavGroup>
          <NavGroup id="albums" title="Альбомы" action={<NewAlbumButton />}>
            <AlbumList onPick={onNavigate} onAll={() => onOpenPanel('albums')} />
          </NavGroup>
          <NavGroup id="sources" title="Источники">
            <SourceList onPick={onNavigate} />
            <button type="button" className="nav-more" onClick={() => onOpenPanel('folders')}>Все папки</button>
          </NavGroup>
        </div>

        <NavGroup id="catalog" title="Каталог">
          <div className="nav-list">{CATALOG_NAV.map(link)}</div>
        </NavGroup>
        {/* В свёрнутой панели групп нет — пункты каталога идут иконками. */}
        <div className="nav-list compact-only">{CATALOG_NAV.map(link)}</div>
      </nav>

      <div className="sidebar-foot">
        <JobCard device={job} onOpen={() => onNavigate(scan)} />
      </div>
    </aside>
  );
}
