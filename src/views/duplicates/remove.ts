import {formatNumber} from '../../lib/format';
import {deleteDevicePhotos, deletePhotos} from '../../services/endpoints/photos';
import {store} from '../../store';

const DELETE_BATCH = 200;

/** Карточка задачи остаётся в общем центре уведомлений при смене экрана. */
export interface DuplicateDeleteTarget {path: string; deviceId?: string}

export async function deleteDuplicatesWithProgress(targets: Array<string | DuplicateDeleteTarget>) {
  const paths = targets.map(item => typeof item === 'string' ? {path: item} : item);
  const {setJob, finishJob} = store.getState();
  const id = `duplicates-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let deleted = 0;
  let failed = 0;
  const resultText = () => `Удалено: ${formatNumber(deleted)} из ${formatNumber(paths.length)}`
    + (failed ? ` · ошибок: ${formatNumber(failed)}` : '');
  const progress = (done: number) => setJob(id, {
    title: 'Удаление дубликатов',
    sub: resultText(),
    level: 'info',
    progress: paths.length ? done / paths.length : 1,
    spinning: true,
    meta: 'Перемещение файлов в корзину',
  });
  progress(0);
  try {
    for (let from = 0; from < paths.length; from += DELETE_BATCH) {
      const batch = paths.slice(from, from + DELETE_BATCH);
      const grouped = new Map<string, string[]>();
      for (const item of batch) {
        const key = item.deviceId || '';
        grouped.set(key, [...(grouped.get(key) ?? []), item.path]);
      }
      for (const [deviceId, devicePaths] of grouped) {
        const data = deviceId
          ? await deleteDevicePhotos(deviceId, devicePaths)
          : await deletePhotos(devicePaths);
        deleted += data.deleted;
        failed += data.errors.length;
      }
      progress(from + batch.length);
    }
    finishJob(id, {
      title: failed ? 'Дубликаты удалены с ошибками' : 'Удаление дубликатов завершено',
      level: failed ? 'error' : 'success',
      message: resultText(),
    });
    return {deleted, failed};
  } catch (error) {
    finishJob(id, {
      title: 'Удаление дубликатов прервано',
      level: 'error',
      message: `${resultText()}. ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}
