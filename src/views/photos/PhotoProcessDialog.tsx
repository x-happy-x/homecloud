import {useEffect, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {FeaturePicker} from '../../components/features/FeaturePicker';
import {formatNumber, plural} from '../../lib/format';
import {processPhotos} from '../../services/endpoints/photos';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {
  anyFeature, initialFeatures, type FeatureFlags, type MediaKind,
} from '../../store/slices/scan';
import {Button} from '../../ui/Button/Button';
import {CheckRow} from '../../ui/CheckRow/CheckRow';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {HintLine} from '../../ui/Hint/Hint';

const startingFeatures = (): Record<MediaKind, FeatureFlags> => ({
  photos: initialFeatures('photos'),
  videos: initialFeatures('videos'),
});

/** Обработка выбранных снимков на основном устройстве. */
export function PhotoProcessDialog() {
  const paths = useStore(state => state.processPaths);
  const close = useStore(state => state.closeProcess);
  const toast = useStore(state => state.toast);
  // Отмеченные этапы переживают закрытие окна, как и раньше; «заново» — нет.
  const [features, setFeatures] = useState(startingFeatures);
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (paths) setForce(false);
  }, [paths]);

  const start = useMutation({
    mutationFn: (selected: string[]) => processPhotos({
      paths: selected,
      features: features.photos,
      video_features: features.videos,
      force,
    }),
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
          if (!anyFeature(features)) {
            toast('Выберите хотя бы один этап — для снимков или для роликов');
            return;
          }
          if (paths) start.mutate(paths);
        }}
      >
        <FeaturePicker
          value={features}
          onChange={(kind, next) => setFeatures(current => ({...current, [kind]: next}))}
        />
        <CheckRow checked={force} onChange={setForce}>Переделать заново, даже если уже посчитано</CheckRow>
        <HintLine>
          Обычно повторно считается только то, что изменилось: этапы пропускают файлы, уже
          обработанные в этой же версии. Этапы для роликов применяются только к видео из
          выбранного, для снимков — только к фотографиям.
        </HintLine>
        <div className="form-actions">
          <Button onClick={close}>Отмена</Button>
          <Button variant="primary" type="submit" disabled={start.isPending}>Запустить</Button>
        </div>
      </Sheet>
    </Dialog>
  );
}
