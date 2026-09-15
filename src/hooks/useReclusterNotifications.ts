import {useEffect, useRef} from 'react';
import {etaBook} from '../lib/eta';
import {learnClusterTiming, reclusterFraction, reclusterStepDetail, reclusterSub} from '../lib/recluster';
import {stopRecluster, type ReclusterStatus} from '../services/endpoints/jobs';
import {queryClient} from '../services/queryClient';
import {useStore} from '../store';
import type {JobStep} from '../store/slices/notifications';

const TITLE = 'Пересборка групп лиц';

/**
 * Пересборка групп считается в фоне на сервере, а её ход — это карточка в
 * уведомлениях. Хук сравнивает прошлый опрос с текущим: пока идёт — карточка
 * с шагами, закончилась — итог в историю и свежие группы.
 */
export function useReclusterNotifications(job: ReclusterStatus | undefined): void {
  const setJob = useStore(state => state.setJob);
  const finishJob = useStore(state => state.finishJob);
  const toast = useStore(state => state.toast);
  const previous = useRef<ReclusterStatus | null>(null);
  const tracking = useRef(false);

  useEffect(() => {
    if (!job) return;

    if (job.status === 'running') {
      tracking.current = true;
      learnClusterTiming(previous.current, job, etaBook);
      previous.current = job;
      const now = Date.now() / 1000;
      const stepIndex = job.step_index || 1;
      setJob('recluster', {
        title: TITLE,
        sub: reclusterSub(job, now),
        level: 'info',
        progress: reclusterFraction(job),
        spinning: true,
        steps: job.steps.map((step, index): JobStep => {
          const number = index + 1;
          const state = number < stepIndex ? 'done' : number === stepIndex ? 'active' : 'waiting';
          return {
            title: step.title,
            state,
            detail: state === 'active' ? reclusterStepDetail(job, now, etaBook) : undefined,
          };
        }),
        canStop: true,
        onStop: () => {
          stopRecluster().catch((error: Error) => toast(error.message, 'error'));
        },
      });
      return;
    }

    if (!tracking.current) return;
    tracking.current = false;
    previous.current = null;
    if (job.status === 'completed') {
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: ['similar-pairs']});
    }
    finishJob('recluster', {
      title: TITLE,
      level: job.status === 'error' ? 'error' : job.status === 'stopped' ? 'info' : 'success',
      message: job.status === 'error' ? (job.error || 'Ошибка пересборки') : job.message,
    });
  }, [job, setJob, finishJob, toast]);
}
