import {confirmAction, promptText} from '../../services/dialogs';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './PeopleView.scss';
import {avatarSources, PersonCard, REVIEW_KINDS, type PersonSuggestion} from '../../components/people/PersonCard';
import {useCatalogState} from '../../hooks/useCatalogState';
import {useKeyboardShortcuts} from '../../hooks/useKeyboardShortcuts';
import {useKin} from '../../hooks/useKin';
import {useSwipeScroll} from '../../hooks/useSwipeScroll';
import {formatNumber, percent, plural, shortName} from '../../lib/format';
import {createPeopleAlbum} from '../../services/endpoints/albums';
import {startRecluster} from '../../services/endpoints/jobs';
import {assignGroups, getFaceSuggestions} from '../../services/endpoints/people';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import type {Group, KinPerson, NamedPerson} from '../../types/api';
import {ActionBar} from '../../ui/ActionBar/ActionBar';
import {Avatar} from '../../ui/Avatar/Avatar';
import {Button} from '../../ui/Button/Button';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Icon} from '../../ui/Icon/Icon';
import {InlineSearch} from '../../ui/InlineSearch/InlineSearch';
import {PersonPicker, type PickerValue} from '../../ui/PersonPicker/PersonPicker';
import {Skeleton} from '../../ui/Skeleton/Skeleton';
import {PeopleAlbumTree} from './PeopleAlbumTree';

const EMPTY_PICK: PickerValue = {name: '', bigfamId: null};
const lower = (value: string) => value.toLocaleLowerCase('ru');
/** Сколько лиц в шапке: больше — уже не украшение, а шум. */
const HERO_FACES = 7;
/** Сколько догадок в ленте сверху; остальные — на карточках групп. */
const GUESS_RAIL = 12;

type Mode = 'all' | 'named' | 'unnamed';

interface Guess {
  name: string;
  score: number;
  bigfamId: string | null;
  faces: number;
}

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
  const namedOnly = useStore(store => store.prefs.peopleNamedOnly);
  const setNamedOnly = useStore(store => store.setPeopleNamedOnly);
  const [search, setSearch] = useState('');
  const [pick, setPick] = useState(EMPTY_PICK);
  // «Только с именами» помнится между заходами, «только без имени» — нет:
  // это разовая разборка, а не привычный вид.
  const [unnamedOnly, setUnnamedOnly] = useState(false);
  const mode: Mode = unnamedOnly ? 'unnamed' : namedOnly ? 'named' : 'all';
  const setMode = (next: Mode) => {
    setUnnamedOnly(next === 'unnamed');
    setNamedOnly(next === 'named');
  };

  const data = state.data;
  const kinById = useMemo(() => new Map((kin ?? []).map(person => [person.id, person])), [kin]);
  const needle = lower((search || query).trim());

  const visible = useMemo(() => {
    const album = peopleAlbum ? data?.people_albums.find(item => item.id === peopleAlbum) : undefined;
    const inAlbum = album ? new Set(album.member_keys) : null;
    return (data?.groups ?? [])
      .filter(group => !REVIEW_KINDS.has(group.kind))
      .filter(group => !inAlbum || inAlbum.has(group.key))
      .filter(group => !needle || lower(`${group.title} ${group.name ?? ''}`).includes(needle));
  }, [data, peopleAlbum, needle]);
  const named = useMemo(() => visible.filter(group => group.kind === 'person'), [visible]);
  const unnamed = useMemo(() => visible.filter(group => group.kind !== 'person'), [visible]);

  // Выбор сняли — имя из прошлого выбора к следующему не относится.
  useEffect(() => {
    if (!selected.size) setPick(EMPTY_PICK);
  }, [selected.size]);

  const escape = useMemo(() => ({Escape: () => clear('groups')}), [clear]);
  useKeyboardShortcuts(escape, selected.size > 0 && !groupOpen);

  const selectGroup = useCallback((key: string) => toggle('groups', key), [toggle]);

  // Подсказки считаются по запросу и не участвуют в опросе состояния: там
  // каждые полторы секунды, а здесь надо поднять векторы безымянных лиц.
  const suggestions = useQuery({
    queryKey: qk.faceSuggestions(),
    queryFn: getFaceSuggestions,
    enabled: canEdit,
    staleTime: 60_000,
  });
  const guesses = useMemo(() => new Map<string, Guess>(
    (suggestions.data?.suggestions ?? []).map(item =>
      [item.key, {name: item.name, score: item.score, bigfamId: item.bigfam_id ?? null, faces: item.faces}])),
    [suggestions.data]);

  const accept = useMutation({
    mutationFn: ({key, name, bigfamId}: {key: string; name: string; bigfamId: string | null}) =>
      assignGroups({group_keys: [key], name, bigfam_id: bigfamId}),
    onSuccess: (_result, {name}) => {
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: qk.faceSuggestions()});
      toast(`Группа названа: ${name}`, 'success');
    },
  });

  const onAccept = useCallback((key: string, guess: PersonSuggestion) => {
    const found = guesses.get(key);
    if (!found) return;
    accept.mutate({key, name: guess.name, bigfamId: found.bigfamId});
  }, [accept, guesses]);

  const namedSelected = (data?.groups ?? []).filter(group => selected.has(group.key) && group.kind === 'person');

  const assign = useMutation({
    mutationFn: () => assignGroups({group_keys: [...selected], name: pick.name, bigfam_id: pick.bigfamId}),
    onSuccess: () => {
      clear('groups');
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: qk.faceSuggestions()});
      toast('Группы объединены и названы');
    },
  });

  const onAssign = async () => {
    // Лица уже названных людей уедут к новому имени — о таком предупреждаем.
    const conflicts = namedSelected.filter(group => group.name !== pick.name);
    if (conflicts.length && !await confirmAction(
      `В выборе уже названные люди: ${conflicts.map(group =>
        `${group.title} — ${group.count} ${plural(group.count, 'лицо', 'лица', 'лиц')}`).join(', ')}.`
      + `\nИх лица перейдут к «${pick.name}». Продолжить?`)) return;
    assign.mutate();
  };

  const recluster = useMutation({
    mutationFn: (scope: 'all' | 'leftovers') => startRecluster(scope),
    onSuccess: () => {
      resetFloating('recluster');
      void queryClient.invalidateQueries({queryKey: qk.reclusterStatus()});
      // Группы соберутся заново — прежние догадки к ним уже не относятся.
      void queryClient.invalidateQueries({queryKey: qk.faceSuggestions()});
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
  const rail = useMemo(() => (data?.groups ?? [])
    .filter(group => group.kind === 'auto' && guesses.has(group.key))
    .sort((a, b) => guesses.get(b.key)!.score - guesses.get(a.key)!.score)
    .slice(0, GUESS_RAIL), [data, guesses]);
  const track = useRef<HTMLDivElement>(null);
  const modes = useRef<HTMLDivElement>(null);
  useSwipeScroll(track, rail.length > 0);
  useSwipeScroll(modes);
  const showNamed = mode !== 'unnamed' && named.length > 0;
  const showUnnamed = mode !== 'named' && unnamed.length > 0;
  const nothing = data && !(mode !== 'unnamed' && named.length) && !(mode !== 'named' && unnamed.length);

  return (
    <section className="view active people-view">
      <header className="people-hero">
        <div className="people-hero-text">
          <p className="eyebrow">Библиотека лиц</p>
          <h1>Люди</h1>
          {stats && (
            <p className="people-hero-note">
              <b>{formatNumber(stats.people)}</b> {plural(stats.people, 'человек', 'человека', 'человек')} с именем
              {' · '}<b>{formatNumber(stats.groups)}</b> {plural(stats.groups, 'группа', 'группы', 'групп')} ждут имени
              {' · '}<b>{formatNumber(stats.faces)}</b> {plural(stats.faces, 'лицо', 'лица', 'лиц')}
              {' на '}<b>{formatNumber(stats.with_faces)}</b> {plural(stats.with_faces, 'снимке', 'снимках', 'снимках')}
            </p>
          )}
        </div>
        {data && <FacePile people={data.people} kin={kinById} />}
        {canEdit && (
          <div className="people-hero-actions">
            <Button
              small
              variant="ghost"
              title="Поискать группы среди лиц, которые не собрались ни в одну — не трогая уже собранное"
              disabled={recluster.isPending}
              onClick={async () => {
                if (!await confirmAction('Разобрать остаток? Второй проход пройдёт только по лицам, которые '
                  + 'не попали ни в одну группу, и соберёт из них новые. Уже собранные группы, '
                  + 'имена и исключения не изменятся.')) return;
                recluster.mutate('leftovers');
              }}
            >
              <Icon name="unfoldMore" size={16} />
              <span>Разобрать остаток</span>
            </Button>
            <Button
              small
              title="Заново разложить безымянные лица по группам"
              disabled={recluster.isPending}
              onClick={async () => {
                if (!await confirmAction('Пересобрать автоматические группы заново? Имена и исключения останутся, '
                  + 'а безымянные группы соберутся по-новому. Можно остановить в любой момент.')) return;
                recluster.mutate('all');
              }}
            >
              <Icon name="process" size={16} />
              <span>Пересобрать группы</span>
            </Button>
          </div>
        )}
      </header>

      <div className="people-toolbar">
        <InlineSearch value={search} onChange={setSearch} placeholder="Найти человека" label="Поиск по людям" />
        <div className="people-modes" ref={modes} role="group" aria-label="Какие группы показывать">
          {([
            ['all', 'Все', visible.length],
            ['named', 'С именами', named.length],
            ['unnamed', 'Без имени', unnamed.length],
          ] as Array<[Mode, string, number]>).map(([id, label, total]) => (
            <button key={id} type="button" className={mode === id ? 'active' : ''} aria-pressed={mode === id} onClick={() => setMode(id)}>
              {label}
              {data && <small>{formatNumber(total)}</small>}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button
            small
            variant="ghost"
            onClick={async () => {
              const title = await promptText('Название альбома, например «Родственники»');
              if (title) createAlbum.mutate(title);
            }}
          >
            <Icon name="plus" size={16} />
            <span>Альбом</span>
          </Button>
        )}
      </div>

      {data && <PeopleAlbumTree albums={data.people_albums} />}

      {canEdit && mode !== 'named' && !needle && rail.length > 0 && (
        <section className="guess-rail" aria-label="Похожие на знакомых">
          <div className="people-section-head">
            <h2>Узнали знакомых</h2>
            <p>Эти группы без имени похожи на уже названных людей. Подтвердите — и их снимки найдутся по имени.</p>
          </div>
          <div className="guess-track swipe-rail" ref={track}>
            {rail.map(group => (
              <GuessCard
                key={group.key}
                group={group}
                guess={guesses.get(group.key)!}
                person={data?.people.find(person => person.name === guesses.get(group.key)!.name)}
                kin={kinById}
                busy={accept.isPending}
                onOpen={onOpenGroup}
                onAccept={onAccept}
              />
            ))}
          </div>
        </section>
      )}

      {!data && <div className="people-grid"><Skeleton count={12} /></div>}

      {showNamed && (
        <section className="people-section">
          <div className="people-section-head">
            <h2>С именами <small>{formatNumber(named.length)}</small></h2>
          </div>
          <div className="people-grid">
            {named.map(group => (
              <PersonCard
                key={group.key}
                group={group}
                kin={group.bigfam_id ? kinById.get(group.bigfam_id) ?? null : null}
                onOpen={onOpenGroup}
                onSelect={selectGroup}
              />
            ))}
          </div>
        </section>
      )}

      {showUnnamed && (
        <section className="people-section">
          <div className="people-section-head">
            <h2>Без имени <small>{formatNumber(unnamed.length)}</small></h2>
            {canEdit && (
              <p>Откройте группу, чтобы назвать её. Долгое нажатие выбирает несколько групп — их можно объединить под одним именем.</p>
            )}
          </div>
          <div className="people-grid compact">
            {unnamed.map(group => (
              <PersonCard
                key={group.key}
                group={group}
                compact
                suggestion={guesses.get(group.key) ?? null}
                onOpen={onOpenGroup}
                onSelect={selectGroup}
                onAccept={onAccept}
              />
            ))}
          </div>
        </section>
      )}

      {nothing && (
        <EmptyState mark="◌" title="Никого не нашлось">
          Попробуйте изменить запрос или фильтр — или дождитесь окончания сканирования.
        </EmptyState>
      )}

      {canEdit && (
        <ActionBar
          count={count}
          countLabel={`${count} ${plural(count, 'группа', 'группы', 'групп')}`
            + (namedSelected.length
              ? ` · ${namedSelected.length} ${plural(namedSelected.length, 'с именем', 'с именами', 'с именами')}`
              : '')}
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

/** Несколько лиц внахлёст в шапке — самые «населённые» люди каталога. */
function FacePile({people, kin}: {people: NamedPerson[]; kin: Map<string, KinPerson>}) {
  const top = useMemo(() => [...people].sort((a, b) => b.count - a.count).slice(0, HERO_FACES), [people]);
  if (top.length < 3) return null;
  return (
    <div className="face-pile" aria-hidden="true">
      {top.map(person => (
        <span key={person.name} className="face-pile-item" title={person.name}>
          <Avatar
            srcs={[person.bigfam_id && kin.get(person.bigfam_id)?.avatar, person.avatar]}
            name={person.name}
          />
        </span>
      ))}
    </div>
  );
}

interface GuessCardProps {
  group: Group;
  guess: Guess;
  person?: NamedPerson;
  kin: Map<string, KinPerson>;
  busy: boolean;
  onOpen(key: string): void;
  onAccept(key: string, suggestion: PersonSuggestion): void;
}

/** Догадка крупно: безымянная группа рядом с человеком, на которого похожа. */
function GuessCard({group, guess, person, kin, busy, onOpen, onAccept}: GuessCardProps) {
  const known = guess.bigfamId ? kin.get(guess.bigfamId) ?? null : null;
  const name = shortName(guess.name, known);
  return (
    <article className="guess-card">
      <button type="button" className="guess-faces" onClick={() => onOpen(group.key)} title="Открыть группу">
        <span className="guess-face unknown"><Avatar srcs={avatarSources(group)} name="?" /></span>
        <span className="guess-link" aria-hidden="true">≈</span>
        <span className="guess-face known">
          <Avatar srcs={[known?.avatar, person?.avatar]} name={guess.name} />
        </span>
      </button>
      <div className="guess-text">
        <strong title={guess.name}>{name}?</strong>
        <span>
          {formatNumber(group.count)} {plural(group.count, 'лицо', 'лица', 'лиц')} · похожесть {percent(guess.score)}
        </span>
      </div>
      <div className="guess-actions">
        <Button small variant="primary" disabled={busy} onClick={() => onAccept(group.key, guess)}>
          <Icon name="check" size={15} />
          <span>Да</span>
        </Button>
        <Button small variant="ghost" onClick={() => onOpen(group.key)}>Посмотреть</Button>
      </div>
    </article>
  );
}
