import {Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode} from 'react';
import {useMutation, useQuery, type UseMutationResult} from '@tanstack/react-query';
import './GroupDialog.scss';
import {VIEW_TITLES} from '../../app/routes';
import {useCatalogState} from '../../hooks/useCatalogState';
import {useGridColumns} from '../../hooks/useGridColumns';
import {useKin} from '../../hooks/useKin';
import {useLongPress} from '../../hooks/useLongPress';
import {isOffline, useSourceStatus} from '../../hooks/useSourceStatus';
import {formatNumber, percent, plural, timecode} from '../../lib/format';
import {getGroup} from '../../services/endpoints/catalog';
import {
  assignFaces, assignGroups, excludeFaces, getPersonCandidates, getPersonCompanions, getSimilar,
  rejectCandidates, setAvatar, type CatalogChangeReply,
} from '../../services/endpoints/people';
import {density, photoMediaUrl} from '../../services/media';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import type {CandidateFace, GroupDetail, GroupFace} from '../../types/api';
import type {Photo} from '../../types/domain';
import {Button} from '../../ui/Button/Button';
import {Dialog} from '../../ui/Dialog/Dialog';
import {Icon, type IconName} from '../../ui/Icon/Icon';
import {PersonPicker, type PickerValue} from '../../ui/PersonPicker/PersonPicker';
import {bigfamPersonUrl} from '../photos/gallery';
import {CompareDialog} from '../review/CompareDialog';
import {GroupFace as SimilarFace} from '../review/GroupFace';
import {similarTone, type SimilarGroup} from '../review/similar';
import {useMergeGroups} from '../review/useMergeGroups';
import {
  buildMedia, byYear, coverFocus, matchesKind, newestFirst, summary, type KindFilter, type MediaItem,
} from './personMedia';
import {buildStacks, faceMoment, type FaceStack} from './stacks';

const KINDS: Record<string, string> = {
  person: 'Человек',
  auto: 'Автоматическая группа',
  noise: 'Не сгруппированные лица',
  blurry: 'Слишком размытые лица',
  excluded: 'Исключено вручную',
};

/** Сколько подсказок «это тоже он» видно сразу, до «Показать все». */
const CANDIDATES_PREVIEW = 12;
/** «Похожие люди» раскрыты сами, только если кто-то похож всерьёз. */
const SIMILAR_OPEN_SCORE = 0.7;

interface SimilarReply {
  group: SimilarGroup;
  similar: Array<SimilarGroup & {score: number; verdict: string}>;
}

interface GroupChange {
  call(): Promise<unknown>;
  message: string;
  /** После назначения всей группы открыть получившегося человека в том же окне. */
  target?: PickerValue;
}

type ViewMode = 'faces' | 'media';

export interface GroupDialogProps {
  /** Лицо открывается в общем просмотрщике — его подключает оболочка. */
  onOpenFace(group: GroupDetail, index: number): void;
}

/** Карточка группы лиц. Открыта, пока группа записана в адресе. */
export function GroupDialog({onOpenFace}: GroupDialogProps) {
  const key = useStore(state => state.routeGroup);
  const setRouteGroup = useStore(state => state.setRouteGroup);
  const hideAdult = useStore(state => state.prefs.adultMode === 'hide');
  const close = useCallback(() => setRouteGroup(''), [setRouteGroup]);

  const group = useQuery({
    queryKey: qk.group(key, hideAdult),
    queryFn: () => getGroup(key, hideAdult),
    enabled: Boolean(key),
  });

  // Группы больше нет (объединили, пересобрали) — ссылка на неё ведёт в никуда.
  useEffect(() => {
    if (key && group.isError) close();
  }, [key, group.isError, close]);

  const data = key ? group.data : undefined;
  return (
    <Dialog open={Boolean(data)} onClose={close} closeThroughHistory className="group-dialog">
      {data && <GroupCard key={data.key} group={data} onClose={close} onOpenFace={onOpenFace} />}
    </Dialog>
  );
}

interface GroupCardProps {
  group: GroupDetail;
  onClose(): void;
  onOpenFace(group: GroupDetail, index: number): void;
}

function GroupCard({group, onClose, onOpenFace}: GroupCardProps) {
  const setRouteGroup = useStore(state => state.setRouteGroup);
  const canEdit = useStore(state => state.session.canEdit);
  const view = useStore(state => state.view);
  const clear = useStore(state => state.clear);
  const toast = useStore(state => state.toast);
  const [mode, setMode] = useState<ViewMode>('faces');
  const [kind, setKind] = useState<KindFilter>('all');
  const [stacked, setStacked] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [comparing, setComparing] = useState<{a: string; b: string} | null>(null);
  const mediaFocus = useStore(state => state.prefs.mediaFocus);
  const setMediaFocus = useStore(state => state.setMediaFocus);

  useEffect(() => {
    clear('faces');
  }, [group.key, clear]);

  useEffect(() => {
    document.title = `${group.title} · HomeCloud`;
    return () => { document.title = `${VIEW_TITLES[view]} · HomeCloud`; };
  }, [group.title, view]);

  const change = useMutation({
    mutationFn: ({call}: GroupChange) => call(),
    onSuccess: (data, {message, target}) => {
      clear('faces');
      clear('groups');
      const state = (data as Partial<CatalogChangeReply> | undefined)?.state;
      if (target && state) {
        const next = state.groups.find(item => target.bigfamId
          ? item.bigfam_id === target.bigfamId
          : item.name === target.name);
        if (next) setRouteGroup(next.key);
      }
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: ['group']});
      toast(message);
    },
    onError: error => toast(error instanceof Error ? error.message : 'Не получилось'),
  });

  // Лента свежими сверху; фильтр «фото / видео» действует на оба вида.
  const ordered = useMemo(
    () => newestFirst(group.faces.filter(face => matchesKind(face.kind, kind))),
    [group.faces, kind],
  );
  const stacks = useMemo(() => buildStacks(ordered), [ordered]);
  const orderIndex = useMemo(() => new Map(ordered.map((face, index) => [face.id, index])), [ordered]);
  const grouped = stacks.length < ordered.length;
  const media = useMemo(() => buildMedia(ordered), [ordered]);
  const facts = useMemo(() => summary(group.faces), [group.faces]);

  // Просмотрщик листает то же, что на экране и в том же порядке: в «Медиа» —
  // каждый файл один раз, в стопках — стопка подряд.
  const viewer = useMemo(() => {
    const faces = mode === 'media'
      ? media.map(item => (item.kind === 'video' ? item.faces[0] : item.best))
      : stacked && grouped ? stacks.flatMap(stack => stack.members.map(member => member.face)) : ordered;
    return {detail: {...group, faces}, position: new Map(faces.map((face, index) => [face.id, index]))};
  }, [group, mode, media, stacks, stacked, grouped, ordered]);
  const openFace = useCallback((face: GroupFace) => {
    onOpenFace(viewer.detail, viewer.position.get(face.id) ?? 0);
  }, [viewer, onOpenFace]);
  const openAt = useCallback((index: number) => openFace(ordered[index]), [openFace, ordered]);
  const toggleStack = useCallback((id: number) => setExpanded(current => (current === id ? null : id)), []);

  const sections = mode === 'media'
    ? byYear(media, item => item.taken)
    : stacked ? byYear(stacks, stack => stack.members[0].face.taken) : byYear(ordered, face => face.taken);
  const rail = group.kind === 'person' || group.kind === 'auto';

  return (
    <>
      <div className="pcard">
        <PersonHead group={group} facts={facts} change={change} onClose={onClose} />
        <div className={`pcard-body${rail ? '' : ' no-rail'}`}>
          <div className="pcard-main">
            <div className="pcard-viewbar">
              <div className="pcard-seg" role="tablist" aria-label="Что показывать">
                <button type="button" role="tab" aria-selected={mode === 'faces'} onClick={() => setMode('faces')}>
                  <Icon name="people" size={15} />Лица<small>{formatNumber(group.faces.length)}</small>
                </button>
                <button type="button" role="tab" aria-selected={mode === 'media'} onClick={() => { setMode('media'); clear('faces'); }}>
                  <Icon name="photos" size={15} />Медиа<small>{formatNumber(facts.photos + facts.videos)}</small>
                </button>
              </div>
              <div className="pcard-chips" role="radiogroup" aria-label="Какие файлы">
                {([['all', 'Всё'], ['photo', 'Фото'], ['video', 'Видео']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={kind === value}
                    onClick={() => setKind(value)}>{label}</button>
                ))}
              </div>
              <span className="pcard-spacer" />
              {mode === 'media' && (
                <button type="button" className={`pcard-toggle${mediaFocus ? ' on' : ''}`} aria-pressed={mediaFocus}
                  title="Размыть фон вокруг лица: рядом чуть-чуть, дальше сильнее" onClick={() => setMediaFocus(!mediaFocus)}>
                  <Icon name="people" size={15} /><span>Фокус на лице</span>
                </button>
              )}
              {mode === 'faces' && grouped && (
                <button type="button" className={`pcard-toggle${stacked ? ' on' : ''}`} aria-pressed={stacked}
                  title="Похожие кадры и моменты одного ролика — одной карточкой" onClick={() => setStacked(value => !value)}>
                  <Icon name="layers" size={15} /><span>Стопками</span>
                </button>
              )}
            </div>

            {sections.length === 0 && <p className="pcard-empty">Таких файлов у этой группы нет</p>}
            {sections.map(section => (
              <YearSection
                key={`${mode}-${section.year ?? 'none'}`}
                year={section.year}
                note={mode === 'media'
                  ? `${formatNumber(section.items.length)} ${plural(section.items.length, 'файл', 'файла', 'файлов')}`
                  : ''}
              >
                {mode === 'media'
                  ? <div className="pcard-media">{(section.items as MediaItem[]).map(item => (
                      <MediaTile key={item.path} item={item} onOpen={openFace} />
                    ))}</div>
                  : stacked
                    ? <StackGrid stacks={section.items as FaceStack[]} avatar={group.avatar_face}
                        expanded={expanded} onToggle={toggleStack} onOpen={openAt} />
                    : <div className="face-grid">{(section.items as GroupFace[]).map(face => (
                        <FaceCard key={face.id} face={face} index={orderIndex.get(face.id) ?? 0}
                          pinned={face.id === group.avatar_face} onOpen={openAt} />
                      ))}</div>}
              </YearSection>
            ))}

            {canEdit && mode === 'faces' && <SelectionBar group={group} change={change} visible={ordered} />}
          </div>

          {rail && (
            <aside className="pcard-rail">
              {canEdit && group.kind === 'person' && group.name && <CandidatesBlock group={group} />}
              <SimilarBlock group={group} onCompare={b => setComparing({a: group.key, b})} />
              <CompanionsBlock group={group} />
            </aside>
          )}
        </div>
      </div>
      <CompareDialog pair={comparing} onClose={() => setComparing(null)} />
    </>
  );
}

// ---------- шапка ----------

interface PersonHeadProps {
  group: GroupDetail;
  facts: ReturnType<typeof summary>;
  change: UseMutationResult<unknown, Error, GroupChange>;
  onClose(): void;
}

function PersonHead({group, facts, change, onClose}: PersonHeadProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const bigfamUrl = useStore(state => state.session.bigfamUrl);
  const showPersonPhotos = useStore(state => state.showPersonPhotos);
  const people = useCatalogState().data?.people;
  const kin = useKin().data;
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<PickerValue>({name: group.name ?? '', bigfamId: group.bigfam_id ?? null});
  const avatar = group.avatar || group.faces[0]?.thumbnail || '';
  const years = facts.from && facts.to ? (facts.from === facts.to ? `${facts.from}` : `${facts.from} — ${facts.to}`) : '';

  const save = () => {
    if (!pick.name.trim()) return;
    change.mutate({
      call: () => assignGroups({group_keys: [group.key], name: pick.name, bigfam_id: pick.bigfamId}),
      message: group.name ? 'Имя сохранено' : 'Группа названа',
      target: pick,
    });
    setEditing(false);
  };

  return (
    <header className="pcard-head">
      <div className="pcard-avatar">
        {avatar ? <img src={avatar} alt="" /> : <Icon name="people" size={30} />}
      </div>
      <div className="pcard-who">
        <div className="pcard-eyebrow">
          {KINDS[group.kind] || 'Группа'}
          {group.bigfam_id && <span>· в картотеке</span>}
        </div>
        {editing ? (
          <div className="pcard-rename">
            <PersonPicker value={pick} onChange={setPick} placeholder="Имя человека" people={people} kin={kin} />
            <Button variant="primary" small disabled={change.isPending || !pick.name.trim()} onClick={save}>
              {group.kind === 'person' ? 'Сохранить' : 'Назвать группу'}
            </Button>
            <Button small onClick={() => setEditing(false)}>Отмена</Button>
          </div>
        ) : (
          <h2>
            <span>{group.title}</span>
            {canEdit && (
              <button type="button" className="pcard-edit" title={group.name ? 'Переименовать' : 'Назвать'}
                onClick={() => setEditing(true)}>
                <Icon name="edit" size={16} />
              </button>
            )}
          </h2>
        )}
        <div className="pcard-stats">
          <span><b>{formatNumber(group.count)}</b> {plural(group.count, 'лицо', 'лица', 'лиц')}</span>
          {facts.photos > 0 && <span><Icon name="photos" size={13} /><b>{formatNumber(facts.photos)}</b> {plural(facts.photos, 'снимок', 'снимка', 'снимков')}</span>}
          {facts.videos > 0 && <span><Icon name="play" size={13} /><b>{formatNumber(facts.videos)}</b> {plural(facts.videos, 'ролик', 'ролика', 'роликов')}</span>}
          {years && <span>{years}</span>}
        </div>
      </div>
      <div className="pcard-head-actions">
        {group.kind === 'person' && group.name && (
          <Button small onClick={() => showPersonPhotos(group.name!)}>
            <Icon name="photos" size={16} /><span>Все фото</span>
          </Button>
        )}
        {group.bigfam_id && bigfamUrl && (
          <a className="button small" href={bigfamPersonUrl(bigfamUrl, group.bigfam_id)} target="_blank" rel="noopener">
            <Icon name="openExternal" size={16} /><span>Картотека</span>
          </a>
        )}
        <button type="button" className="pcard-close" aria-label="Закрыть" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>
    </header>
  );
}

// ---------- лента ----------

function YearSection({year, note, children}: {year: number | null; note: string; children: ReactNode}) {
  return (
    <section className="pcard-year">
      <h3>{year ?? 'Без даты'}{note && <small>{note}</small>}</h3>
      {children}
    </section>
  );
}

interface StackGridProps {
  stacks: FaceStack[];
  avatar: number | null;
  expanded: number | null;
  onToggle(id: number): void;
  onOpen(index: number): void;
}

/** Сетка стопок одного года; раскрытая стопка встаёт под конец своего ряда. */
function StackGrid({stacks, avatar, expanded, onToggle, onOpen}: StackGridProps) {
  const grid = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(grid, true);
  const openAt = expanded === null ? -1 : stacks.findIndex(stack => stack.id === expanded);
  const trayAfter = openAt < 0 ? -1 : Math.min(stacks.length, (Math.floor(openAt / columns) + 1) * columns) - 1;
  const openStack = openAt < 0 ? null : stacks[openAt];
  return (
    <div className="face-grid" ref={grid}>
      {stacks.map((stack, position) => (
        <Fragment key={stack.id}>
          {stack.members.length === 1
            ? <FaceCard face={stack.top} index={stack.topIndex} pinned={stack.top.id === avatar} onOpen={onOpen} />
            : <StackCard stack={stack} open={expanded === stack.id} onToggle={onToggle} />}
          {position === trayAfter && openStack && openStack.members.length > 1 && (
            <StackTray stack={openStack} avatar={avatar} onOpen={onOpen} onClose={() => onToggle(openStack.id)} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

/** Файл, где человек есть: рамка вокруг лица, у ролика — моменты на полосе. */
const MediaTile = memo(function MediaTile({item, onOpen}: {item: MediaItem; onOpen(face: GroupFace): void}) {
  const adultMode = useStore(state => state.prefs.adultMode);
  const status = useSourceStatus(item.best.source);
  const offline = isOffline(status);
  const video = item.kind === 'video';
  const mediaFocus = useStore(state => state.prefs.mediaFocus);
  // Фон вокруг лица размыт двумя слоями: рядом чуть-чуть, дальше сильно.
  const focus = mediaFocus && !video ? coverFocus(item.best) : null;
  const duration = item.best.duration || 0;
  const src = item.best.preview
    ? photoMediaUrl({preview: item.best.preview, adult_rating: item.best.adult_rating} as Photo,
      adultMode, Math.round(320 * density()))
    : item.best.thumbnail;
  const count = item.faces.length;
  const when = item.taken ? new Date(item.taken * 1000).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'}) : '';

  return (
    <button type="button" className={`pcard-shot${video ? ' is-video' : ''}${offline ? ' offline' : ''}`}
      title={offline ? `${item.path}
Недоступно: «${status!.name}» не в сети` : item.path}
      onClick={() => onOpen(video ? item.faces[0] : item.best)}>
      <span className="pcard-shot-pic">
        <img src={src} alt="" loading="lazy" decoding="async" />
        {focus && (
          <>
            <img className="pcard-shot-blur near" src={src} alt="" aria-hidden="true" loading="lazy" decoding="async"
              style={focusMask(focus, 1.9, 0.55)} />
            <img className="pcard-shot-blur far" src={src} alt="" aria-hidden="true" loading="lazy" decoding="async"
              style={focusMask(focus, 3.4, 0.5)} />
          </>
        )}
        {offline && <span className="pcard-shot-offline"><Icon name="hide" size={11} />Недоступно</span>}
        {video && (
          <>
            <span className="pcard-shot-badge"><Icon name="play" size={11} />{duration ? timecode(duration) : 'видео'}</span>
            {duration > 0 && (
              <span className="pcard-shot-moments" aria-hidden="true">
                {item.faces.map(face => (
                  <i key={face.id} style={{left: `${Math.min(100, faceMoment(face) / duration * 100)}%`}} />
                ))}
              </span>
            )}
          </>
        )}
      </span>
      <span className="pcard-shot-cap">
        <b>{item.filename}</b>
        <span>
          {[when, video ? `${count} ${plural(count, 'момент', 'момента', 'моментов')}`
            : count > 1 ? `${count} ${plural(count, 'лицо', 'лица', 'лиц')}` : ''].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  );
});

/**
 * Маска размытого слоя: прозрачна вокруг лица (там снимок резкий), дальше
 * проступает размытие. spread — во сколько раз эллипс маски больше лица,
 * clear — какая его доля остаётся прозрачной.
 */
function focusMask(focus: {x: number; y: number; rx: number; ry: number}, spread: number, clear: number) {
  const mask = `radial-gradient(ellipse ${focus.rx * spread}% ${focus.ry * spread}% at ${focus.x}% ${focus.y}%, `
    + `transparent ${clear * 100}%, #000 100%)`;
  return {maskImage: mask, WebkitMaskImage: mask};
}

// ---------- выбор ----------

interface SelectionBarProps {
  group: GroupDetail;
  change: UseMutationResult<unknown, Error, GroupChange>;
  /** Что сейчас на экране — «Выбрать все» берёт только это. */
  visible: GroupFace[];
}

/** Панель действий с выбранными лицами — всплывает снизу, пока что-то выбрано. */
function SelectionBar({group, change, visible}: SelectionBarProps) {
  const selected = useStore(state => state.selection.faces);
  const select = useStore(state => state.select);
  const clear = useStore(state => state.clear);
  const people = useCatalogState().data?.people;
  const kin = useKin().data;
  const [other, setOther] = useState(false);
  const [pick, setPick] = useState<PickerValue>({name: '', bigfamId: null});
  const count = selected.size;
  const all = count > 0 && visible.every(face => selected.has(face.id));

  useEffect(() => {
    if (!count) setOther(false);
  }, [count]);

  return (
    <div className={`pcard-selbar${count ? ' show' : ''}`} aria-hidden={!count}>
      <b>{formatNumber(count)}</b><span className="pcard-selbar-label">выбрано</span>
      {other ? (
        <>
          <PersonPicker value={pick} onChange={setPick} placeholder="Кому" people={people} kin={kin} />
          <Button small variant="primary" disabled={!pick.name.trim() || change.isPending}
            onClick={() => change.mutate({
              call: () => assignFaces({face_ids: [...selected], name: pick.name, bigfam_id: pick.bigfamId}),
              message: `Лица переданы: ${pick.name}`,
            })}>
            Передать
          </Button>
          <Button small variant="ghost" onClick={() => setOther(false)}>Назад</Button>
        </>
      ) : (
        <>
          <Button small variant="danger" disabled={change.isPending}
            onClick={() => change.mutate({
              call: () => excludeFaces({face_ids: [...selected]}),
              message: 'Лица убраны в «Проверку»',
            })}>
            <Icon name="close" size={15} />{group.kind === 'person' ? `Это не ${group.title}` : 'Убрать из группы'}
          </Button>
          <Button small onClick={() => setOther(true)}><Icon name="people" size={15} />Другому…</Button>
          {count === 1 && (
            <Button small disabled={change.isPending}
              onClick={() => change.mutate({
                call: () => setAvatar({key: group.key, face_id: [...selected][0]}),
                message: 'Аватарка обновлена',
              })}>
              <Icon name="star" size={15} />Аватаркой
            </Button>
          )}
          <Button small variant="ghost" onClick={() => (all ? clear('faces') : select('faces', visible.map(face => face.id)))}>
            {all ? 'Снять все' : 'Выбрать все'}
          </Button>
        </>
      )}
      <button type="button" className="pcard-selbar-close" aria-label="Снять выбор" onClick={() => clear('faces')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

// ---------- правая колонка ----------

interface RailBlockProps {
  icon: IconName;
  title: string;
  count?: number;
  /** Жёлтый счётчик с пульсом: здесь ждут решения. */
  hot?: boolean;
  defaultOpen: boolean;
  children: ReactNode;
}

/** Сворачиваемый блок правой колонки. На узком экране блоки свёрнуты сразу. */
function RailBlock({icon, title, count, hot, defaultOpen, children}: RailBlockProps) {
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
  const [open, setOpen] = useState(defaultOpen && !narrow);
  return (
    <section className={`pcard-block${open ? ' open' : ''}`}>
      <button type="button" className="pcard-block-head" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span className="pcard-block-icon"><Icon name={icon} size={16} /></span>
        <h4>{title}</h4>
        {count !== undefined && <span className={`pcard-count${hot ? ' hot' : ''}`}>{formatNumber(count)}</span>}
        <Icon name="chevronDown" size={16} className="pcard-chevron" />
      </button>
      {open && <div className="pcard-block-body">{children}</div>}
    </section>
  );
}

/** «Возможно, это тоже он»: безымянные лица, похожие на этого человека. */
function CandidatesBlock({group}: {group: GroupDetail}) {
  const hideAdult = useStore(state => state.prefs.adultMode === 'hide');
  const toast = useStore(state => state.toast);
  const [done, setDone] = useState<Set<number>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const candidates = useQuery({
    queryKey: qk.personCandidates(group.key, hideAdult),
    queryFn: () => getPersonCandidates(group.key, hideAdult),
    staleTime: 60_000,
  });

  const settle = (ids: number[]) => setDone(current => new Set([...current, ...ids]));
  const unsettle = (ids: number[]) => setDone(current => {
    const next = new Set(current);
    for (const id of ids) next.delete(id);
    return next;
  });

  const accept = useMutation({
    mutationFn: (ids: number[]) => assignFaces({face_ids: ids, name: group.name, bigfam_id: group.bigfam_id}),
    onMutate: settle,
    onSuccess: (_data, ids) => {
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: qk.group(group.key, hideAdult)});
      void queryClient.invalidateQueries({queryKey: qk.faceSuggestions()});
      toast(`${ids.length} ${plural(ids.length, 'лицо добавлено', 'лица добавлены', 'лиц добавлено')} к «${group.title}»`, 'success');
    },
    onError: (error, ids) => {
      unsettle(ids);
      toast(error instanceof Error ? error.message : 'Не получилось добавить');
    },
  });
  const reject = useMutation({
    mutationFn: (ids: number[]) => rejectCandidates(group.key, ids),
    onMutate: settle,
    onError: (error, ids) => {
      unsettle(ids);
      toast(error instanceof Error ? error.message : 'Не получилось отклонить');
    },
  });

  const faces = (candidates.data?.faces ?? []).filter(face => !done.has(face.id));
  const shown = showAll ? faces : faces.slice(0, CANDIDATES_PREVIEW);
  if (!candidates.data?.faces.length) return null;

  return (
    <RailBlock icon="searchImage" title={`Возможно, это тоже ${group.title.split(' ')[0]}`} count={faces.length}
      hot={faces.length > 0} defaultOpen>
      {faces.length === 0 ? (
        <p className="pcard-hint">Все подсказки разобраны.</p>
      ) : (
        <>
          <p className="pcard-hint">Безымянные лица, похожие на этого человека. ✓ — добавить, ✕ — больше не предлагать.</p>
          <div className="pcard-cands">
            {shown.map(face => (
              <CandidateTile key={face.id} face={face}
                onAccept={() => accept.mutate([face.id])} onReject={() => reject.mutate([face.id])} />
            ))}
          </div>
          <div className="pcard-block-actions">
            <Button small variant="primary" disabled={accept.isPending}
              onClick={() => accept.mutate(shown.map(face => face.id))}>
              <Icon name="check" size={15} />{shown.length === faces.length ? 'Все верные' : `Эти ${shown.length} верные`}
            </Button>
            {!showAll && faces.length > shown.length && (
              <Button small onClick={() => setShowAll(true)}>Ещё {formatNumber(faces.length - shown.length)}</Button>
            )}
          </div>
        </>
      )}
    </RailBlock>
  );
}

const CandidateTile = memo(function CandidateTile({face, onAccept, onReject}: {
  face: CandidateFace;
  onAccept(): void;
  onReject(): void;
}) {
  return (
    <div className="pcard-cand" title={`${face.filename} · похожесть ${percent(face.score)}`}>
      <img src={face.thumbnail} alt="" loading="lazy" decoding="async" />
      <span className="pcard-cand-score">{percent(face.score)}</span>
      {face.kind === 'video' && <span className="pcard-cand-video" aria-label="Кадр из видео"><Icon name="play" size={10} /></span>}
      <span className="pcard-cand-actions">
        <button type="button" className="yes" aria-label="Это он — добавить" onClick={onAccept}><Icon name="check" size={15} /></button>
        <button type="button" className="no" aria-label="Не он — больше не предлагать" onClick={onReject}><Icon name="close" size={15} /></button>
      </span>
    </div>
  );
});

function SimilarBlock({group, onCompare}: {group: GroupDetail; onCompare(key: string): void}) {
  const canEdit = useStore(state => state.session.canEdit);
  const setRouteGroup = useStore(state => state.setRouteGroup);
  const merge = useMergeGroups(target => setRouteGroup(target.key));
  const similar = useQuery({
    queryKey: qk.similar(group.key),
    // Похожие — подсказка, а не часть карточки: без них карточка всё равно нужна.
    queryFn: () => getSimilar<SimilarReply>(group.key, 8).catch((error: Error) => {
      console.warn('Похожие не получились:', error.message);
      return null;
    }),
  });
  const items = similar.data?.similar ?? [];
  if (!items.length) return null;
  return (
    <RailBlock icon="people" title="Похожие люди" count={items.length}
      defaultOpen={items.some(item => item.score >= SIMILAR_OPEN_SCORE)}>
      <p className="pcard-hint">Группы, которые могут быть им же. Сравните перед объединением.</p>
      {items.map(item => (
        <div key={item.key} className="pcard-person pcard-similar">
          <SimilarFace group={item} />
          <div className="pcard-person-body">
            <span className="pcard-person-title">
              <b>{item.title}</b>
              <span className={`similar-score pcard-score ${similarTone(item.score)}`}>{percent(item.score)}</span>
            </span>
            <small>{formatNumber(item.count)} {plural(item.count, 'лицо', 'лица', 'лиц')} · {item.verdict}</small>
            <span className="pcard-person-actions">
              <Button small onClick={() => onCompare(item.key)}>Сравнить</Button>
              {canEdit && <Button small onClick={() => merge(similar.data!.group, item)}>Объединить</Button>}
            </span>
          </div>
        </div>
      ))}
    </RailBlock>
  );
}

/** «Часто рядом»: с кем человек чаще всего в одном снимке или ролике. */
function CompanionsBlock({group}: {group: GroupDetail}) {
  const hideAdult = useStore(state => state.prefs.adultMode === 'hide');
  const setRouteGroup = useStore(state => state.setRouteGroup);
  const companions = useQuery({
    queryKey: qk.personCompanions(group.key, hideAdult),
    queryFn: () => getPersonCompanions(group.key, hideAdult),
    staleTime: 60_000,
  });
  const items = companions.data?.companions ?? [];
  if (!items.length) return null;
  const top = items[0].shared;
  return (
    <RailBlock icon="people" title="Часто рядом" count={items.length} defaultOpen>
      {items.map(item => (
        <button key={item.key} type="button" className="pcard-person pcard-companion" onClick={() => setRouteGroup(item.key)}>
          <img className="pcard-person-avatar" src={item.avatar} alt="" loading="lazy" />
          <span className="pcard-person-body">
            <b>{item.title}</b>
            <small>вместе в {formatNumber(item.shared)} {plural(item.shared, 'файле', 'файлах', 'файлах')}</small>
            <span className="pcard-meter"><i style={{width: `${Math.max(6, item.shared / top * 100)}%`}} /></span>
          </span>
          <Icon name="chevronRight" size={16} className="pcard-chevron-right" />
        </button>
      ))}
    </RailBlock>
  );
}

// ---------- плитки лиц ----------

interface StackCardProps {
  stack: FaceStack;
  open: boolean;
  onToggle(id: number): void;
}

/** Несколько похожих кадров одной карточкой: щелчок раскрывает стопку. */
const StackCard = memo(function StackCard({stack, open, onToggle}: StackCardProps) {
  const ids = useMemo(() => stack.members.map(member => member.face.id), [stack]);
  const selected = useStore(state => ids.every(id => state.selection.faces.has(id)));
  const partly = useStore(state => !selected && ids.some(id => state.selection.faces.has(id)));
  const selecting = useStore(state => state.selection.faces.size > 0);
  const canEdit = useStore(state => state.session.canEdit);
  const select = useStore(state => state.select);

  // Стопка выбирается целиком: лица в ней — одно и то же появление человека.
  const toggleAll = useCallback(() => {
    const current = new Set(useStore.getState().selection.faces);
    const every = ids.every(id => current.has(id));
    for (const id of ids) {
      if (every) current.delete(id);
      else current.add(id);
    }
    select('faces', [...current]);
  }, [ids, select]);
  const hold = useLongPress(() => { if (canEdit) toggleAll(); });

  const count = stack.members.length;
  const label = stack.video
    ? `${count} ${plural(count, 'момент', 'момента', 'моментов')} из ролика`
    : `${count} ${plural(count, 'похожий кадр', 'похожих кадра', 'похожих кадров')}`;

  return (
    <article
      className={`face-card face-stack${selected ? ' selected' : ''}${partly ? ' partly' : ''}${open ? ' open' : ''}`}
      title={`${label} — нажмите, чтобы раскрыть`}
      aria-expanded={open}
      {...hold}
      onClick={(event: MouseEvent) => {
        if (canEdit && (event.ctrlKey || event.metaKey || selecting)) toggleAll();
        else onToggle(stack.id);
      }}
    >
      <span className="face-stack-sheet" aria-hidden="true" />
      <span className="face-stack-sheet second" aria-hidden="true" />
      <span className="face-stack-body">
        {canEdit && (
          <button type="button" className="face-pick" aria-label="Выбрать стопку"
            onClick={event => { event.stopPropagation(); toggleAll(); }}>
            <Icon name="check" size={13} />
          </button>
        )}
        <img src={stack.top.thumbnail} alt={stack.top.filename} loading="lazy" decoding="async" />
        <span className="face-stack-count">
          <Icon name={stack.video ? 'video' : 'layers'} size={12} />
          ×{count}
        </span>
      </span>
    </article>
  );
});

interface StackTrayProps {
  stack: FaceStack;
  avatar: number | null;
  onOpen(index: number): void;
  onClose(): void;
}

/** Раскрытая стопка — во всю ширину сетки, сразу под своей карточкой. */
function StackTray({stack, avatar, onOpen, onClose}: StackTrayProps) {
  const count = stack.members.length;
  return (
    <div className="face-stack-tray">
      <div className="face-stack-tray-head">
        <span>
          {stack.video
            ? <>Ролик <b>{stack.top.filename}</b> · {count} {plural(count, 'момент', 'момента', 'моментов')} — откроется с этого места</>
            : <>{count} {plural(count, 'похожий кадр', 'похожих кадра', 'похожих кадров')}</>}
        </span>
        <button type="button" className="face-stack-close" onClick={onClose}>
          <Icon name="unfoldLess" size={16} />
          <span>Свернуть</span>
        </button>
      </div>
      <div className="face-grid">
        {stack.members.map(({face, index}) => (
          <FaceCard key={face.id} face={face} index={index} pinned={face.id === avatar} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

interface FaceCardProps {
  face: GroupFace;
  index: number;
  /** Этот кадр сейчас стоит аватаркой группы. */
  pinned: boolean;
  onOpen(index: number): void;
}

const FaceCard = memo(function FaceCard({face, index, pinned, onOpen}: FaceCardProps) {
  const selected = useStore(state => state.selection.faces.has(face.id));
  const selecting = useStore(state => state.selection.faces.size > 0);
  const canEdit = useStore(state => state.session.canEdit);
  const toggle = useStore(state => state.toggle);
  const hold = useLongPress(() => { if (canEdit) toggle('faces', face.id); });
  const video = face.kind === 'video';

  return (
    <article
      className={`face-card${selected ? ' selected' : ''}`}
      title={video ? `${face.path}\nОткрыть видео с ${timecode(faceMoment(face))}` : face.path}
      {...hold}
      onClick={event => {
        // Пока что-то выбрано, обычный щелчок продолжает выбор.
        if (canEdit && (event.ctrlKey || event.metaKey || selecting)) toggle('faces', face.id);
        else onOpen(index);
      }}
    >
      {canEdit && (
        <button type="button" className="face-pick" aria-label="Выбрать лицо"
          onClick={event => { event.stopPropagation(); toggle('faces', face.id); }}>
          <Icon name="check" size={13} />
        </button>
      )}
      {pinned && <span className="face-pin" title="Сейчас это аватарка"><Icon name="star" size={11} /></span>}
      {video && (
        <span className="face-moment" title="Кадр из видео — откроется с этого места">
          <Icon name="play" size={10} /> {timecode(faceMoment(face))}
        </span>
      )}
      <img src={face.thumbnail} alt={face.filename} loading="lazy" decoding="async" />
    </article>
  );
});
