import {useEffect, useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useDeviceJobNotifications} from '../hooks/useDeviceJobNotifications';
import {useReclusterNotifications} from '../hooks/useReclusterNotifications';
import {getDevices} from '../services/endpoints/backends';
import {getDuplicatesStatus, getReclusterStatus} from '../services/endpoints/jobs';
import {getRouterStatus} from '../services/endpoints/training';
import {queryClient} from '../services/queryClient';
import {qk} from '../services/queryKeys';
import {useStore} from '../store';

/** Фоновые задачи опрашиваются раз в полторы секунды; в скрытой вкладке опрос стоит. */
export const POLL_MS = 1500;

const DUPLICATES_RUNNING = new Set(['counting', 'running']);

/**
 * Опрос фоновых задач. Раньше это был setInterval(pollStatus), который сам
 * перерисовывал экраны; теперь — четыре запроса с интервалом, а переходы
 * «задача закончилась» ловятся сравнением с прошлым опросом.
 */
export function usePollingStatus() {
  const signedIn = useStore(state => Boolean(state.session.user));
  const view = useStore(state => state.view);

  const devices = useQuery({
    queryKey: qk.devices(),
    queryFn: getDevices,
    enabled: signedIn,
    refetchInterval: POLL_MS,
  });

  const recluster = useQuery({
    queryKey: qk.reclusterStatus(),
    queryFn: getReclusterStatus,
    enabled: signedIn,
    refetchInterval: POLL_MS,
    // На долгом шаге кластеризации ответ не меняется, а «идёт 2 мин» тикать должно.
    structuralSharing: false,
  });

  // Ход дубликатов и обучения нужен только на своих экранах — как и раньше.
  const duplicates = useQuery({
    queryKey: qk.duplicatesStatus(),
    queryFn: getDuplicatesStatus,
    enabled: signedIn && view === 'duplicates',
    refetchInterval: POLL_MS,
  });

  const router = useQuery({
    queryKey: qk.routerStatus(),
    queryFn: getRouterStatus,
    enabled: signedIn && view === 'training',
    refetchInterval: POLL_MS,
  });

  useDeviceJobNotifications(devices.data);
  useReclusterNotifications(recluster.data);

  // Обработка на устройстве закончилась — в каталоге новые лица и снимки.
  useFinished(devices.data?.some(device => device.job?.active) ?? false, () => {
    void queryClient.invalidateQueries({queryKey: ['state']});
    void queryClient.invalidateQueries({queryKey: ['photos']});
  });

  useFinished(DUPLICATES_RUNNING.has(duplicates.data?.status ?? ''), () => {
    void queryClient.invalidateQueries({queryKey: ['duplicates']});
  });

  useFinished(Boolean(router.data?.active), () => {
    void queryClient.invalidateQueries({queryKey: qk.routerSummary()});
    void queryClient.invalidateQueries({queryKey: ['router-review']});
  });

  return {
    devices: devices.data,
    recluster: recluster.data,
    duplicates: duplicates.data,
    router: router.data,
  };
}

export type PollingStatus = ReturnType<typeof usePollingStatus>;

/** Было активно, а теперь нет — один раз выполнить действие. */
function useFinished(active: boolean, onFinish: () => void): void {
  const was = useRef(active);
  const latest = useRef(onFinish);
  latest.current = onFinish;

  useEffect(() => {
    if (was.current && !active) latest.current();
    was.current = active;
  }, [active]);
}
