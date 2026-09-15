import {memo, useCallback, useEffect, useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './GroupDialog.scss';
import {VIEW_TITLES} from '../../app/routes';
import {useCatalogState} from '../../hooks/useCatalogState';
import {useKin} from '../../hooks/useKin';
import {useLongPress} from '../../hooks/useLongPress';
import {formatNumber, percent, plural, timecode} from '../../lib/format';
import {getGroup} from '../../services/endpoints/catalog';
import {assignFaces, assignGroups, excludeFaces, getSimilar} from '../../services/endpoints/people';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import type {GroupDetail, GroupFace} from '../../types/api';
import {Button} from '../../ui/Button/Button';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {PersonPicker, type PickerValue} from '../../ui/PersonPicker/PersonPicker';
import {CompareDialog} from '../review/CompareDialog';
import {GroupFace as SimilarFace} from '../review/GroupFace';
import {similarTone, type SimilarGroup} from '../review/similar';
import {useMergeGroups} from '../review/useMergeGroups';

const KINDS: Record<string, string> = {
  person: 'Сохранённый человек',
  auto: 'Автоматическая группа',
  noise: 'Не сгруппированные лица',
  excluded: 'Исключено вручную',
};

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
  });

  const openFace = useCallback((index: number) => onOpenFace(group, index), [group, onOpenFace]);
  const all = group.faces.length > 0 && selected.size === group.faces.length;
  const meta = `${formatNumber(group.count)} ${plural(group.count, 'лицо', 'лица', 'лиц')} · `
    + `${formatNumber(group.photos)} фото`;

  return (
    <>
      <Sheet
        eyebrow={KINDS[group.kind] || 'Группа'}
        title={group.title}
        note={meta}
        onClose={onClose}
        // Enter в поле имени не должен закрывать окно, как это делает method="dialog".
        onSubmit={() => {}}
        headActions={group.kind === 'person' && group.name && (
          <Button small onClick={() => showPersonPhotos(group.name!)}>Фотографии</Button>
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
        <div className="face-grid">
          {group.faces.map((face, index) => (
            <FaceCard key={face.id} face={face} index={index} pinned={face.id === group.avatar_face} onOpen={openFace} />
          ))}
        </div>
      </Sheet>
      <CompareDialog pair={comparing} onClose={() => setComparing(null)} />
    </>
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

  return (
    <article
      className={`face-card${selected ? ' selected' : ''}`}
      title={face.path}
      {...hold}
      onClick={event => {
        // Пока что-то выбрано, обычный щелчок продолжает выбор.
        if (canEdit && (event.ctrlKey || event.metaKey || selecting)) toggle('faces', face.id);
        else onOpen(index);
      }}
    >
      {confidence > 0 && <span className="face-confidence">{confidence}%</span>}
      {pinned && <span className="face-pin" title="Сейчас это аватарка">★</span>}
      {face.kind === 'video' && (
        <span className="face-moment" title="Кадр из видео">▶ {timecode(face.frame_time ?? 0)}</span>
      )}
      <span className="tick-mark" aria-hidden="true">✓</span>
      <img src={face.thumbnail} alt={face.filename} loading="lazy" decoding="async" />
      <span className="face-foot"><span className="face-name">{face.filename}</span></span>
    </article>
  );
});
