import {useMutation} from '@tanstack/react-query';
import {deviceEta} from '../../lib/eta';
import {formatNumber} from '../../lib/format';
import {jobFraction, phaseLabel} from '../../lib/jobs';
import {stopJob, type Device} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Progress} from '../../ui/Progress/Progress';

/** Полоса хода обработки над любым экраном, пока на каком-то устройстве идёт задание. */
export function ProcessingBanner({devices}: {devices: Device[] | undefined}) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);

  const stop = useMutation({
    mutationFn: (id: string) => stopJob(id),
    onSuccess: () => {
      toast('Безопасная остановка запрошена');
      void queryClient.invalidateQueries({queryKey: qk.devices()});
    },
  });

  const device = devices?.find(item => item.job?.active);
  const job = device?.job;
  if (!device?.online || !job?.active) return null;

  const total = Number(job.total || 0);
  const determinate = total > 0;
  const fraction = jobFraction(job);
  const eta = deviceEta.estimate(device);
  const videos = job.phase === 'faces' && job.videos_done
    ? ` · видео: ${formatNumber(job.videos_done)}` : '';
  // Пока список файлов не собран, total неизвестен — показываем сам обход, а не модель.
  const summary = (determinate
    ? `${formatNumber(job.completed)} из ${formatNumber(total)}`
    : job.found ? `Просмотрено файлов: ${formatNumber(job.found)}`
    : job.phase === 'faces' ? 'Собираю список файлов' : 'Готовлюсь') + videos + (eta ? ` · ${eta}` : '');

  return (
    <section className="processing-banner" aria-live="polite">
      <div className="processing-head">
        <div>
          <strong>{phaseLabel(job) || 'Обработка фотографий'}</strong>
          <span>{device.name}</span>
        </div>
        <b>{determinate ? `${Math.round(fraction * 100)}%` : '…'}</b>
      </div>
      <Progress value={determinate ? fraction : null} />
      <div className="processing-foot">
        <span>{summary}</span>
        <code>{job.current ?? ''}</code>
        {canEdit && (
          <Button variant="danger" small disabled={stop.isPending} onClick={() => stop.mutate(device.id)}>
            Остановить
          </Button>
        )}
      </div>
    </section>
  );
}
