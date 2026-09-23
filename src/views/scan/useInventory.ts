import {useCallback, useEffect, useRef, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {startJob, type Device, type DeviceJob} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {inventoryOutcome, jobSignature} from './inventory';

/** Дольше часа опись не ждём: сообщаем, что она идёт в фоне, и отпускаем кнопку. */
const INVENTORY_WAIT_MS = 3_600_000;

interface InventoryRun {
  deviceId: string;
  roots: string[];
  before: string;
  sawActive: boolean;
}

/**
 * Опись — отдельное задание на устройстве. Раньше это был цикл «поспать
 * секунду, дёрнуть опрос» до 3600 раз поверх уже идущего интервального
 * опроса; теперь — запуск и слежение за device.job в том же опросе.
 */
export function useInventory(devices: Device[] | undefined) {
  const toast = useStore(state => state.toast);
  const openTreeNodes = useStore(state => state.openTreeNodes);
  const [run, setRun] = useState<InventoryRun | null>(null);

  const job = run ? devices?.find(item => item.id === run.deviceId)?.job : undefined;
  const latest = useRef({job, run});
  latest.current = {job, run};

  const finish = useCallback((current: DeviceJob | undefined, finished: InventoryRun) => {
    setRun(null);
    void queryClient.invalidateQueries({queryKey: qk.tree()});
    void queryClient.invalidateQueries({queryKey: qk.sources()});
    openTreeNodes(finished.roots);
    if (current?.status === 'error') console.error('Сбор списка файлов упал:', current.error);
    const outcome = inventoryOutcome(current);
    toast(outcome.message, outcome.level);
  }, [openTreeNodes, toast]);

  const start = useMutation({
    mutationFn: (next: InventoryRun) =>
      startJob(next.deviceId, {roots: next.roots, features: {inventory: true}}),
    onSuccess: (_data, next) => {
      setRun(next);
      toast('Собираю список файлов…');
      void queryClient.invalidateQueries({queryKey: qk.devices()});
    },
  });

  useEffect(() => {
    if (!run) return;
    if (job?.active) {
      if (!run.sawActive) setRun({...run, sawActive: true});
      return;
    }
    if (run.sawActive || jobSignature(job) !== run.before) finish(job, run);
  }, [job, run, finish]);

  const runKey = run ? `${run.deviceId}|${run.before}` : '';
  useEffect(() => {
    if (!runKey) return;
    const timer = setTimeout(() => {
      const {job: current, run: waiting} = latest.current;
      if (waiting) finish(current, waiting);
    }, INVENTORY_WAIT_MS);
    return () => clearTimeout(timer);
  }, [runKey, finish]);

  const collect = (deviceId: string, roots: string[]) => {
    if (!roots.length) {
      toast('Сначала выберите папку источника');
      return;
    }
    if (run || start.isPending) return;
    const before = jobSignature(devices?.find(item => item.id === deviceId)?.job);
    start.mutate({deviceId, roots, before, sawActive: false});
  };

  return {collect, busy: Boolean(run) || start.isPending};
}
