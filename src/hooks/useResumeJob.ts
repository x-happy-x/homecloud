import {useMutation} from '@tanstack/react-query';
import {resumePlan, type ResumePlan} from '../lib/scanPlan';
import {startJob, type Device} from '../services/endpoints/backends';
import {queryClient} from '../services/queryClient';
import {qk} from '../services/queryKeys';
import {useStore} from '../store';

/** Запустить задание ядра заново с того места, где оно упало. */
export function resumeJob(device: Pick<Device, 'id'>, plan: ResumePlan): Promise<unknown> {
  const {from: _from, ...payload} = plan;
  return startJob(device.id, payload).then(() => queryClient.invalidateQueries({queryKey: qk.devices()}));
}

export function useResumeJob(device: Device) {
  const toast = useStore(state => state.toast);
  const plan = resumePlan(device.job);
  const mutation = useMutation({
    mutationFn: () => resumeJob(device, plan!),
    onSuccess: () => toast(`Продолжаю с этапа «${plan?.from}»`, 'success'),
    onError: (error: Error) => toast(error.message || 'Не удалось продолжить задание', 'error'),
  });
  return {plan, mutation};
}
