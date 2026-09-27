import {useMutation, useQuery} from '@tanstack/react-query';
import type {CSSProperties, ReactNode} from 'react';
import {useCatalogState} from '../../hooks/useCatalogState';
import {jobFraction, phaseLabel} from '../../lib/jobs';
import {formatNumber, shortCount} from '../../lib/format';
import {sourceOf} from '../../lib/sources';
import {createAlbum, getAlbums} from '../../services/endpoints/albums';
import {getSourceHealth, type Device} from '../../services/endpoints/backends';
import {getFolders} from '../../services/endpoints/catalog';
import {promptText} from '../../services/dialogs';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import type {GalleryFilters} from '../../store/slices/gallery';
import {Avatar} from '../../ui/Avatar/Avatar';
import {Icon} from '../../ui/Icon/Icon';
import type {NavEntry, NavId} from '../../app/navItems';

/** Куда ведёт щелчок в панели: пункт или галерея с отбором (альбом, папка, человек). */
export type NavTarget = NavEntry | {filters: Partial<GalleryFilters>};

/** Сколько альбомов видно в панели; остальные — в «Все альбомы». */
const ALBUMS_SHOWN = 4;
/** Сколько людей в ряду аватаров. */
const PEOPLE_SHOWN = 5;

/** Число у пункта: снимки, видео, люди, лица на проверку. */
export function useNavCounts(): Partial<Record<NavId, number>> {
  const stats = useCatalogState().data?.stats;
  if (!stats) return {};
  return {
    photos: stats.photos + (stats.videos ?? 0),
    video: stats.videos,
    people: stats.people,
    review: stats.review,
    hidden: stats.hidden,
  };
}

export interface NavLinkProps {
  entry: NavEntry;
  active: boolean;
  count?: number;
  /** Счётчик-значок: у «Проверки» это работа, которая ждёт. */
  badge?: boolean;
  onPick(entry: NavEntry): void;
}

export const NavLink = ({entry, active, count, badge, onPick}: NavLinkProps) => (
  <button
    type="button"
    className={`nav-link${active ? ' active' : ''}`}
    aria-current={active ? 'page' : undefined}
    title={entry.label}
    onClick={() => onPick(entry)}
  >
    <Icon name={entry.icon} />
    <span className="nav-label">{entry.label}</span>
    <span className="nav-short">{entry.short}</span>
    {count != null && count > 0 && (
      badge
        ? <span className="nav-badge">{count > 99 ? '99+' : count}</span>
        : <span className="nav-count">{shortCount(count)}</span>
    )}
  </button>
);

export interface NavGroupProps {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Сворачиваемая группа панели; что свёрнуто — помнится. */
export function NavGroup({id, title, action, children}: NavGroupProps) {
  const folded = useStore(state => state.prefs.navFolded.includes(id));
  const toggle = useStore(state => state.toggleNavGroup);
  return (
    <section className={`nav-group${folded ? ' folded' : ''}`}>
      <div className="nav-group-head">
        <button type="button" className="nav-group-toggle" aria-expanded={!folded} onClick={() => toggle(id)}>
          <Icon name="chevronDown" />
          <span>{title}</span>
        </button>
        {action}
      </div>
      {!folded && <div className="nav-group-body">{children}</div>}
    </section>
  );
}

/** Чаще всего встречающиеся люди: щелчок — их снимки в галерее. */
export function PeopleRow({onPick, onAll}: {onPick(target: NavTarget): void; onAll(): void}) {
  const people = useCatalogState().data?.people ?? [];
  const chosen = useStore(state => state.filters.people);
  const view = useStore(state => state.view);
  if (!people.length) return null;
  const top = [...people].sort((a, b) => b.count - a.count).slice(0, PEOPLE_SHOWN);
  const rest = people.length - top.length;
  return (
    <div className="nav-people">
      {top.map(person => {
        const active = view === 'photos' && chosen.length === 1 && chosen[0] === person.name;
        return (
          <button
            key={person.name}
            type="button"
            className={`nav-person${active ? ' active' : ''}`}
            title={`${person.name} · ${formatNumber(person.count)}`}
            aria-label={person.name}
            onClick={() => onPick({filters: {people: active ? [] : [person.name]}})}
          >
            <Avatar srcs={[person.bigfam_id ? `/media/bigfam/${person.bigfam_id}` : '', person.avatar]}
              name={person.name} letterClassName="nav-person-letter" />
          </button>
        );
      })}
      {rest > 0 && (
        <button type="button" className="nav-person more" title="Все люди" onClick={onAll}>
          +{rest > 999 ? shortCount(rest) : rest}
        </button>
      )}
    </div>
  );
}

/** Альбомы верхнего уровня: первые несколько и ссылка на все. */
export function AlbumList({onPick, onAll, limit = ALBUMS_SHOWN}: {
  onPick(target: NavTarget): void;
  onAll(): void;
  limit?: number;
}) {
  const albums = useQuery({queryKey: qk.albums(), queryFn: getAlbums}).data ?? [];
  const current = useStore(state => (state.view === 'photos' ? state.filters.album : 0));
  const top = albums.filter(album => album.depth === 0);
  if (!top.length) return <span className="nav-empty">Альбомов пока нет</span>;
  return (
    <>
      {top.slice(0, limit).map(album => (
        <button
          key={album.id}
          type="button"
          className={`nav-row${current === album.id ? ' active' : ''}`}
          title={album.trail}
          onClick={() => onPick({filters: {album: current === album.id ? 0 : album.id, folder: '', hidden: false, kind: ''}})}
        >
          <span className="nav-cover">
            {album.cover && (
              <img src={`/media/photo?path=${encodeURIComponent(album.cover)}&size=64`} alt="" loading="lazy" decoding="async" />
            )}
          </span>
          <span className="nav-label">{album.title}</span>
          <span className="nav-count">{shortCount(album.total)}</span>
        </button>
      ))}
      {albums.length > limit && (
        <button type="button" className="nav-more" onClick={onAll}>
          Все альбомы · {formatNumber(albums.length)}
        </button>
      )}
    </>
  );
}

export function NewAlbumButton() {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const create = useMutation({
    mutationFn: (title: string) => createAlbum(title),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: qk.albums()});
      toast('Альбом создан');
    },
  });
  if (!canEdit) return null;
  return (
    <button
      type="button"
      className="nav-group-action"
      title="Новый альбом"
      aria-label="Новый альбом"
      onClick={async () => {
        const title = await promptText('Название альбома, например «2010 год»');
        if (title) create.mutate(title);
      }}
    >
      <Icon name="plus" />
    </button>
  );
}

/**
 * Корни каталога — диски источников: «PC-X · D:», «Netcraze · /HDD». Точка —
 * доступность источника по последней проверке хаба; щелчок — вся папка в
 * галерее.
 */
export function SourceList({onPick}: {onPick(target: NavTarget): void}) {
  const signedIn = useStore(state => Boolean(state.session.user));
  const roots = useQuery({
    queryKey: qk.folders(''),
    queryFn: () => getFolders(''),
    enabled: signedIn,
    staleTime: 60_000,
  }).data?.folders ?? [];
  const health = useQuery({
    queryKey: qk.sourceHealth(),
    queryFn: getSourceHealth,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    enabled: signedIn,
  }).data?.sources;
  const current = useStore(state => (state.view === 'photos' ? state.filters.folder : ''));
  if (!roots.length) return <span className="nav-empty">Папок пока нет</span>;
  return (
    <>
      {roots.map(root => {
        const status = health?.[sourceOf(root.path)];
        const offline = Boolean(status && !status.online);
        return (
          <button
            key={root.path}
            type="button"
            className={`nav-row source${offline ? ' offline' : ''}${current === root.path ? ' active' : ''}`}
            title={offline ? `${root.name} — источник недоступен` : root.name}
            onClick={() => onPick({filters: {folder: current === root.path ? '' : root.path, folderDeep: true,
              folderExclude: '', album: 0, hidden: false, kind: ''}})}
          >
            <Icon name="drive" />
            <span className="nav-label">{root.name}</span>
            {offline
              ? <span className="nav-state">недоступен</span>
              : <span className="nav-count">{shortCount(root.photos)}</span>}
            {status && <span className="nav-dot" aria-hidden="true" />}
          </button>
        );
      })}
    </>
  );
}

/** Первое идущее задание обработки на ядрах. */
export function activeJob(devices: Device[] | undefined): Device | null {
  return devices?.find(device => device.job?.active) ?? null;
}

/** Карточка идущего задания внизу панели; в узкой — кольцо. Щелчок — «Сканирование». */
export function JobCard({device, onOpen}: {device: Device | null; onOpen(): void}) {
  if (!device?.job) return null;
  const job = device.job;
  const fraction = jobFraction(job);
  const percent = Math.round(fraction * 100);
  const phase = phaseLabel(job) || 'Обработка';
  return (
    <button type="button" className="nav-job" title={`${device.name}: ${phase} · ${percent}%`} onClick={onOpen}>
      <span className="nav-job-ring" style={{'--done': `${percent}%`} as CSSProperties}>
        <Icon name="process" />
      </span>
      <span className="nav-job-body">
        <span className="nav-job-top">
          <b>{device.name}</b>
          <span>{percent}%</span>
        </span>
        <span className="nav-job-bar"><span style={{width: `${percent}%`}} /></span>
        <small>{phase}{job.total ? ` · ${formatNumber(job.completed ?? 0)} из ${formatNumber(job.total)}` : ''}</small>
      </span>
    </button>
  );
}
