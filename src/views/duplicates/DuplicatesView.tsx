import {useMemo} from 'react';
import {useInfiniteQuery, useMutation} from '@tanstack/react-query';
import './DuplicatesView.scss';
import {formatNumber, megabytes, plural} from '../../lib/format';
import {getDuplicates, type DuplicatesStatus} from '../../services/endpoints/jobs';
import {deletePhotos} from '../../services/endpoints/photos';
import {photoMediaUrl} from '../../services/media';
import {qk} from '../../services/queryKeys';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import type {PhotoSummary} from '../../types/api';
import {ActionBar} from '../../ui/ActionBar/ActionBar';
import {Button} from '../../ui/Button/Button';
import {CheckRow} from '../../ui/CheckRow/CheckRow';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Hint} from '../../ui/Hint/Hint';
import {Progress} from '../../ui/Progress/Progress';
import {ViewHeader} from '../../ui/ViewHeader/ViewHeader';

const PAGE = 40;
/** Бэкенд принимает до пятисот путей за раз — удаляем партиями. */
const DELETE_BATCH = 200;

interface DupPhoto extends PhotoSummary {
  folder?: string;
}

interface DupGroup {
  key: string;
  kind: 'exact' | 'similar';
  keep: string;
  count?: number;
  extra: number;
  paths?: string[];
  photos: DupPhoto[];
}

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
  const keepChoice = useStore(state => state.duplicates.keep);
  const setKeep = useStore(state => state.setDupKeep);
  const resetChoices = useStore(state => state.resetDupChoices);
  const skipped = useStore(state => state.selection.dupSkip);
  const toggleSelection = useStore(state => state.toggle);
  const clearSelection = useStore(state => state.clear);
  const toast = useStore(state => state.toast);

  const groups = useInfiniteQuery({
    queryKey: qk.duplicates(similar),
    initialPageParam: 0,
    queryFn: ({pageParam}) => getDuplicates(similar, PAGE, pageParam as number),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + (page.groups?.length ?? 0), 0);
      return loaded < (last.total ?? 0) ? loaded : undefined;
    },
  });

  const list = useMemo(
    () => (groups.data?.pages.flatMap(page => page.groups) ?? []) as unknown as DupGroup[],
    [groups.data],
  );
  const total = groups.data?.pages[0]?.total ?? 0;

  /** Лишние в группе — все пути, кроме выбранного. */
  const extrasOf = (group: DupGroup): string[] => {
    const keep = keepChoice[group.key] || group.keep;
    return (group.paths ?? group.photos.map(photo => photo.path)).filter(path => path !== keep);
  };

  const active = list.filter(group => !skipped.has(group.key));
  const extras = active.flatMap(extrasOf);
  const bytes = active.reduce((sum, group) => sum + (group.extra || 0), 0);

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
      queryClient.invalidateQueries({queryKey: ['duplicates']});
      queryClient.invalidateQueries({queryKey: ['state']});
    },
  });

  const running = ['counting', 'running'].includes(status?.status ?? '');
  const fraction = status?.total ? (status.done ?? 0) / status.total : null;

  return (
    <section className="view active">
      <ViewHeader
        eyebrow={total
          ? `${formatNumber(total)} ${plural(total, 'группа', 'группы', 'групп')}`
          : 'Каталог'}
        title="Дубликаты"
        actions={
          <>
            <CheckRow checked={similar} onChange={setSimilar}>
              Искать и похожие, не только точные копии
            </CheckRow>
            <Button variant="primary" disabled={running} onClick={onScan}>Найти дубликаты</Button>
          </>
        }
      />

      <Hint title="Точные копии ищутся по содержимому файла">
        Сравниваются только файлы одинакового размера — другие совпасть не могут.
        Похожие (пережатые, уменьшенные) ищутся по перцептивному хешу: для этого
        каждый снимок приходится открыть, поэтому проход дольше.
      </Hint>

      {running && (
        <section className="dup-progress">
          <div className="processing-head">
            <div>
              <strong>{status?.status === 'counting'
                ? 'Собираем список файлов'
                : `Считаем хеши: ${formatNumber(status?.done ?? 0)} из ${formatNumber(status?.total ?? 0)}`}</strong>
              <span>{status?.current ?? ''}</span>
            </div>
            <b>{fraction === null ? '' : `${Math.round(fraction * 100)}%`}</b>
          </div>
          <Progress value={fraction} />
          <Button variant="danger" small onClick={onStop}>Остановить</Button>
        </section>
      )}

      {canEdit && extras.length > 0 && (
        <ActionBar
          variant="sticky"
          count={active.length}
          countLabel={`${formatNumber(active.length)} ${
            plural(active.length, 'группа', 'группы', 'групп')}`}
          actions={
            <>
              <Button small onClick={() => clearSelection('dupSkip')}>Выбрать все группы</Button>
              <span className="toolbar-spacer" />
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                Удалить лишнее — {formatNumber(extras.length)}{' '}
                {plural(extras.length, 'снимок', 'снимка', 'снимков')}, {megabytes(bytes)}
              </Button>
            </>
          }
        />
      )}

      <div className="dup-list">
        {list.map(group => {
          const keep = keepChoice[group.key] || group.keep;
          const off = skipped.has(group.key);
          return (
            <article key={group.key} className={`dup-group${off ? ' off' : ''}`}>
              <header>
                <CheckRow
                  checked={!off}
                  onChange={() => toggleSelection('dupSkip', group.key)}
                >
                  {group.kind === 'exact' ? 'Точные копии' : 'Похожие кадры'}
                  {' · '}
                  {formatNumber(group.count ?? group.photos.length)}
                </CheckRow>
                <span className="dup-gain">освободится {megabytes(group.extra)}</span>
              </header>
              <div className="dup-row">
                {group.photos.map(photo => (
                  <figure
                    key={photo.path}
                    className={`dup-card${photo.path === keep ? ' keep' : ''}`}
                    onClick={() => setKeep(group.key, photo.path)}
                  >
                    <img
                      src={photoMediaUrl(photo, adultMode, 320)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption>
                      <b>{photo.width ? `${photo.width}×${photo.height}` : megabytes(photo.size)}</b>
                      <span>
                        {photo.width
                          ? megabytes(photo.size)
                          : (photo.kind === 'video' ? 'видео' : 'точная копия')}
                      </span>
                      <small title={photo.path}>{photo.folder}</small>
                    </figcaption>
                    <span className="dup-mark">
                      {photo.path === keep ? 'оставим' : 'в корзину'}
                    </span>
                  </figure>
                ))}
                {(group.count ?? 0) > group.photos.length && (
                  <div className="dup-more">
                    и ещё {formatNumber(group.count! - group.photos.length)}
                  </div>
                )}
              </div>
            </article>
          );
        })}

        {groups.hasNextPage && (
          <Button disabled={groups.isFetchingNextPage} onClick={() => groups.fetchNextPage()}>
            Показать ещё группы
          </Button>
        )}
      </div>

      {list.length === 0 && !groups.isPending && (
        <EmptyState mark="✓" title="Дубликатов не найдено">
          Запустите поиск — он посчитает хеши и покажет повторы.
        </EmptyState>
      )}
    </section>
  );
}
