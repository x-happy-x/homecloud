import {Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './GroupDialog.scss';
import {VIEW_TITLES} from '../../app/routes';
import {useCatalogState} from '../../hooks/useCatalogState';
import {useGridColumns} from '../../hooks/useGridColumns';
import {useKin} from '../../hooks/useKin';
import {useLongPress} from '../../hooks/useLongPress';
import {formatNumber, percent, plural, timecode} from '../../lib/format';
import {getGroup} from '../../services/endpoints/catalog';
import {
  assignFaces, assignGroups, excludeFaces, getPersonCandidates, getSimilar,
} from '../../services/endpoints/people';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import type {CandidateFace, GroupDetail, GroupFace} from '../../types/api';
import {Button} from '../../ui/Button/Button';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {Icon} from '../../ui/Icon/Icon';
import {PersonPicker, type PickerValue} from '../../ui/PersonPicker/PersonPicker';
import {CompareDialog} from '../review/CompareDialog';
import {GroupFace as SimilarFace} from '../review/GroupFace';
import {similarTone, type SimilarGroup} from '../review/similar';
import {useMergeGroups} from '../review/useMergeGroups';
import {buildStacks, faceMoment, type FaceStack} from './stacks';

const KINDS: Record<string, string> = {
  person: 'Сохранённый человек',
  auto: 'Автоматическая группа',
  noise: 'Не сгруппированные лица',
  blurry: 'Слишком размытые лица',
  excluded: 'Исключено вручную',
};

/** Сколько подсказок «это тоже он» видно сразу, до «Показать все». */
const CANDIDATES_PREVIEW = 18;

interface SimilarReply {
  group: SimilarGroup;
  similar: Array<SimilarGroup & {score: number; verdict: string}>;
}

interface GroupChange {
  call(): Promise<unknown>;
  message: string;
}

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
    <Dialog open={Boolean(data)} onClose={close} closeThroughHistory>
      {data && <GroupSheet key={data.key} group={data} onClose={close} onOpenFace={onOpenFace} />}
    </Dialog>
  );
}

interface GroupSheetProps {
  group: GroupDetail;
  onClose(): void;
  onOpenFace(group: GroupDetail, index: number): void;
}

function GroupSheet({group, onClose, onOpenFace}: GroupSheetProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const view = useStore(state => state.view);
  const selected = useStore(state => state.selection.faces);
  const select = useStore(state => state.select);
  const clear = useStore(state => state.clear);
  const showPersonPhotos = useStore(state => state.showPersonPhotos);
  const toast = useStore(state => state.toast);
  const people = useCatalogState().data?.people;
  const kin = useKin().data;
  const [pick, setPick] = useState<PickerValue>({name: group.name ?? '', bigfamId: group.bigfam_id ?? null});
  const [comparing, setComparing] = useState<{a: string; b: string} | null>(null);
  const [stacked, setStacked] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    clear('faces');
  }, [group.key, clear]);

  useEffect(() => {
    document.title = `${group.title} · HomeCloud`;
    return () => { document.title = `${VIEW_TITLES[view]} · HomeCloud`; };
  }, [group.title, view]);

  const change = useMutation({
    mutationFn: ({call}: GroupChange) => call(),
    onSuccess: (_data, {message}) => {
      clear('faces');
      clear('groups');
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: ['group']});
      toast(message);
      onClose();
    },
  });

  const merge = useMergeGroups(onClose);

  const similar = useQuery({
    queryKey: qk.similar(group.key),
    // Похожие — подсказка, а не часть карточки: без них карточка всё равно нужна.
    queryFn: () => getSimilar<SimilarReply>(group.key, 8).catch((error: Error) => {
      console.warn('Похожие не получились:', error.message);
      return null;
    }),
    enabled: group.kind === 'person' || group.kind === 'auto',
  });

  const stacks = useMemo(() => buildStacks(group.faces), [group.faces]);
  const grid = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(grid, stacked);
  // Раскрытая стопка встаёт под конец своего ряда, а не сразу за карточкой:
  // иначе соседи по ряду съезжают вниз и сетка разваливается.
  const openAt = expanded === null ? -1 : stacks.findIndex(stack => stack.id === expanded);
  const trayAfter = openAt < 0 ? -1 : Math.min(stacks.length, (Math.floor(openAt / columns) + 1) * columns) - 1;
  const openStack = openAt < 0 ? null : stacks[openAt];
  const grouped = stacks.length < group.faces.length;
  // Просмотрщик листает кадры в том порядке, в каком они на экране: стопка
  // подряд, моменты ролика по времени — а не вперемешку по уверенности.
  const viewed = useMemo(() => {
    if (!stacked || !grouped) return {detail: group, position: null};
    const faces = stacks.flatMap(stack => stack.members.map(member => member.face));
    return {detail: {...group, faces}, position: new Map(faces.map((face, index) => [face.id, index]))};
  }, [group, stacks, stacked, grouped]);
  const openFace = useCallback((index: number) => {
    const face = group.faces[index];
    onOpenFace(viewed.detail, viewed.position?.get(face.id) ?? index);
  }, [group, viewed, onOpenFace]);
  const toggleStack = useCallback((id: number) => setExpanded(current => (current === id ? null : id)), []);
  const all = group.faces.length > 0 && selected.size === group.faces.length;
  const meta = [
    `${formatNumber(group.count)} ${plural(group.count, 'лицо', 'лица', 'лиц')}`,
    `${formatNumber(group.photos)} ${plural(group.photos, 'снимок', 'снимка', 'снимков')}`,
    grouped ? `${formatNumber(stacks.length)} ${plural(stacks.length, 'стопка', 'стопки', 'стопок')}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <>
      <Sheet
        className="group-sheet"
        eyebrow={KINDS[group.kind] || 'Группа'}
        title={group.title}
        note={meta}
        onClose={onClose}
        // Enter в поле имени не должен закрывать окно, как это делает method="dialog".
        onSubmit={() => {}}
        headActions={group.kind === 'person' && group.name && (
          <Button small onClick={() => showPersonPhotos(group.name!)}>
            <Icon name="photos" size={16} />
            <span>Фотографии</span>
          </Button>
        )}
        toolbar={canEdit && (
          <>
            <PersonPicker value={pick} onChange={setPick} placeholder="Имя человека" people={people} kin={kin} />
            <Button
              variant="primary"
              disabled={change.isPending}
              onClick={() => change.mutate({
                call: () => assignGroups({group_keys: [group.key], name: pick.name, bigfam_id: pick.bigfamId}),
                message: 'Имя сохранено',
              })}
            >
              Назначить всей группе
            </Button>
            <span className="toolbar-spacer" />
            <span className="count">{selected.size} выбрано</span>
            <Button small onClick={() => (all ? clear('faces') : select('faces', group.faces.map(face => face.id)))}>
              {all ? 'Снять выбор' : 'Выбрать все'}
            </Button>
            <Button
              small
              disabled={!selected.size || change.isPending}
              onClick={() => change.mutate({
                call: () => assignFaces({face_ids: [...selected], name: pick.name, bigfam_id: pick.bigfamId}),
                message: 'Выбранные лица назначены',
              })}
            >
              Назначить выбранным
            </Button>
            <Button
              variant="danger"
              small
              disabled={!selected.size || change.isPending}
              onClick={() => change.mutate({
                call: () => excludeFaces({face_ids: [...selected]}),
                message: 'Лица перемещены в проверку',
              })}
            >
              Исключить
            </Button>
          </>
        )}
      >
        {canEdit && group.kind === 'person' && group.name && <PersonCandidates group={group} />}

        {similar.data && similar.data.similar.length > 0 && (
          <section className="similar-block">
            <div className="section-label">Похожие группы</div>
            {similar.data.similar.map(item => (
              <div key={item.key} className="similar-row">
                <SimilarFace group={item} />
                <div className="similar-body">
                  <span className="similar-name">{item.title}</span>
                  <span className="similar-meta">
                    {formatNumber(item.count)} {plural(item.count, 'лицо', 'лица', 'лиц')} · {item.verdict}
                  </span>
                </div>
                <span className={`similar-score ${similarTone(item.score)}`}>{percent(item.score)}</span>
                <Button small onClick={() => setComparing({a: group.key, b: item.key})}>Сравнить</Button>
                {canEdit && <Button small onClick={() => merge(similar.data!.group, item)}>Объединить</Button>}
              </div>
            ))}
          </section>
        )}

        <div className="faces-head">
          <div className="section-label">Кадры</div>
          {grouped && (
            <div className="faces-mode" role="group" aria-label="Как показывать кадры">
              <button type="button" className={stacked ? 'active' : ''} aria-pressed={stacked} onClick={() => setStacked(true)}>
                <Icon name="layers" size={15} />
                <span>Стопками</span>
              </button>
              <button type="button" className={stacked ? '' : 'active'} aria-pressed={!stacked} onClick={() => setStacked(false)}>
                <Icon name="gridSix" size={15} />
                <span>Все кадры</span>
              </button>
            </div>
          )}
        </div>

        <div className="face-grid" ref={grid}>
          {stacked
            ? stacks.map((stack, position) => (
                <Fragment key={stack.id}>
                  {stack.members.length === 1
                    ? <FaceCard face={stack.top} index={stack.topIndex} pinned={stack.top.id === group.avatar_face} onOpen={openFace} />
                    : <StackCard stack={stack} open={expanded === stack.id} onToggle={toggleStack} />}
                  {position === trayAfter && openStack && openStack.members.length > 1 && (
                    <StackTray stack={openStack} avatar={group.avatar_face} onOpen={openFace} onClose={() => setExpanded(null)} />
                  )}
                </Fragment>
              ))
            : group.faces.map((face, index) => (
                <FaceCard key={face.id} face={face} index={index} pinned={face.id === group.avatar_face} onOpen={openFace} />
              ))}
        </div>
      </Sheet>
      <CompareDialog pair={comparing} onClose={() => setComparing(null)} />
    </>
  );
}

/** «Возможно, это тоже он»: безымянные лица, похожие на этого человека. */
function PersonCandidates({group}: {group: GroupDetail}) {
  const hideAdult = useStore(state => state.prefs.adultMode === 'hide');
  const toast = useStore(state => state.toast);
  const [chosen, setChosen] = useState<Set<number>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const candidates = useQuery({
    queryKey: qk.personCandidates(group.key, hideAdult),
    queryFn: () => getPersonCandidates(group.key, hideAdult),
    staleTime: 60_000,
  });

  const confirm = useMutation({
    mutationFn: (ids: number[]) => assignFaces({face_ids: ids, name: group.name, bigfam_id: group.bigfam_id}),
    onSuccess: (_data, ids) => {
      setChosen(new Set());
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: ['group']});
      void queryClient.invalidateQueries({queryKey: qk.faceSuggestions()});
      toast(`${ids.length} ${plural(ids.length, 'лицо добавлено', 'лица добавлены', 'лиц добавлено')} к «${group.title}»`, 'success');
    },
  });

  const faces = candidates.data?.faces ?? [];
  if (!faces.length) return null;
  const shown = showAll ? faces : faces.slice(0, CANDIDATES_PREVIEW);
  const toggle = (id: number) => setChosen(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <section className="candidates">
      <header className="candidates-head">
        <span className="candidates-mark" aria-hidden="true"><Icon name="people" size={18} /></span>
        <div>
          <h3>Возможно, это тоже {group.title}</h3>
          <p>
            {formatNumber(faces.length)} {plural(faces.length, 'лицо', 'лица', 'лиц')} без имени похожи на этого
            человека. Отметьте верные — после подтверждения они найдутся в поиске по имени.
          </p>
        </div>
        <div className="candidates-actions">
          <Button
            small
            onClick={() => setChosen(chosen.size === faces.length ? new Set() : new Set(faces.map(face => face.id)))}
          >
            {chosen.size === faces.length ? 'Снять отметки' : 'Отметить все'}
          </Button>
          <Button
            small
            variant="primary"
            disabled={!chosen.size || confirm.isPending}
            onClick={() => confirm.mutate([...chosen])}
          >
            Подтвердить{chosen.size ? ` · ${chosen.size}` : ''}
          </Button>
        </div>
      </header>
      <div className="candidates-grid">
        {shown.map(face => (
          <CandidateCard key={face.id} face={face} chosen={chosen.has(face.id)} onToggle={toggle} />
        ))}
        {!showAll && faces.length > shown.length && (
          <button type="button" className="candidates-more" onClick={() => setShowAll(true)}>
            ещё {formatNumber(faces.length - shown.length)}
          </button>
        )}
      </div>
    </section>
  );
}

const CandidateCard = memo(function CandidateCard({face, chosen, onToggle}: {
  face: CandidateFace;
  chosen: boolean;
  onToggle(id: number): void;
}) {
  return (
    <button
      type="button"
      className={`candidate${chosen ? ' chosen' : ''}`}
      aria-pressed={chosen}
      title={`${face.filename} · похожесть ${percent(face.score)}`}
      onClick={() => onToggle(face.id)}
    >
      <img src={face.thumbnail} alt="" loading="lazy" decoding="async" />
      <span className="candidate-score">{percent(face.score)}</span>
      {face.kind === 'video' && <span className="candidate-video" aria-label="Кадр из видео"><Icon name="play" size={11} /></span>}
      <span className="tick-mark" aria-hidden="true">✓</span>
    </button>
  );
});

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
        <span className="tick-mark" aria-hidden="true">✓</span>
        <img src={stack.top.thumbnail} alt={stack.top.filename} loading="lazy" decoding="async" />
        <span className="face-stack-count">
          <Icon name={stack.video ? 'video' : 'layers'} size={13} />
          {count}
        </span>
        <span className="face-foot">
          <span className="face-name">{label}</span>
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
            ? <>Ролик <b>{stack.top.filename}</b> · {count} {plural(count, 'момент', 'момента', 'моментов')} — нажмите, чтобы открыть видео с этого места</>
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
  const confidence = Math.round((face.confidence || 0) * 100);
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
      {confidence > 0 && <span className="face-confidence">{confidence}%</span>}
      {pinned && <span className="face-pin" title="Сейчас это аватарка">★</span>}
      {video && (
        <span className="face-moment" title="Кадр из видео — откроется с этого места">
          <Icon name="play" size={10} /> {timecode(faceMoment(face))}
        </span>
      )}
      <span className="tick-mark" aria-hidden="true">✓</span>
      <img src={face.thumbnail} alt={face.filename} loading="lazy" decoding="async" />
      <span className="face-foot"><span className="face-name">{face.filename}</span></span>
    </article>
  );
});
