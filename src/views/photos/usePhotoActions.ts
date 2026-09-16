import {confirmAction} from '../../services/dialogs';
import {useMutation} from '@tanstack/react-query';
import {formatNumber, plural} from '../../lib/format';
import {deletePhotos, hidePhotos, revealPhotos} from '../../services/endpoints/photos';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';

const failed = (errors: unknown[]) => (errors.length ? `, не удалось: ${errors.length}` : '');

/** Скрыть, вернуть и удалить — из панели выбора и из просмотрщика. */
export function usePhotoActions() {
  const toast = useStore(state => state.toast);
  const clear = useStore(state => state.clear);

  const refresh = () => {
    clear('photos');
    void queryClient.invalidateQueries({queryKey: ['state']});
    void queryClient.invalidateQueries({queryKey: ['photos']});
    void queryClient.invalidateQueries({queryKey: ['duplicates']});
  };

  const hide = useMutation({
    mutationFn: hidePhotos,
    onSuccess: data => { toast(`Скрыто: ${formatNumber(data.hidden)}${failed(data.errors)}`); refresh(); },
  });
  const reveal = useMutation({
    mutationFn: revealPhotos,
    onSuccess: data => { toast(`Возвращено: ${formatNumber(data.revealed)}${failed(data.errors)}`); refresh(); },
  });
  const remove = useMutation({
    mutationFn: deletePhotos,
    onSuccess: data => {
      toast(data.errors.length
        ? `Удалено ${data.deleted}, ошибок ${data.errors.length}`
        : `Перемещено в корзину: ${data.deleted}`);
      refresh();
    },
  });

  return {
    busy: hide.isPending || reveal.isPending || remove.isPending,

    /** Перенос в скрытый альбом: файл уезжает в личную папку на устройстве. */
    async hide(paths: string[], onDone?: () => void) {
      if (!paths.length) return;
      if (!await confirmAction(`Перенести ${formatNumber(paths.length)} ${plural(paths.length, 'снимок', 'снимка', 'снимков')} `
        + 'в скрытый альбом?\nФайлы переедут в личную папку и пропадут у остальных.')) return;
      hide.mutate(paths, {onSuccess: onDone});
    },

    reveal(paths: string[], onDone?: () => void) {
      if (paths.length) reveal.mutate(paths, {onSuccess: onDone});
    },

    async remove(paths: string[], onDone?: () => void) {
      const unique = [...new Set(paths)].filter(Boolean);
      if (!unique.length) return;
      if (!await confirmAction(`Переместить в корзину ${unique.length} `
        + `${plural(unique.length, 'фотографию', 'фотографии', 'фотографий')}?`)) return;
      remove.mutate(unique, {onSuccess: onDone});
    },
  };
}
