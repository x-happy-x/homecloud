import {useEffect, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {formatNumber, plural} from '../../lib/format';
import {withFeatureDeps} from '../../lib/jobs';
import {processPhotos} from '../../services/endpoints/photos';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {DEFAULT_FEATURES, type ScanFeature} from '../../store/slices/scan';
import {Button} from '../../ui/Button/Button';
import {CheckRow} from '../../ui/CheckRow/CheckRow';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {HintLine} from '../../ui/Hint/Hint';

const PROCESS_FEATURES: Array<[ScanFeature, string, string]> = [
  ['faces', 'Лица', 'Найти лица и обновить группировку'],
  ['visual', 'Визуальный индекс', 'Содержимое, качество и смысловой поиск'],
  ['ocr', 'OCR', 'Распознать текст на изображениях'],
  ['caption', 'Описание', 'WD-теги → подробное JSON-описание через Qwen3-VL'],
  ['adult', 'Контент 18+', 'Подробные теги и области для выборочного блюра'],
  ['speech', 'Речь в видео', 'Расшифровать сказанное: субтитры и поиск по словам'],
  ['diarize', 'Кто говорит', 'Разделить голоса — подписать реплики; нужна уже расшифрованная речь'],
  ['authenticity', 'Отсеять рисованных',
    'Найти мультяшных и игровых персонажей среди лиц — не мешают группировке настоящих людей'],
];

/** Обработка выбранных снимков на основном устройстве. */
export function PhotoProcessDialog() {
  const paths = useStore(state => state.processPaths);
  const close = useStore(state => state.closeProcess);
  const toast = useStore(state => state.toast);
  // Отмеченные этапы переживают закрытие окна, как и раньше; «заново» — нет.
  const [features, setFeatures] = useState({...DEFAULT_FEATURES});
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (paths) setForce(false);
  }, [paths]);

  const start = useMutation({
    mutationFn: (selected: string[]) => processPhotos({paths: selected, features, force}),
    onSuccess: (_data, selected) => {
      close();
      toast(`Обработка запущена: ${selected.length}`);
      void queryClient.invalidateQueries({queryKey: qk.devices()});
    },
  });

  const count = paths?.length ?? 0;

  return (
    <Dialog open={Boolean(paths)} onClose={close}>
      <Sheet
        className="device-sheet"
        bodyClassName="device-form"
        eyebrow="Локальная обработка"
        title="Обработать фотографии"
        note={`${formatNumber(count)} ${plural(count, 'фотография', 'фотографии', 'фотографий')}`}
        onClose={close}
        onSubmit={() => {
          if (!Object.values(features).some(Boolean)) {
            toast('Выберите хотя бы одну возможность');
            return;
          }
          if (paths) start.mutate(paths);
        }}
      >
        <div className="feature-list">
          {PROCESS_FEATURES.map(([key, title, text]) => (
            <label key={key} className="feature-option">
              <input
                type="checkbox"
                checked={features[key]}
                onChange={event => setFeatures(withFeatureDeps(features, key, event.target.checked))}
              />
              <span><b>{title}</b><small>{text}</small></span>
            </label>
          ))}
        </div>
        <CheckRow checked={force} onChange={setForce}>Переделать заново, даже если уже посчитано</CheckRow>
        <HintLine>
          Обычно повторно считается только то, что изменилось: этапы пропускают файлы, уже
          обработанные в этой же версии.
        </HintLine>
        <div className="form-actions">
          <Button onClick={close}>Отмена</Button>
          <Button variant="primary" type="submit" disabled={start.isPending}>Запустить</Button>
        </div>
      </Sheet>
    </Dialog>
  );
}
