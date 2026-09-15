import {useEffect, useMemo, useRef, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {useCatalogState} from '../../../hooks/useCatalogState';
import {useKin} from '../../../hooks/useKin';
import {formatNumber, shortName, timecode} from '../../../lib/format';
import {getPhoto} from '../../../services/endpoints/catalog';
import {assignFaces} from '../../../services/endpoints/people';
import {queryClient} from '../../../services/queryClient';
import {useStore} from '../../../store';
import type {PhotoCard} from '../../../types/api';
import {Avatar} from '../../../ui/Avatar/Avatar';
import {Button} from '../../../ui/Button/Button';
import {PersonPicker, type PickerValue} from '../../../ui/PersonPicker/PersonPicker';
import {Popover} from '../../../ui/Popover/Popover';
import {facesByPerson, groupTitle, type PhotoPerson} from '../gallery';
import {replacePhoto} from '../useGallery';

const HOLD_MS = 450;
const EMPTY_PICK: PickerValue = {name: '', bigfamId: null};

interface Assignment {
  faceIds: number[];
  name: string;
  bigfamId: string | null;
}

export interface FacesOverlayProps {
  photo: PhotoCard;
  onClose(): void;
  onSeek(seconds: number | null | undefined): void;
}

/**
 * Кто на снимке. Щелчок по кружку выбирает его для назначения имени, повторный
 * по названному — открывает его галерею. Удержание показывает все появления
 * человека в ролике, с перемоткой по щелчку.
 */
export function FacesOverlay({photo, onClose, onSeek}: FacesOverlayProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const showPersonPhotos = useStore(state => state.showPersonPhotos);
  const toast = useStore(state => state.toast);
  const people = useCatalogState().data?.people;
  const kin = useKin().data;
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [pick, setPick] = useState(EMPTY_PICK);
  const [held, setHeld] = useState<PhotoPerson | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justHeld = useRef(false);

  const movie = photo.kind === 'video';
  const persons = useMemo(() => facesByPerson(photo), [photo]);
  const faceIds = persons
    .filter(person => chosen.has(person.key))
    .flatMap(person => person.members.map(face => face.id))
    .filter(Boolean);

  const cancelHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelHold, []);

  const assign = useMutation({
    mutationFn: ({faceIds: ids, name, bigfamId}: Assignment) =>
      assignFaces({face_ids: ids, name, bigfam_id: bigfamId}),
    onSuccess: async (_data, {faceIds: ids, name}) => {
      setChosen(new Set());
      setPick(EMPTY_PICK);
      toast(ids.length > 1 ? `Лица назначены: ${name}` : `Лицо назначено: ${name}`);
      // И карточка в просмотрщике, и счётчики людей должны увидеть имя сразу.
      replacePhoto(await getPhoto(photo.path));
      void queryClient.invalidateQueries({queryKey: ['state']});
    },
  });

  const openGallery = (name: string) => {
    onClose();
    showPersonPhotos(name);
  };

  const click = (person: PhotoPerson) => {
    if (justHeld.current) {
      justHeld.current = false;
      return;
    }
    // На видео щелчок сначала мотает к первому появлению — видно, о ком речь.
    const lead = person.members[0];
    if (movie && lead?.frame_time != null) onSeek(lead.frame_time);
    if (!canEdit) {
      if (person.name) openGallery(person.name);
      return;
    }
    if (chosen.has(person.key)) {
      if (person.name) {
        openGallery(person.name);
        return;
      }
      setChosen(current => {
        const next = new Set(current);
        next.delete(person.key);
        return next;
      });
      return;
    }
    setChosen(current => new Set(current).add(person.key));
  };

  const startHold = (person: PhotoPerson, element: HTMLElement) => {
    if (person.members.length < 2) return;
    cancelHold();
    timer.current = setTimeout(() => {
      justHeld.current = true;
      anchor.current = element;
      setHeld(person);
    }, HOLD_MS);
  };

  return (
    <>
      <h3>{movie ? 'Кто в видео' : 'Кто на фото'}</h3>
      <div className="lightbox-people">
        {persons.length
          ? persons.map(person => {
              const lead = person.members[0];
              const named = Boolean(person.name);
              const known = named ? people?.find(item => item.name === person.name) : undefined;
              const relative = person.bigfam_id ? kin?.find(item => item.id === person.bigfam_id) : undefined;
              const seekAt = movie && lead?.frame_time != null ? lead.frame_time : null;
              const hint = named
                ? 'Клик — выбрать, ещё раз — открыть галерею'
                : 'Клик — выбрать для назначения имени';
              // Названному — портрет из картотеки или аватарка группы, безымянному — сам кадр.
              const sources = named
                ? [person.bigfam_id ? `/media/bigfam/${person.bigfam_id}` : '', known?.avatar]
                : [lead?.thumbnail];
              return (
                <button
                  key={person.key}
                  type="button"
                  className={[
                    'bubble', named ? '' : 'face-unnamed', canEdit ? '' : 'readonly',
                    chosen.has(person.key) ? 'selected' : '',
                  ].filter(Boolean).join(' ')}
                  title={movie ? `${hint} · удержать — все появления` : hint}
                  onClick={() => click(person)}
                  onPointerDown={event => startHold(person, event.currentTarget)}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  onPointerCancel={cancelHold}
                >
                  <span className="bubble-photo">
                    <Avatar srcs={sources} name={person.name || '?'} />
                    {person.members.length > 1 && <i className="bubble-count">×{person.members.length}</i>}
                    {seekAt != null && <i className="bubble-time">{timecode(seekAt)}</i>}
                  </span>
                  <span className="bubble-name">
                    {named ? shortName(person.name, relative) : groupTitle(person.key)}
                  </span>
                </button>
              );
            })
          : (
            <span className="photo-unknown">
              {photo.face_count ? `${formatNumber(photo.face_count)} лиц без имени` : 'Лица не найдены'}
            </span>
          )}
      </div>

      <Popover open={Boolean(held)} anchor={anchor} onClose={() => setHeld(null)} className="face-popover">
        {held?.members.map(face => (
          <button
            key={face.id}
            type="button"
            onClick={() => { onSeek(face.frame_time ?? 0); setHeld(null); }}
          >
            <img src={face.thumbnail} alt="" loading="lazy" />
            {face.frame_time != null && <i className="bubble-time">{timecode(face.frame_time)}</i>}
          </button>
        ))}
      </Popover>

      {canEdit && chosen.size > 0 && (
        <div className="lightbox-assign">
          <PersonPicker value={pick} onChange={setPick} placeholder="Имя человека" people={people} kin={kin} />
          <Button
            variant="primary"
            small
            disabled={assign.isPending}
            onClick={() => {
              if (!pick.name) {
                toast('Введите имя человека');
                return;
              }
              if (faceIds.length) assign.mutate({faceIds, name: pick.name, bigfamId: pick.bigfamId});
            }}
          >
            {faceIds.length > 1 ? `Назначить (${faceIds.length})` : 'Назначить'}
          </Button>
          <Button variant="ghost" small onClick={() => setChosen(new Set())}>Отмена</Button>
        </div>
      )}
    </>
  );
}
