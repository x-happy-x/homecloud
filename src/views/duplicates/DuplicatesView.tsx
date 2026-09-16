import {memo, useMemo} from 'react';
import {useInfiniteQuery, useMutation} from '@tanstack/react-query';
import './DuplicatesView.scss';
import {fileSize, formatNumber, photoDate, plural} from '../../lib/format';
import {
  getDuplicates, type DuplicateGroup, type DuplicatePhoto, type DuplicatesStatus, type DuplicatesSummary,
} from '../../services/endpoints/jobs';
import {deletePhotos} from '../../services/endpoints/photos';
import {photoMediaUrl} from '../../services/media';
import {qk} from '../../services/queryKeys';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import type {DupKind, DupSort} from '../../store/slices/duplicates';
import type {AdultMode} from '../../types/domain';
import {ActionBar} from '../../ui/ActionBar/ActionBar';
import {Button} from '../../ui/Button/Button';
import {Chip, ToggleChip} from '../../ui/Chip/Chip';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Icon} from '../../ui/Icon/Icon';
import {Progress} from '../../ui/Progress/Progress';
import {SectionHead} from '../../ui/ViewHeader/ViewHeader';

const PAGE = 30;
/** Бэкенд принимает до пятисот путей за раз — удаляем партиями. */
const DELETE_BATCH = 200;

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

  const groups = useInfiniteQuery({
    queryKey: qk.duplicates(similar, {...filters}),
    initialPageParam: 0,
    queryFn: ({pageParam}) => getDuplicates(similar, filters, PAGE, pageParam as number),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + (page.groups?.length ?? 0), 0);
      return loaded < (last.total ?? 0) && last.groups.length ? loaded : undefined;
    },
  });

  const list = useMemo(() => groups.data?.pages.flatMap(page => page.groups) ?? [], [groups.data]);
  const total = groups.data?.pages[0]?.total ?? 0;
  const summary = groups.data?.pages[0]?.summary;

  const keepOf = (group: DuplicateGroup) => keepChoice[group.key] || group.keep;
  /** Лишние в группе — все пути, кроме выбранного. */
  const extrasOf = (group: DuplicateGroup) => group.paths.filter(path => path !== keepOf(group));

  const active = list.filter(group => !skipped.has(group.key));
  const extras = active.flatMap(extrasOf);
  const bytes = active.reduce((sum, group) => sum + gainOf(group, keepOf(group)), 0);

  const remove = useMutation({
    mutationFn: async () => {
      let deleted = 0;
      let failed = 0;
      for (let from = 0; from < extras.length; from += DELETE_BATCH) {
        const data = await deletePhotos(extras.slice(from, from + DELETE_BATCH)) as
          {deleted: number; errors: unknown[]};
        deleted += data.deleted;
        failed += data.errors.length;
        toast(`Удалено ${formatNumber(deleted)} из ${formatNumber(extras.length)}…`);
      }
      return {deleted, failed};
    },
    onSuccess: ({deleted, failed}) => {
      toast(`Удалено: ${formatNumber(deleted)}${failed ? `, ошибок: ${failed}` : ''}`,
        failed ? 'error' : 'success');
      resetChoices();
      clearSelection('dupSkip');
      void queryClient.invalidateQueries({queryKey: ['duplicates']});
      void queryClient.invalidateQueries({queryKey: ['state']});
    },
  });

  const confirmRemove = () => {
    const text = `Удалить ${files(extras.length)} (${fileSize(bytes)}) из ${groupsText(active.length)}?\n`
      + 'В каждой группе останется отмеченный снимок. Файлы удаляются с диска устройства.';
    if (confirm(text)) remove.mutate();
  };

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

      {summary && summary.groups > 0 && <Summary summary={summary} similar={similar} />}

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
          <ToggleChip
            checked={filters.hideSmall}
            title="Файлы меньше 100 КБ — обычно иконки и картинки программ"
            onChange={hideSmall => setFilters({hideSmall})}
          >
            Скрыть мелкие файлы{summary?.small_groups ? ` · ${formatNumber(summary.small_groups)}` : ''}
          </ToggleChip>
        </div>
      )}

      {canEdit && extras.length > 0 && (
        <ActionBar
          variant="sticky"
          count={active.length}
          countLabel={`${groupsText(active.length)} · удалим ${files(extras.length)} · ${fileSize(bytes)}`}
          actions={
            <>
              {skipped.size > 0
                ? <Button small onClick={() => clearSelection('dupSkip')}>Выбрать все показанные</Button>
                : <Button small onClick={() => selectSkipped('dupSkip', list.map(group => group.key))}>Снять выбор</Button>}
              <span className="toolbar-spacer" />
              <Button variant="danger" disabled={remove.isPending} onClick={confirmRemove}>
                <Icon name="trash" size={16} />
                <span>Удалить лишнее</span>
              </Button>
            </>
          }
        />
      )}

      <div className="dup-list">
        {list.map(group => (
          <GroupCard
            key={group.key}
            group={group}
            keep={keepOf(group)}
            off={skipped.has(group.key)}
            canEdit={canEdit}
            adultMode={adultMode}
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

      {list.length === 0 && !groups.isPending && !running && (
        <EmptyState mark="✓" title={summary?.groups ? 'Под фильтр ничего не попало' : 'Дубликатов не найдено'}>
          {summary?.groups
            ? 'Снимите «Скрыть мелкие файлы» или выберите другой вид групп.'
            : 'Запустите поиск — он посчитает хеши файлов и покажет повторы.'}
        </EmptyState>
      )}
    </section>
  );
}

/** Сколько освободит группа, если оставить keep: сервер считал для своего выбора. */
function gainOf(group: DuplicateGroup, keep: string): number {
  if (keep === group.keep) return group.extra;
  const size = (path: string) => group.photos.find(photo => photo.path === path)?.size ?? 0;
  return Math.max(0, group.extra + size(group.keep) - size(keep));
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

function Summary({summary, similar}: {summary: DuplicatesSummary; similar: boolean}) {
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
          <h4>Где больше всего лишних копий</h4>
          <ul>
            {summary.top_folders.map(item => (
              <li key={item.folder} title={item.folder}>
                <Icon name="folder" size={16} />
                <span className="dup-folder-name">
                  <b>{baseName(item.folder)}</b>
                  <small>{item.folder}</small>
                </span>
                <span className="dup-folder-count">{formatNumber(item.copies)}</span>
                <span className="dup-folder-bar"><span style={{width: `${(item.copies / top) * 100}%`}} /></span>
              </li>
            ))}
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
}

const GroupCard = memo(function GroupCard({group, keep, off, canEdit, adultMode}: GroupCardProps) {
  const toggle = useStore(state => state.toggle);
  const setKeep = useStore(state => state.setDupKeep);
  const hidden = group.count - group.photos.length;
  const kept = group.photos.find(photo => photo.path === keep) ?? group.photos[0];
  const gain = gainOf(group, keep);

  return (
    <article className={`dup-group${off ? ' off' : ''}`}>
      <header className="dup-group-head">
        <span className={`dup-kind ${group.kind}`}>{group.kind === 'exact' ? 'Точные копии' : 'Похожие'}</span>
        <div className="dup-group-title">
          <strong title={kept?.path}>{kept?.filename || baseName(keep)}</strong>
          <small>{files(group.count)} · удалим {formatNumber(group.count - 1)}</small>
        </div>
        <span className="dup-gain" title="Освободится при удалении лишних">
          {gain ? `−${fileSize(gain)}` : 'пустые файлы'}
        </span>
        {canEdit && (
          <ToggleChip
            checked={!off}
            title={off ? 'Группа не будет очищена' : 'Лишние файлы этой группы будут удалены'}
            onChange={() => toggle('dupSkip', group.key)}
          >
            {off ? 'Пропустить' : 'Очистить'}
          </ToggleChip>
        )}
      </header>

      <div className="dup-row">
        {group.photos.map(photo => (
          <DupCard
            key={photo.path}
            photo={photo}
            keep={photo.path === keep}
            canEdit={canEdit && !off}
            adultMode={adultMode}
            onKeep={() => setKeep(group.key, photo.path)}
          />
        ))}
        {hidden > 0 && (
          <div className="dup-hidden">
            <b>+{formatNumber(hidden)}</b>
            <span>не показаны, тоже удалятся</span>
          </div>
        )}
      </div>
    </article>
  );
});

interface DupCardProps {
  photo: DuplicatePhoto;
  keep: boolean;
  canEdit: boolean;
  adultMode: AdultMode;
  onKeep(): void;
}

function DupCard({photo, keep, canEdit, adultMode, onKeep}: DupCardProps) {
  const shape = photo.width ? `${photo.width}×${photo.height}` : photo.kind === 'video' ? 'видео' : '';
  const date = photoDate(photo.taken);
  return (
    <figure className={`dup-card${keep ? ' keep' : ''}`}>
      <button
        type="button"
        className="dup-card-image"
        disabled={!canEdit || keep}
        title={keep ? 'Этот файл останется' : 'Оставить этот файл'}
        onClick={onKeep}
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
