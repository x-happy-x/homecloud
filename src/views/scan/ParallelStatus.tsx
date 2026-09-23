import {useMutation, useQuery} from '@tanstack/react-query';
import {formatNumber} from '../../lib/format';
import {JOB_LABELS} from '../../lib/jobs';
import {getParallel, stopParallel, type ParallelJob} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';
import {Pill} from '../../ui/Pill/Pill';
import {Progress} from '../../ui/Progress/Progress';

const STEPS: Record<string, string> = {
  inventory: 'Опись источника', shards: 'Обработка долями', highlights: 'Подборки', done: 'Готово',
};
const RESULT: Record<string, string> = {
  completed: 'Готово', error: 'Ошибка', stopped: 'Остановлено',
};
// Итог держим на экране недолго: дальше он живёт в истории заданий ядер.
const RESULT_SECONDS = 10 * 60;

/** Ход задания, разделённого между ядрами: шаг и доля каждого ядра. */
export function ParallelStatus() {
  const canEdit = useStore(state => state.session.canEdit);
  const query = useQuery({
    queryKey: qk.parallel(),
    queryFn: getParallel,
    refetchInterval: current => (current.state.data?.status === 'running' ? 3000 : 30_000),
  });
  const stop = useMutation({
    mutationFn: stopParallel,
    onSuccess: () => { void queryClient.invalidateQueries({queryKey: qk.parallel()}); },
  });
  const job = query.data;
  if (!job || !visible(job)) return null;

  const running = job.status === 'running';
  return (
    <div className={`parallel-status${job.status === 'error' ? ' failed' : ''}`}>
      <div className="parallel-head">
        <Icon name="layers" size={18} />
        <strong>Задание на {formatNumber(job.cores?.length ?? 0)} ядрах</strong>
        <Pill tone={running ? 'running' : job.status === 'error' ? 'error' : 'default'}>
          {running ? STEPS[job.step ?? ''] ?? job.step : RESULT[job.status] ?? job.status}
        </Pill>
        {running && canEdit && (
          <Button small variant="danger" disabled={stop.isPending} onClick={() => stop.mutate()}>
            <Icon name="stop" size={16} />
            <span>Остановить</span>
          </Button>
        )}
      </div>
      {job.error && <p className="device-error">{job.error}</p>}
      {running && (
        <ul className="parallel-parts">
          {(job.parts ?? []).map(part => {
            const share = part.total ? (part.completed ?? 0) / part.total : null;
            return (
              <li key={part.core}>
                <span className="parallel-core">
                  {part.name}
                  {part.shard && part.shard.count > 1 && ` · доля ${part.shard.index + 1} из ${part.shard.count}`}
                </span>
                <span className="parallel-phase">
                  {part.phase ? JOB_LABELS[part.phase] ?? part.phase : ''}
                  {part.total ? ` · ${formatNumber(part.completed ?? 0)} из ${formatNumber(part.total)}` : ''}
                </span>
                <Progress value={part.status === 'running' ? share : 1} />
              </li>
            );
          })}
        </ul>
      )}
      {job.skipped && job.skipped.length > 0 && (
        <p className="fact-empty">Не участвуют: {job.skipped.join('; ')}</p>
      )}
    </div>
  );
}

function visible(job: ParallelJob) {
  if (job.status === 'running') return true;
  if (job.status === 'idle' || !job.finished_at) return false;
  return Date.now() / 1000 - job.finished_at < RESULT_SECONDS;
}
