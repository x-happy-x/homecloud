import {useEffect, useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import {useCatalogState} from '../../../hooks/useCatalogState';
import {useKin} from '../../../hooks/useKin';
import {timecode} from '../../../lib/format';
import {assignSpeaker} from '../../../services/endpoints/photos';
import {getSpeech, type SpeechData, type SpeechSegment} from '../../../services/endpoints/speech';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import type {PhotoCard} from '../../../types/api';
import {Button} from '../../../ui/Button/Button';
import {PersonPicker, type PickerValue} from '../../../ui/PersonPicker/PersonPicker';
import {speakerIndex} from '../gallery';

const EMPTY_PICK: PickerValue = {name: '', bigfamId: null};

type SpeechReply = SpeechData & {error?: string};

export interface SpeechPanelProps {
  photo: PhotoCard;
  onSeek(seconds: number | null | undefined): void;
}

/** Расшифровка речи ролика: реплики грузятся отдельно, в списке снимков они лишние. */
export function SpeechPanel({photo, onSeek}: SpeechPanelProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const people = useCatalogState().data?.people;
  const kin = useKin().data;
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [pick, setPick] = useState(EMPTY_PICK);

  // Ключа на компоненте нет (он ломал соседние разделы), поэтому выбранного
  // говорящего сбрасываем сами при переходе к другому ролику.
  useEffect(() => {
    setSpeaker(null);
    setPick(EMPTY_PICK);
  }, [photo.path]);

  const speech = useQuery({
    queryKey: qk.speech(photo.path),
    queryFn: (): Promise<SpeechReply> => getSpeech(photo.path).catch((error: Error) => ({
      status: '', language: '', model: '', speakers: 0, segments: [], error: error.message,
    })),
  });

  const assign = useMutation({
    mutationFn: (value: {speaker: string; name: string; bigfamId: string | null}) =>
      assignSpeaker({path: photo.path, speaker: value.speaker, name: value.name, bigfam_id: value.bigfamId}),
    onSuccess: (_data, value) => {
      setSpeaker(null);
      setPick(EMPTY_PICK);
      toast(`Голос назначен: ${value.name}`);
      // Реплики закэшированы по пути — без сброса старая подпись висела бы дальше.
      void queryClient.invalidateQueries({queryKey: qk.speech(photo.path)});
      void queryClient.invalidateQueries({queryKey: ['state']});
    },
  });

  const data = speech.data;
  // Безымянная метка полезна, только когда голосов больше одного.
  const multi = (data?.speakers ?? 0) > 1;

  return (
    <section className="lightbox-speech">
      <h3>Что говорят<small>{data?.language ?? ''}</small></h3>
      <ol className="speech-lines">
        {!data
          ? <li className="speech-empty">Загружаю…</li>
          : data.segments.length
            ? data.segments.map((item, index) => (
                <li key={`${item.start}-${index}`}>
                  <button type="button" onClick={() => onSeek(item.start)}>{timecode(item.start)}</button>
                  <VoiceTag item={item} multi={multi} canEdit={canEdit} onAssign={setSpeaker} />
                  <span>{item.text}</span>
                </li>
              ))
            : <li className="speech-empty">{data.error || 'Речь не распознана'}</li>}
      </ol>

      {canEdit && speaker && (
        <div className="lightbox-assign">
          <PersonPicker value={pick} onChange={setPick} placeholder="Имя человека" people={people} kin={kin} autoFocus />
          <Button
            variant="primary"
            small
            disabled={assign.isPending}
            onClick={() => {
              if (!pick.name) {
                toast('Введите имя человека');
                return;
              }
              assign.mutate({speaker, name: pick.name, bigfamId: pick.bigfamId});
            }}
          >
            Назначить
          </Button>
          <Button variant="ghost" small onClick={() => setSpeaker(null)}>Отмена</Button>
        </div>
      )}
    </section>
  );
}

interface VoiceTagProps {
  item: SpeechSegment;
  multi: boolean;
  canEdit: boolean;
  onAssign(speaker: string): void;
}

/**
 * Кто говорит. Имя, узнанное по лицу в кадре или назначенное руками, — факт;
 * узнанное по одному голосу — с оговоркой «?». Сама метка — кнопка назначения.
 */
function VoiceTag({item, multi, canEdit, onAssign}: VoiceTagProps) {
  if (!item.speaker) return null;
  const speaker = item.speaker;
  const person = item.person;
  const guess = person?.source === 'voice';
  // Безымянная метка при одном голосе — шум для читателя, но не для того, кто
  // может её назначить: для него это единственный путь к форме.
  const label = person
    ? `${person.name}${guess ? ' ?' : ''}`
    : multi || canEdit ? `Голос ${speakerIndex(speaker) + 1}` : '';
  if (!label) return null;
  const title = guess
    ? `Похоже, по голосу (${Math.round(person!.confidence * 100)}%) — клик, чтобы поправить`
    : person ? 'Клик — назначить другое имя' : 'Клик — назначить, кто это';
  return (
    <button
      type="button"
      className={['speech-voice', guess ? 'is-guess' : '', person ? '' : 'unassigned'].filter(Boolean).join(' ')}
      data-voice={speakerIndex(speaker)}
      title={title}
      onClick={() => { if (canEdit) onAssign(speaker); }}
    >
      {label}
    </button>
  );
}
