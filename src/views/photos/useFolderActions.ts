import {confirmAction} from '../../services/dialogs';
import {useMutation} from '@tanstack/react-query';
import {formatNumber} from '../../lib/format';
import {excludePath} from '../../services/endpoints/people';
import {getSettings, saveSettings} from '../../services/endpoints/settings';
import {deleteFolderMedia, moveFolderMedia} from '../../services/endpoints/photos';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import type {PickedFolder} from '../../components/FolderPicker/FolderPickerDialog';

const lines = (value: unknown): string[] =>
  String(value ?? '').split('\n').map(rule => rule.trim()).filter(Boolean);

const invalidateFolderData = () => {
  void queryClient.invalidateQueries({queryKey: ['folders']});
  void queryClient.invalidateQueries({queryKey: ['photos']});
  void queryClient.invalidateQueries({queryKey: ['state']});
  void queryClient.invalidateQueries({queryKey: qk.settings()});
};

export function useFolderActions() {
  const folder = useStore(state => state.filters.folder);
  const folderExclude = useStore(state => state.filters.folderExclude);
  const setFilters = useStore(state => state.setFilters);
  const toast = useStore(state => state.toast);

  const hide = useMutation({
    mutationFn: async (path: string) => {
      const {settings} = await queryClient.fetchQuery({queryKey: qk.settings(), queryFn: getSettings});
      const rules = lines(settings.block_paths);
      if (rules.some(rule => rule.toLowerCase() === path.toLowerCase())) return null;
      return saveSettings({block_paths: [...rules, path].join('\n')});
    },
    onSuccess: (result, path) => {
      if (!result) {
        toast('Эта папка уже в списке исключений');
        return;
      }
      toast(result.excluded === null || result.excluded === undefined
        ? 'Папка добавлена в исключения'
        : `Папка добавлена в исключения, исключено снимков: ${formatNumber(result.excluded)}`, 'success');
      if (folder && folder.startsWith(path)) setFilters({folder: ''});
      if (folderExclude && folderExclude.startsWith(path)) setFilters({folderExclude: ''});
      invalidateFolderData();
    },
    onError: (error: Error) => toast(error.message || 'Не удалось скрыть папку'),
  });

  const remove = useMutation({
    mutationFn: deleteFolderMedia,
    onSuccess: result => {
      const tail = result.folder_removed ? ', пустая папка удалена' : '';
      toast(`Удалено медиа: ${formatNumber(result.deleted)}${tail}`, 'success');
      setFilters({folder: '', folderExclude: ''});
      invalidateFolderData();
    },
    onError: (error: Error) => toast(error.message || 'Не удалось удалить папку'),
  });

  const move = useMutation({
    mutationFn: ({path, target}: {path: string; target: PickedFolder}) =>
      moveFolderMedia({folder: path, target: target.path}),
    onSuccess: result => {
      toast(`Перемещено медиа: ${formatNumber(result.moved)}`, 'success');
      setFilters({folder: result.target, folderExclude: ''});
      invalidateFolderData();
    },
    onError: (error: Error) => toast(error.message || 'Не удалось переместить папку'),
  });

  const excludeFaces = useMutation({
    mutationFn: (path: string) => excludePath(path, true),
    onSuccess: (_result, path) => {
      toast(`Лица из «${path}» исключены из группировки`, 'success');
      void queryClient.invalidateQueries({queryKey: ['state']});
    },
    onError: (error: Error) => toast(error.message || 'Не удалось исключить лица папки'),
  });

  return {
    busy: hide.isPending || remove.isPending || move.isPending || excludeFaces.isPending,
    excludeFromFilter(path: string) {
      setFilters({folder: '', folderExclude: path, album: 0});
    },
    async excludeFaces(path: string) {
      if (!await confirmAction(`Исключить все лица из папки «${path}» и вложенных?\nСами снимки останутся на месте — уйдут только лица из группировки.`)) return;
      excludeFaces.mutate(path);
    },
    async hide(path: string) {
      if (!await confirmAction(`Скрыть «${path}» из сканирования и галереи?\nПуть будет добавлен в настройки исключений.`)) return;
      hide.mutate(path);
    },
    async remove(path: string) {
      if (!await confirmAction(`Удалить все медиа из «${path}»?\nФайлы будут отправлены в корзину. Если медиа в каталоге нет, сервер попробует удалить саму пустую папку.`)) return;
      remove.mutate(path);
    },
    async move(path: string, target: PickedFolder) {
      if (!target.path) return;
      if (!await confirmAction(`Переместить все медиа из «${path}» в «${target.path}» (${target.sourceName})?`)) return;
      move.mutate({path, target});
    },
  };
}
