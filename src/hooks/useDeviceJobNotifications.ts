import {useEffect, useRef} from 'react';
import {formatNumber, plural, roughDuration} from '../lib/format';
import {JOB_LABELS} from '../lib/jobs';
import {perFileText, planJob, planMeta, resumePlan, type JobPlan, type PlannedPhase} from '../lib/scanPlan';
import {resumeJob} from './useResumeJob';
import {stopJob, type Device, type DeviceJob} from '../services/endpoints/backends';
import {queryClient} from '../services/queryClient';
import {qk} from '../services/queryKeys';
import {useStore} from '../store';
import type {JobStep} from '../store/slices/notifications';

const jobId = (deviceId: string) => `device:${deviceId}`;

/** Шаги карточки: у каждого своё место для времени, подробности — только у текущего. */
export function planSteps(plan: JobPlan, job: DeviceJob): JobStep[] {
  return plan.phases.map((phase: PlannedPhase): JobStep => {
    const state: JobStep['state'] = phase.state === 'done' || phase.state === 'active' ? phase.state : 'waiting';
    const common = {title: phase.title, state, badge: phase.kind || undefined};
    if (phase.state === 'done') {
      return {...common, aside: phase.seconds === null ? 'готово' : roughDuration(phase.seconds)};
    }
    if (phase.state === 'waiting') {
      return {...common, aside: phase.seconds === null ? undefined : `≈ ${roughDuration(phase.seconds)}`};
    }

    const total = phase.total ?? 0;
    const completed = phase.completed ?? 0;
    const lines: string[] = [];
    if (job.stop_requested) lines.push('Останавливаю после текущего файла');
    if (!total) {
      lines.push(job.found ? `Собираю список файлов · найдено ${formatNumber(job.found)}` : 'Готовлюсь к запуску');
    } else if (phase.loading) {
      lines.push(`Загружаю модель · идёт ${roughDuration(phase.seconds ?? 0)}`);
    } else {
      const speed = perFileText(phase.perFile ?? 0);
      const left = plan.phaseRemaining === null ? '' : `до конца этапа ≈ ${roughDuration(plan.phaseRemaining)}`;
      lines.push([speed && `≈ ${speed} на файл`, left].filter(Boolean).join(' · '));
    }
    if (job.videos_total) {
      lines.push(`Видео: ${formatNumber(job.videos_done ?? 0)} из ${formatNumber(job.videos_total)}`);
    }
    const errors = Number(job.errors || 0);
    if (errors) lines.push(`Пропущено из-за ошибок: ${formatNumber(errors)}`);

    return {
      ...common,
      aside: total ? `${formatNumber(completed)} / ${formatNumber(total)}` : undefined,
      progress: total ? completed / total : null,
      lines: lines.filter(Boolean),
      file: job.current || undefined,
    };
  });
}

interface Snapshot {
  name: string;
  elapsed: number;
  files: number;
}

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
  const tracked = useRef(new Map<string, Snapshot>());

  useEffect(() => {
    if (!devices) return;
    const active = new Set<string>();

    for (const device of devices) {
      const job = device.job;
      if (!(device.online && job?.active)) continue;
      const plan = planJob(device);
      if (!plan) continue;
      const id = jobId(device.id);
      active.add(id);
      const current = plan.phases[plan.index - 1];
      tracked.current.set(id, {
        name: device.name,
        elapsed: plan.elapsed,
        files: Math.max(tracked.current.get(id)?.files ?? 0, Number(job.total || 0)),
      });

      setJob(id, {
        title: `Сканирование · ${device.name}`,
        sub: current
          ? `Этап ${plan.index} из ${plan.phases.length} · ${current.title}${current.kind ? ` · ${current.kind}` : ''}`
          : JOB_LABELS[job.status ?? ''] || 'Готовлюсь',
        level: 'info',
        progress: plan.fraction,
        meta: planMeta(plan),
        spinning: true,
        steps: planSteps(plan, job),
        canStop: canEdit && !job.stop_requested,
        onStop: () => {
          stopJob(device.id)
            .then(() => queryClient.invalidateQueries({queryKey: qk.devices()}))
            .catch((error: Error) => toast(error.message, 'error'));
        },
      });
    }

    for (const [id, snapshot] of [...tracked.current]) {
      if (active.has(id)) continue;
      tracked.current.delete(id);
      const deviceId = id.slice(jobId('').length);
      const device = devices.find(item => item.id === deviceId);
      const status = device?.job?.status ?? '';
      const label = status === 'completed' ? 'Готово' : JOB_LABELS[status] || 'Обработка завершена';
      const details = [
        snapshot.elapsed >= 1 ? `за ${roughDuration(snapshot.elapsed)}` : '',
        snapshot.files
          ? `${formatNumber(snapshot.files)} ${plural(snapshot.files, 'файл', 'файла', 'файлов')}` : '',
      ].filter(Boolean).join(' · ');
      // Упало или прервалось — сразу предлагаем продолжить с того же места.
      const plan = canEdit && device && status !== 'stopped' ? resumePlan(device.job) : null;
      finishJob(id, {
        title: `Сканирование · ${device ? device.name : snapshot.name}`,
        action: plan && device ? {
          label: `Продолжить с «${plan.from}»`,
          run: () => {
            resumeJob(device, plan)
              .then(() => toast(`Продолжаю с этапа «${plan.from}»`, 'success'))
              .catch((error: Error) => toast(error.message, 'error'));
          },
        } : undefined,
        level: status === 'error' ? 'error'
          : status === 'stopped' || status === 'interrupted' ? 'info' : 'success',
        message: status === 'error' && device?.job?.error
          ? device.job.error
          : [label, details].filter(Boolean).join(' '),
      });
    }
  }, [devices, canEdit, setJob, finishJob, toast]);
}
