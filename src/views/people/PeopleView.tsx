import {useCallback, useEffect, useMemo, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import './PeopleView.scss';
import {PersonCard} from '../../components/people/PersonCard';
import {useCatalogState} from '../../hooks/useCatalogState';
import {useKeyboardShortcuts} from '../../hooks/useKeyboardShortcuts';
import {useKin} from '../../hooks/useKin';
import {formatNumber, plural} from '../../lib/format';
import {createPeopleAlbum} from '../../services/endpoints/albums';
import {startRecluster} from '../../services/endpoints/jobs';
import {assignGroups} from '../../services/endpoints/people';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {ActionBar} from '../../ui/ActionBar/ActionBar';
import {Button} from '../../ui/Button/Button';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {InlineSearch} from '../../ui/InlineSearch/InlineSearch';
import {PersonPicker, type PickerValue} from '../../ui/PersonPicker/PersonPicker';
import {Skeleton} from '../../ui/Skeleton/Skeleton';
import {Stat, Stats, ViewHeader} from '../../ui/ViewHeader/ViewHeader';
import {PeopleAlbumTree} from './PeopleAlbumTree';

/** Шум и исключённые живут на «Проверке». */
const REVIEW_KINDS = new Set(['noise', 'excluded']);
const EMPTY_PICK: PickerValue = {name: '', bigfamId: null};
const lower = (value: string) => value.toLocaleLowerCase('ru');

export function PeopleView({onOpenGroup}: {onOpenGroup(key: string): void}) {
  const state = useCatalogState();
  const kin = useKin().data;
  const canEdit = useStore(store => store.session.canEdit);
  const query = useStore(store => store.filters.query);
  const peopleAlbum = useStore(store => store.albums.peopleAlbum);
  const groupOpen = useStore(store => Boolean(store.routeGroup));
  const selected = useStore(store => store.selection.groups);
  const toggle = useStore(store => store.toggle);
  const clear = useStore(store => store.clear);
  const openAlbumPick = useStore(store => store.openAlbumPick);
  const resetFloating = useStore(store => store.resetFloating);
  const toast = useStore(store => store.toast);
  const [search, setSearch] = useState('');
  const [pick, setPick] = useState(EMPTY_PICK);

  const data = state.data;
  const kinById = useMemo(() => new Map((kin ?? []).map(person => [person.id, person])), [kin]);
  const needle = lower((search || query).trim());

  const groups = useMemo(() => {
    const album = peopleAlbum ? data?.people_albums.find(item => item.id === peopleAlbum) : undefined;
    const inAlbum = album ? new Set(album.member_keys) : null;
    return (data?.groups ?? [])
      .filter(group => !REVIEW_KINDS.has(group.kind))
      .filter(group => !inAlbum || inAlbum.has(group.key))
      .filter(group => !needle || lower(`${group.title} ${group.name ?? ''}`).includes(needle));
  }, [data, peopleAlbum, needle]);

  // Выбор сняли — имя из прошлого выбора к следующему не относится.
  useEffect(() => {
    if (!selected.size) setPick(EMPTY_PICK);
  }, [selected.size]);

  const escape = useMemo(() => ({Escape: () => clear('groups')}), [clear]);
  useKeyboardShortcuts(escape, selected.size > 0 && !groupOpen);

  const selectGroup = useCallback((key: string) => toggle('groups', key), [toggle]);

  const named = (data?.groups ?? []).filter(group => selected.has(group.key) && group.kind === 'person');

  const assign = useMutation({
    mutationFn: () => assignGroups({group_keys: [...selected], name: pick.name, bigfam_id: pick.bigfamId}),
    onSuccess: () => {
      clear('groups');
      void queryClient.invalidateQueries({queryKey: ['state']});
      toast('Группы объединены и названы');
    },
  });

  const onAssign = () => {
    // Лица уже названных людей уедут к новому имени — о таком предупреждаем.
    const conflicts = named.filter(group => group.name !== pick.name);
    if (conflicts.length && !confirm(
      `В выборе уже названные люди: ${conflicts.map(group =>
        `${group.title} — ${group.count} ${plural(group.count, 'лицо', 'лица', 'лиц')}`).join(', ')}.`
      + `\nИх лица перейдут к «${pick.name}». Продолжить?`)) return;
    assign.mutate();
  };

  const recluster = useMutation({
    mutationFn: startRecluster,
    onSuccess: () => {
      resetFloating('recluster');
      void queryClient.invalidateQueries({queryKey: qk.reclusterStatus()});
    },
  });

  const createAlbum = useMutation({
    mutationFn: (title: string) => createPeopleAlbum(title),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ['state']});
      toast('Альбом создан');
    },
  });

  const stats = data?.stats;
  const count = selected.size;

  return (
    <section className="view active">
      <ViewHeader
        eyebrow="Библиотека лиц"
        title="Люди"
        actions={canEdit && (
          <div className="recluster">
            <Button
              small
              title="Заново разложить безымянные лица по группам"
              disabled={recluster.isPending}
              onClick={() => {
                if (!confirm('Пересобрать автоматические группы заново? Имена и исключения останутся, '
                  + 'а безымянные группы соберутся по-новому. Можно остановить в любой момент.')) return;
                recluster.mutate();
              }}
            >
              Пересобрать группы
            </Button>
          </div>
        )}
      >
        {stats && (
          <Stats>
            <Stat value={formatNumber(stats.faces)}>лиц</Stat>
            <Stat value={formatNumber(stats.photos)}>фото</Stat>
            <Stat value={formatNumber(stats.people)}>имён</Stat>
            <Stat value={formatNumber(stats.groups)}>групп</Stat>
          </Stats>
        )}
      </ViewHeader>

      <InlineSearch value={search} onChange={setSearch} placeholder="Поиск по людям" label="Поиск по людям" />
      {canEdit && (
        <p className="grid-hint">
          Нажатие открывает человека, долгое нажатие выбирает карточки для объединения.
        </p>
      )}
      {canEdit && (
        <div className="panel-actions people-album-actions">
          <Button
            small
            onClick={() => {
              const title = prompt('Название альбома, например «Родственники»');
              if (title) createAlbum.mutate(title);
            }}
          >
            Новый альбом
          </Button>
        </div>
      )}
      {data && <PeopleAlbumTree albums={data.people_albums} />}

      <div className="people-grid">
        {data
          ? groups.map(group => (
              <PersonCard
                key={group.key}
                group={group}
                kin={group.bigfam_id ? kinById.get(group.bigfam_id) ?? null : null}
                onOpen={onOpenGroup}
                onSelect={selectGroup}
              />
            ))
          : <Skeleton count={12} />}
      </div>
      {data && groups.length === 0 && (
        <EmptyState mark="◌" title="Ничего не найдено">
          Попробуйте изменить запрос или дождитесь окончания сканирования.
        </EmptyState>
      )}

      {canEdit && (
        <ActionBar
          count={count}
          countLabel={`${count} ${plural(count, 'группа', 'группы', 'групп')}`
            + (named.length ? ` · ${named.length} ${plural(named.length, 'с именем', 'с именами', 'с именами')}` : '')}
          actions={
            <>
              <PersonPicker
                value={pick}
                onChange={setPick}
                placeholder="Имя человека"
                people={data?.people}
                kin={kin}
              />
              <Button variant="primary" disabled={assign.isPending} onClick={onAssign}>Назначить</Button>
              <Button variant="ghost" small onClick={() => openAlbumPick({kind: 'people', keys: [...selected]})}>
                В альбом
              </Button>
            </>
          }
          onClear={() => clear('groups')}
        />
      )}
    </section>
  );
}
