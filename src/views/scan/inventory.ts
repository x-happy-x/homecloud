import {formatNumber} from '../../lib/format';
import type {DeviceJob} from '../../services/endpoints/backends';
import type {NotifLevel} from '../../store/slices/notifications';

export interface InventoryOutcome {
  level: NotifLevel;
  message: string;
}

/**
 * Итог сбора списка файлов. Задание могло упасть или всё ещё идти, и
 * «Список собран» в этих случаях вводит в заблуждение — поэтому четыре
 * ветки, и тексты у них прежние: это единственный сигнал, что опись молча
 * упала на устройстве.
 */
export function inventoryOutcome(job: DeviceJob | undefined): InventoryOutcome {
  const found = job?.inventory;
  if (job?.status === 'error') {
    return {
      level: 'error',
      message: `Не удалось собрать список: ${(job.error || '').split('\n').pop() || 'ошибка на устройстве'}`,
    };
  }
  if (job?.active) {
    return {
      level: 'info',
      message: 'Сбор списка файлов ещё не завершился — идёт дальше в фоне, загляните позже.',
    };
  }
  if (job?.status === 'stopped') {
    return {
      level: 'info',
      message: found
        ? `Остановлено. Успели найти ${formatNumber(found.total)} · новых ${formatNumber(found.new)} · изменилось ${formatNumber(found.changed)}`
        : 'Остановлено, ничего не успели найти',
    };
  }
  return {
    level: 'success',
    message: found
      ? `Найдено ${formatNumber(found.total)} · новых ${formatNumber(found.new)} · изменилось ${formatNumber(found.changed)} · пропало ${formatNumber(found.missing)}`
      : 'Список собран',
  };
}

/**
 * Отпечаток задания до запуска описи. Опрос мог ещё не увидеть новое
 * задание активным — а короткая опись успевает закончиться между двумя
 * опросами; тогда о запуске говорит только сменившийся отпечаток.
 */
export const jobSignature = (job: DeviceJob | undefined): string =>
  [job?.status, job?.pid, job?.started_at, job?.inventory?.total].join('|');
