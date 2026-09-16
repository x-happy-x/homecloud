import {confirmAction, showProgressDialog} from '../../services/dialogs';
import {memo, useCallback, useMemo, useState, type MouseEvent} from 'react';
import {useInfiniteQuery, useMutation} from '@tanstack/react-query';
import './DuplicatesView.scss';
import {MediaContextMenu, mediaMenuAt, type MediaMenuItem, type MediaMenuState} from '../../components/media/MediaContextMenu';
import {fileSize, formatNumber, photoDate, plural} from '../../lib/format';
import {
  getDuplicates, type DuplicateGroup, type DuplicatePhoto, type DuplicatesStatus, type DuplicatesSummary,
} from '../../services/endpoints/jobs';
import {deletePhotos} from '../../services/endpoints/photos';
import {photoMediaUrl} from '../../services/media';
import {qk} from '../../services/queryKeys';
import {loadAllDuplicates} from './loadAll';
import {deleteDuplicatesWithProgress} from './remove';
import {doomedPaths, gainOf, keeperOf} from './scope';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import type {DupKind, DupLayout, DupSort} from '../../store/slices/duplicates';
import type {AdultMode} from '../../types/domain';
import {ActionBar} from '../../ui/ActionBar/ActionBar';
import {Button} from '../../ui/Button/Button';
import {Chip, ToggleChip} from '../../ui/Chip/Chip';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Icon} from '../../ui/Icon/Icon';
import {Progress} from '../../ui/Progress/Progress';
import {SectionHead} from '../../ui/ViewHeader/ViewHeader';

const PAGE = 30;

const LAYOUTS: Array<[DupLayout, 'rowView' | 'zoomLarge' | 'gridSix', string]> = [
  ['row', 'rowView', 'Лентой: все снимки группы в строку'],
  ['grid4', 'zoomLarge', 'Сеткой по 4 снимка'],
  ['grid6', 'gridSix', 'Сеткой по 6 снимков'],
];
const MOSAIC: Record<DupLayout, number> = {row: 0, grid4: 4, grid6: 6};

const files = (count: number) => `${formatNumber(count)} ${plural(count, 'файл', 'файла', 'файлов')}`;
const groupsText = (count: number) => `${formatNumber(count)} ${plural(count, 'группа', 'группы', 'групп')}`;
const baseName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

export interface DuplicatesViewProps {
  status?: DuplicatesStatus;
  onScan(): void;
  onStop(): void;
}

export function DuplicatesView({status, onScan, onStop}: DuplicatesViewProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const adultMode = useStore(state => state.prefs.adultMode);
  const similar = useStore(state => state.duplicates.similar);
  const setSimilar = useStore(state => state.setDupSimilar);
  const filters = useStore(state => state.duplicates.filters);
  const setFilters = useStore(state => state.setDupFilters);
  const keepChoice = useStore(state => state.duplicates.keep);
  const resetChoices = useStore(state => state.resetDupChoices);
  const skipped = useStore(state => state.selection.dupSkip);
  const selectSkipped = useStore(state => state.select);
  const clearSelection = useStore(state => state.clear);
  const toast = useStore(state => state.toast);
  const layout = useStore(state => state.duplicates.layout);
  const setLayout = useStore(state => state.setDupLayout);
  const setKeep = useStore(state => state.setDupKeep);
  const openPhoto = useStore(state => state.setRoutePhoto);
  const [menu, setMenu] = useState<MediaMenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  /** Удалённые из меню — прячем сразу, не дожидаясь перезапроса списка. */
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set());

  const removeOne = useMutation({
    mutationFn: (path: string) => deletePhotos([path]),
    onSuccess: (data, path) => {
      if (data.errors.length) {
        toast('Не удалось удалить файл', 'error');
        return;
      }
      setDeleted(current => new Set(current).add(path));
      toast('Файл перемещён в корзину', 'success');
      void queryClient.invalidateQueries({queryKey: ['duplicates']});
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: ['photos']});
    },
  });
  const onCardMenu = useCallback((event: MouseEvent, photo: DuplicatePhoto) =>
    setMenu(mediaMenuAt(event, photo.path, photo.kind === 'video')), []);

  const groups = useInfiniteQuery({
    queryKey: qk.duplicates(similar, {...filters}),
    initialPageParam: 0,
    queryFn: ({pageParam}) => getDuplicates(similar, filters, PAGE, pageParam as number),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + (page.groups?.length ?? 0), 0);
      return loaded < (last.total ?? 0) && last.groups.length ? loaded : undefined;
    },
  });

  const list = useMemo(() => (groups.data?.pages.flatMap(page => page.groups) ?? [])
    .map(group => {
      if (!deleted.size) return group;
      const paths = group.paths.filter(path => !deleted.has(path));
      const keep = deleted.has(group.keep) ? paths[0] : group.keep;
      return {
        ...group, keep, paths, count: paths.length,
        photos: group.photos.filter(photo => !deleted.has(photo.path)),
      };
    })
    .filter(group => group.paths.length > 1), [groups.data, deleted]);
  const total = groups.data?.pages[0]?.total ?? 0;
  const summary = groups.data?.pages[0]?.summary;

  const keepOf = (group: DuplicateGroup) => keeperOf(group, keepChoice[group.key], filters.folder);
  const extrasOf = (group: DuplicateGroup) => doomedPaths(group, keepOf(group), filters.folder);

  const active = list.filter(group => !skipped.has(group.key));
  const extras = active.flatMap(extrasOf);
  const bytes = active.reduce((sum, group) => sum + gainOf(group, keepOf(group), filters.folder), 0);

  const remove = useMutation({
    mutationFn: async (all: boolean) => {
      let targetGroups = active;
      if (all) {
        const dialog = showProgressDialog('Ищем все дубликаты…',
          'Собираем группы по выбранным фильтрам. После поиска покажем, какие копии будут удалены.');
        try {
          targetGroups = await loadAllDuplicates(similar, filters, {
            signal: dialog.signal,
            onProgress: (loaded, total) => dialog.update(
              `Проверено групп: ${formatNumber(loaded)} из ${formatNumber(total)}`,
              total ? loaded / total : 1),
          });
        } catch (error) {
          if (dialog.signal.aborted) return null;
          throw error;
        } finally {
          dialog.close();
        }
      }
      const paths = [...new Set(targetGroups.flatMap(extrasOf))];
      const size = targetGroups.reduce((sum, group) => sum + gainOf(group, keepOf(group), filters.folder), 0);
      if (!paths.length) { toast('Нет лишних копий для удаления'); return null; }
      const text = `Удалить ${files(paths.length)} (${fileSize(size)}) из ${groupsText(targetGroups.length)}?\n`
        + (filters.folder
          ? `В каждой группе останется копия в папке ${filters.folder}. Остальные копии будут удалены.\n`
          : 'В каждой группе останется отмеченный снимок.\n')
        + 'Файлы будут перемещены в корзину.';
      if (!await confirmAction(text, {title: 'Удалить дубликаты?', confirmLabel: 'Удалить', danger: true})) return null;
      return deleteDuplicatesWithProgress(paths);
    },
    onSuccess: result => {
      if (!result) return;
      resetChoices();
      clearSelection('dupSkip');
      void queryClient.invalidateQueries({queryKey: ['duplicates']});
      void queryClient.invalidateQueries({queryKey: ['state']});
    },
    onSettled: () => {
      void queryClient.invalidateQueries({queryKey: ['duplicates']});
      void queryClient.invalidateQueries({queryKey: ['photos']});
      void queryClient.invalidateQueries({queryKey: ['state']});
    },
  });

  const menuItems: MediaMenuItem[] = [
    {label: menu?.video ? 'Открыть видео' : 'Открыть фото', icon: 'openExternal', onSelect: openPhoto},
    ...(canEdit ? [
      {
        label: 'Оставить этот файл',
        icon: 'check',
        onSelect: (path: string) => {
          const group = list.find(item => item.paths.includes(path));
          if (group) setKeep(group.key, path);
        },
      },
      {
        label: 'Удалить в корзину',
        icon: 'trash',
        danger: true,
        disabled: removeOne.isPending,
        onSelect: (path: string) => removeOne.mutate(path),
      },
    ] satisfies MediaMenuItem[] : []),
  ];

  const running = ['counting', 'running'].includes(status?.status ?? '');

  return (
    <section className="analysis-panel dup-view">
      <SectionHead
        title="Дубликаты"
        note="Точные копии — одинаковые файлы. Похожие — пережатые или уменьшенные кадры: для них каждый снимок открывается, поэтому поиск дольше."
        actions={canEdit && (
          <div className="dup-scan-actions">
            <ToggleChip checked={similar} onChange={setSimilar} disabled={running}>Искать похожие</ToggleChip>
            <Button variant="primary" small disabled={running} onClick={onScan}>
              <Icon name="search" size={16} />
              <span>{summary?.groups ? 'Искать заново' : 'Найти дубликаты'}</span>
            </Button>
          </div>
        )}
      />

      {running && <ScanProgress status={status!} canStop={canEdit} onStop={onStop} />}

      {summary && summary.groups > 0 && (
        <Summary
          summary={summary}
          similar={similar}
          folder={filters.folder}
          onFolder={folder => setFilters({folder})}
        />
      )}

      {(summary?.groups ?? total) > 0 && (
        <div className="dup-toolbar">
          <div className="dup-chips" role="group" aria-label="Какие группы">
            {(['all', 'exact', 'similar'] as DupKind[])
              .filter(kind => kind !== 'similar' || similar || (summary?.similar ?? 0) > 0)
              .map(kind => (
                <Chip key={kind} active={filters.kind === kind} onClick={() => setFilters({kind})}>
                  {{all: 'Все', exact: 'Точные', similar: 'Похожие'}[kind]}
                  {summary && <small>{formatNumber(kind === 'all' ? summary.groups : summary[kind])}</small>}
                </Chip>
              ))}
          </div>
          <div className="dup-chips" role="group" aria-label="Порядок">
            {(['size', 'count'] as DupSort[]).map(sort => (
              <Chip key={sort} active={filters.sort === sort} onClick={() => setFilters({sort})}>
                {sort === 'size' ? 'Больше места' : 'Больше копий'}
              </Chip>
            ))}
          </div>
          {filters.folder && (
            <Chip context title={filters.folder} onClick={() => setFilters({folder: ''})}>
              Только в папке {baseName(filters.folder)}
            </Chip>
          )}
          <ToggleChip
            checked={filters.hideSmall}
            title="Файлы меньше 100 КБ — обычно иконки и картинки программ"
            onChange={hideSmall => setFilters({hideSmall})}
          >
            Скрыть мелкие файлы{summary?.small_groups ? ` · ${formatNumber(summary.small_groups)}` : ''}
          </ToggleChip>
          <div className="dup-layout" role="group" aria-label="Вид списка">
            {LAYOUTS.map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                className={`zoom-step${layout === id ? ' active' : ''}`}
                aria-pressed={layout === id}
                title={label}
                aria-label={label}
                onClick={() => setLayout(id)}
              >
                <Icon name={icon} />
              </button>
            ))}
          </div>
        </div>
      )}

      {canEdit && total > 0 && (
        <ActionBar
          variant="sticky"
          count={active.length}
          countLabel={`${groupsText(active.length)} · удалим ${files(extras.length)}`
            + `${filters.folder ? ` · оставим копии в ${baseName(filters.folder)}` : ''} · ${fileSize(bytes)}`}
          actions={
            <>
              {skipped.size > 0
                ? <Button small onClick={() => clearSelection('dupSkip')}>Выбрать все показанные</Button>
                : <Button small onClick={() => selectSkipped('dupSkip', list.map(group => group.key))}>Снять выбор</Button>}
              <span className="toolbar-spacer" />
              <Button variant="danger" disabled={remove.isPending || !extras.length} onClick={() => remove.mutate(false)}>
                <Icon name="trash" size={16} />
                <span>Удалить выбранные</span>
              </Button>
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(true)}>
                <Icon name="trash" size={16} />
                <span>{remove.isPending ? 'Обработка…' : 'Удалить все дубликаты'}</span>
              </Button>
            </>
          }
        />
      )}

      <div className={`dup-list layout-${layout}`}>
        {list.map(group => (
          <GroupCard
            key={group.key}
            group={group}
            keep={keepOf(group)}
            off={skipped.has(group.key)}
            canEdit={canEdit}
            adultMode={adultMode}
            layout={layout}
            onMenu={onCardMenu}
            onOpen={openPhoto}
            folder={filters.folder}
          />
        ))}
        {groups.isPending && <div className="dup-loading">Считаю группы…</div>}
      </div>

      {groups.hasNextPage && (
        <div className="dup-more-row">
          <span>Показано {formatNumber(list.length)} из {groupsText(total)}</span>
          <Button disabled={groups.isFetchingNextPage} onClick={() => void groups.fetchNextPage()}>
            Показать ещё
          </Button>
        </div>
      )}

      <MediaContextMenu menu={menu} items={menuItems} onClose={closeMenu} />

      {list.length === 0 && !groups.isPending && !running && (
        <EmptyState mark="✓" title={summary?.groups ? 'Под фильтр ничего не попало' : 'Дубликатов не найдено'}>
          {!summary?.groups
            ? 'Запустите поиск — он посчитает хеши файлов и покажет повторы.'
            : filters.folder
              ? 'В этой папке копии не попали под остальные условия: снимите «Скрыть мелкие файлы» или выберите другой вид групп.'
              : 'Снимите «Скрыть мелкие файлы» или выберите другой вид групп.'}
        </EmptyState>
      )}
    </section>
  );
}

function ScanProgress({status, canStop, onStop}: {status: DuplicatesStatus; canStop: boolean; onStop(): void}) {
  const counting = status.status === 'counting';
  const fraction = !counting && status.total ? (status.done ?? 0) / status.total : null;
  return (
    <section className="dup-progress" aria-live="polite">
      <div className="dup-progress-head">
        <span className="dup-spinner" aria-hidden="true" />
        <div>
          <strong>{counting ? 'Собираю список файлов' : 'Считаю хеши файлов'}</strong>
          <span>
            {counting
              ? 'Сначала выясняю, какие файлы одного размера'
              : `${formatNumber(status.done ?? 0)} из ${files(status.total ?? 0)}`}
            {status.errors ? ` · не прочитано: ${formatNumber(status.errors)}` : ''}
          </span>
        </div>
        <b>{fraction === null ? '' : `${Math.floor(fraction * 100)}%`}</b>
      </div>
      <Progress value={fraction} />
      {status.current && <code className="dup-current" title={status.current}>{status.current}</code>}
      {canStop && (
        <Button variant="danger" small onClick={onStop}>
          <Icon name="stop" size={16} />
          <span>Остановить</span>
        </Button>
      )}
    </section>
  );
}

interface SummaryProps {
  summary: DuplicatesSummary;
  similar: boolean;
  /** Папка, копиями которой сейчас ограничен список. */
  folder: string;
  onFolder(folder: string): void;
}

function Summary({summary, similar, folder, onFolder}: SummaryProps) {
  const top = summary.top_folders[0]?.copies || 1;
  const share = summary.files ? summary.extra_files / summary.files : 0;
  return (
    <section className="dup-summary">
      <div className="dup-stats">
        <div className="dup-stat accent">
          <span>Можно освободить</span>
          <b>{fileSize(summary.extra_bytes)}</b>
          <small>если оставить по одному файлу в группе</small>
        </div>
        <div className="dup-stat">
          <span>Лишних копий</span>
          <b>{formatNumber(summary.extra_files)}</b>
          <small>{Math.round(share * 100)}% из {formatNumber(summary.files)} {plural(summary.files, 'файла', 'файлов', 'файлов')} в группах</small>
        </div>
        <div className="dup-stat">
          <span>Групп</span>
          <b>{formatNumber(summary.groups)}</b>
          <small>
            точных {formatNumber(summary.exact)}
            {similar || summary.similar ? ` · похожих ${formatNumber(summary.similar)}` : ''}
          </small>
        </div>
        <div className="dup-stat">
          <span>Проверено</span>
          <b>{formatNumber(summary.hashed)}</b>
          <small>{similar ? `по картинке: ${formatNumber(summary.pictured)}` : 'файлов с посчитанным хешем'}</small>
        </div>
      </div>
      {summary.top_folders.length > 0 && (
        <div className="dup-folders">
          <h4>Папки с дубликатами</h4>
          <ul>
            {summary.top_folders.map(item => {
              const picked = item.folder === folder;
              return (
                <li key={item.folder}>
                  <button
                    type="button"
                    className={`dup-folder${picked ? ' active' : ''}`}
                    aria-pressed={picked}
                    title={picked
                      ? 'Показать группы во всей библиотеке'
                      : `Сохранить копии в этой папке: ${item.folder}`}
                    onClick={() => onFolder(picked ? '' : item.folder)}
                  >
                    <Icon name="folder" size={16} />
                    <span className="dup-folder-name">
                      <b>{baseName(item.folder)}</b>
                      <small>{item.folder}</small>
                    </span>
                    <span className="dup-folder-count">{formatNumber(item.copies)}</span>
                    <span className="dup-folder-bar"><span style={{width: `${(item.copies / top) * 100}%`}} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

interface GroupCardProps {
  group: DuplicateGroup;
  keep: string;
  off: boolean;
  canEdit: boolean;
  adultMode: AdultMode;
  layout: DupLayout;
  onMenu(event: MouseEvent, photo: DuplicatePhoto): void;
  /** Открыть снимок в просмотрщике: двойной щелчок или щелчок по уже оставляемому. */
  onOpen(path: string): void;
  /** Папка фильтра: тогда карточки и счёт — только по её копиям. */
  folder: string;
}

const GroupCard = memo(function GroupCard({
  group, keep, off, canEdit, adultMode, layout, onMenu, onOpen, folder,
}: GroupCardProps) {
  const toggle = useStore(state => state.toggle);
  const setKeep = useStore(state => state.setDupKeep);
  // Удаляем все копии, кроме сохраняемой в выбранной папке.
  const doomed = doomedPaths(group, keep, folder).length;
  const hidden = doomed - group.photos.filter(photo => photo.path !== keep).length;
  const kept = group.photos.find(photo => photo.path === keep) ?? group.photos[0];
  const gain = gainOf(group, keep, folder);

  return (
    <article className={`dup-group${off ? ' off' : ''}`}>
      <header className="dup-group-head">
        <span className={`dup-kind ${group.kind}`}>{group.kind === 'exact' ? 'Точные копии' : 'Похожие'}</span>
        <div className="dup-group-title">
          <strong title={kept?.path}>{kept?.filename || baseName(keep)}</strong>
          <small>
            {files(group.count)} · удалим {formatNumber(doomed)}
            {folder ? ' · оставим копию в выбранной папке' : ''}
          </small>
        </div>
        <span className="dup-gain" title="Освободится при удалении лишних">
          {gain ? `−${fileSize(gain)}` : 'пустые файлы'}
        </span>
        {canEdit && (
          <ToggleChip
            checked={!off}
            title={off
              ? 'Группа не будет очищена'
              : folder
                ? 'Останется копия в выбранной папке'
                : 'Лишние файлы этой группы будут удалены'}
            onChange={() => toggle('dupSkip', group.key)}
          >
            {off ? 'Пропустить' : 'Очистить'}
          </ToggleChip>
        )}
      </header>

      {MOSAIC[layout] > 0 && (
        <Mosaic
          group={group}
          keep={keep}
          size={MOSAIC[layout]}
          canEdit={canEdit && !off}
          adultMode={adultMode}
          onKeep={path => setKeep(group.key, path)}
          onMenu={onMenu}
          onOpen={onOpen}
          rest={hidden}
        />
      )}
      {MOSAIC[layout] === 0 && <div className="dup-row">
        {group.photos.map(photo => (
          <DupCard
            key={photo.path}
            photo={photo}
            keep={photo.path === keep}
            canEdit={canEdit && !off}
            adultMode={adultMode}
            onKeep={() => setKeep(group.key, photo.path)}
            onMenu={event => onMenu(event, photo)}
            onOpen={() => onOpen(photo.path)}
          />
        ))}
        {hidden > 0 && (
          <div className="dup-hidden">
            <b>+{formatNumber(hidden)}</b>
            <span>не показаны, тоже удалятся</span>
          </div>
        )}
      </div>}
    </article>
  );
});

interface MosaicProps {
  group: DuplicateGroup;
  keep: string;
  size: number;
  canEdit: boolean;
  adultMode: AdultMode;
  onKeep(path: string): void;
  onMenu(event: MouseEvent, photo: DuplicatePhoto): void;
  onOpen(path: string): void;
  /** Сколько копий не поместилось на плитки. */
  rest: number;
}

/**
 * Группа плиткой: совет сервера первым, дальше копии. Подробности каждого
 * файла — в подсказке и в меню по правой кнопке; на последней плитке —
 * сколько копий не поместилось.
 */
function Mosaic({group, keep, size, canEdit, adultMode, onKeep, onMenu, onOpen, rest}: MosaicProps) {
  // Порядок постоянный — совет сервера первым, как пришло. Если ставить первым
  // выбранный кадр, после щелчка плитки просто менялись местами, а отметка
  // «Оставим» оставалась на прежнем месте.
  const shown = group.photos.slice(0, size);
  const left = rest + group.photos.length - shown.length;
  return (
    <div className={`dup-mosaic cols-${size === 6 ? 3 : 2}`}>
      {shown.map((photo, index) => {
        const kept = photo.path === keep;
        const last = index === shown.length - 1 && left > 0;
        const details = [
          photo.filename || baseName(photo.path),
          fileSize(photo.size),
          photo.width ? `${photo.width}×${photo.height}` : '',
          photo.folder ?? '',
        ].filter(Boolean).join(' · ');
        return (
          <button
            key={photo.path}
            type="button"
            className={`dup-tile${kept ? ' keep' : ''}`}
            title={kept || !canEdit
              ? `${details}\nЩелчок — открыть`
              : `${details}\nЩелчок — оставить этот, двойной — открыть`}
            onClick={() => (kept || !canEdit ? onOpen(photo.path) : onKeep(photo.path))}
            onDoubleClick={() => onOpen(photo.path)}
            onContextMenu={event => onMenu(event, photo)}
          >
            <img src={photoMediaUrl(photo, adultMode, 360)} alt="" loading="lazy" decoding="async" />
            {kept && <span className="dup-mark"><Icon name="check" size={13} />Оставим</span>}
            {photo.kind === 'video' && <span className="dup-video"><Icon name="play" size={13} /></span>}
            <span className="dup-tile-size">{fileSize(photo.size)}</span>
            {last && <span className="dup-tile-rest">+{formatNumber(left)}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface DupCardProps {
  photo: DuplicatePhoto;
  keep: boolean;
  canEdit: boolean;
  adultMode: AdultMode;
  onKeep(): void;
  onMenu(event: MouseEvent): void;
  onOpen(): void;
}

function DupCard({photo, keep, canEdit, adultMode, onKeep, onMenu, onOpen}: DupCardProps) {
  const shape = photo.width ? `${photo.width}×${photo.height}` : photo.kind === 'video' ? 'видео' : '';
  const date = photoDate(photo.taken);
  return (
    <figure className={`dup-card${keep ? ' keep' : ''}`} onContextMenu={onMenu}>
      <button
        type="button"
        className="dup-card-image"
        title={keep || !canEdit ? 'Щелчок — открыть' : 'Щелчок — оставить этот файл, двойной — открыть'}
        onClick={keep || !canEdit ? onOpen : onKeep}
        onDoubleClick={onOpen}
      >
        <img src={photoMediaUrl(photo, adultMode, 360)} alt="" loading="lazy" decoding="async" />
        <span className="dup-mark">
          {keep ? <><Icon name="check" size={13} />Оставим</> : 'Удалим'}
        </span>
      </button>
      <figcaption>
        <span className="dup-card-meta">
          <b>{fileSize(photo.size)}</b>
          {shape && <span>{shape}</span>}
        </span>
        <span className="dup-card-folder" title={photo.path}>
          <Icon name="folder" size={13} />
          {photo.folder ? baseName(photo.folder) : '—'}
        </span>
        {date && <small>{date}</small>}
      </figcaption>
    </figure>
  );
}
