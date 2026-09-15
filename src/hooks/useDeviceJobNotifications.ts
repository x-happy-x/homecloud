import {useEffect, useRef} from 'react';
import {deviceEta} from '../lib/eta';
import {formatNumber} from '../lib/format';
import {JOB_LABELS, jobWork, scanOverallFraction, scanStepIndex, scanSteps} from '../lib/jobs';
import {stopJob, type Device} from '../services/endpoints/backends';
import {queryClient} from '../services/queryClient';
import {qk} from '../services/queryKeys';
import {useStore} from '../store';
import type {JobStep} from '../store/slices/notifications';

const jobId = (deviceId: string) => `device:${deviceId}`;

/**
 * Карточка сканирования в уведомлениях. Раньше её рождала отрисовка списка
 * устройств; теперь это сравнение прошлого опроса с текущим, и рендер сам
 * по себе уведомлений не порождает.
 */
export function useDeviceJobNotifications(devices: Device[] | undefined): void {
  const canEdit = useStore(state => state.session.canEdit);
  const setJob = useStore(state => state.setJob);
  const finishJob = useStore(state => state.finishJob);
  const toast = useStore(state => state.toast);
  const tracked = useRef(new Set<string>());

  useEffect(() => {
    if (!devices) return;
    const active = new Set<string>();

    for (const device of devices) {
      const job = device.job;
      if (!(device.online && job?.active)) continue;
      const id = jobId(device.id);
      active.add(id);
      tracked.current.add(id);

      const steps = scanSteps(job);
      const stepIndex = scanStepIndex(steps, job.phase);
      const work = jobWork(job);
      const videos = job.phase === 'faces' && job.videos_done
        ? ` · видео: ${formatNumber(job.videos_done)}` : '';
      const progressText = (work.total > 0
        ? `${formatNumber(job.completed)} / ${formatNumber(work.total)} файлов`
        : job.found ? `просмотрено ${formatNumber(job.found)}` : 'готовлюсь') + videos;
      const detail = [progressText, deviceEta.estimate(device), job.current].filter(Boolean).join(' · ');

      setJob(id, {
        title: `Сканирование · ${device.name}`,
        sub: `Шаг ${stepIndex} из ${steps.length}: ${JOB_LABELS[job.phase ?? ''] || 'Обработка'}`,
        level: 'info',
        progress: scanOverallFraction(steps, stepIndex, job),
        spinning: true,
        steps: steps.map((step, index): JobStep => {
          const number = index + 1;
          const state = number < stepIndex ? 'done' : number === stepIndex ? 'active' : 'waiting';
          return {title: step.title, state, detail: state === 'active' ? detail : undefined};
        }),
        canStop: canEdit,
        onStop: () => {
          stopJob(device.id)
            .then(() => queryClient.invalidateQueries({queryKey: qk.devices()}))
            .catch((error: Error) => toast(error.message, 'error'));
        },
      });
    }

    for (const id of [...tracked.current]) {
      if (active.has(id)) continue;
      tracked.current.delete(id);
      const deviceId = id.slice(jobId('').length);
      const device = devices.find(item => item.id === deviceId);
      const status = device?.job?.status ?? '';
      finishJob(id, {
        title: `Сканирование · ${device ? device.name : deviceId}`,
        level: status === 'error' ? 'error'
          : status === 'stopped' || status === 'interrupted' ? 'info' : 'success',
        message: JOB_LABELS[status] || 'Обработка завершена',
      });
    }
  }, [devices, canEdit, setJob, finishJob, toast]);
}
