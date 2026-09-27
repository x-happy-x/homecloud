import {useState} from 'react';
import './Tabbar.scss';
import {activeNav, CATALOG_NAV, HIDDEN_NAV, navEntry, PRIMARY_NAV, type NavEntry} from '../../app/navItems';
import type {Device} from '../../services/endpoints/backends';
import {useStore} from '../../store';
import {Dialog} from '../../ui/Dialog/Dialog';
import {Icon} from '../../ui/Icon/Icon';
import {activeJob, AlbumList, JobCard, SourceList, useNavCounts, type NavTarget} from './NavSections';

export interface TabbarProps {
  devices: Device[] | undefined;
  onNavigate(target: NavTarget): void;
  onOpenPanel(tab: 'albums' | 'folders'): void;
}

/** Вкладки телефона: три раздела и «Библиотека» шторкой; поиск — полем вверху экрана. */
const TABS = ['photos', 'highlights', 'people'] as const;

/** Что лежит в «Библиотеке»: видео и всё обслуживание каталога. */
const LIBRARY = [navEntry('video'), ...CATALOG_NAV];

/**
 * Нижняя панель на телефоне. Альбомы, источники, видео и каталог в пять
 * вкладок не влезают — они в шторке «Библиотека», как в эскизе.
 */
export function Tabbar({devices, onNavigate, onOpenPanel}: TabbarProps) {
  const view = useStore(state => state.view);
  const kind = useStore(state => state.filters.kind);
  const hidden = useStore(state => state.filters.hidden);
  const counts = useNavCounts();
  const [library, setLibrary] = useState(false);
  const active = activeNav(view, {kind, hidden});
  const inLibrary = active === 'hidden' || LIBRARY.some(entry => entry.id === active);
  const job = activeJob(devices);

  const go = (target: NavTarget) => {
    setLibrary(false);
    onNavigate(target);
  };

  const tab = (entry: NavEntry) => (
    <button key={entry.id} type="button" className={`tab${active === entry.id && !library ? ' active' : ''}`}
      aria-current={active === entry.id ? 'page' : undefined} onClick={() => go(entry)}>
      <Icon name={entry.icon} />
      <span>{entry.short}</span>
    </button>
  );

  return (
    <>
      <nav className="tabbar" aria-label="Разделы">
        {TABS.map(id => tab(navEntry(id)))}
        <button type="button" className={`tab${library || inLibrary ? ' active' : ''}`}
          aria-expanded={library} onClick={() => setLibrary(!library)}>
          <Icon name="library" />
          <span>Библиотека</span>
          {(counts.analysis ?? 0) > 0 && <i className="tab-pip" aria-hidden="true" />}
        </button>
      </nav>

      <Dialog open={library} onClose={() => setLibrary(false)} closeOnBackdrop className="library-sheet"
        aria-label="Библиотека">
        <span className="library-grab" aria-hidden="true" />
        {/* Логотип с названием открывает скрытые снимки, как в боковой панели. */}
        <button type="button" className="library-home"
          onClick={() => go(active === 'hidden' ? PRIMARY_NAV[0] : HIDDEN_NAV)}>
          <img src="/favicon.svg" alt="" />
          <span>HomeCloud<small>Библиотека</small></span>
        </button>
        <div className="library-tiles">
          {LIBRARY.map(entry => (
            <button key={entry.id} type="button" className={`library-tile${active === entry.id ? ' active' : ''}`}
              onClick={() => go(entry)}>
              <Icon name={entry.icon} />
              <span>{entry.label}</span>
              {entry.id === 'analysis' && (counts.analysis ?? 0) > 0 && (
                <i className="nav-badge">{(counts.analysis ?? 0) > 99 ? '99+' : counts.analysis}</i>
              )}
            </button>
          ))}
        </div>
        <JobCard device={job} onOpen={() => go({...navEntry('analysis'), view: 'scan', lastTab: false})} />
        <h3>Альбомы</h3>
        <AlbumList onPick={go} limit={6} onAll={() => { setLibrary(false); onOpenPanel('albums'); }} />
        <h3>Источники</h3>
        <SourceList onPick={go} />
        <button type="button" className="nav-more" onClick={() => { setLibrary(false); onOpenPanel('folders'); }}>
          Все папки
        </button>
      </Dialog>
    </>
  );
}
