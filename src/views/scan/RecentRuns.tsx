import {useMutation, useQuery} from '@tanstack/react-query';
import {formatNumber, plural, runMoment} from '../../lib/format';
import {FEATURE_INFO, JOB_LABELS} from '../../lib/jobs';
import {insidePath} from '../../lib/sources';
import {forgetScanRun, getScanHistory, type ScanRun} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {IconButton} from '../../ui/IconButton/IconButton';

const STATUS: Record<string, [string, string]> = {
  completed: ['готово', 'ok'], stopped: ['остановлено', 'warn'], error: ['ошибка', 'bad'],
  interrupted: ['прервано', 'warn'], running: ['идёт', 'run'], idle: ['не завершено', 'warn'],
};
// Экран не простыня: старое — в окне задания, в «Уже сканировали».
const SHOWN = 8;

const runTitle = (run: ScanRun) => run.roots.length
  ? run.roots.map(insidePath).join(' · ')
  : `${formatNumber(run.paths.length)} ${plural(run.paths.length, 'файл', 'файла', 'файлов')}`;

/** Недавние задания: что и когда считали, повторить с теми же папками. */
export function RecentRuns({onRepeat}: {onRepeat(run: ScanRun): void}) {
  const canEdit = useStore(state => state.session.canEdit);
  const history = useQuery({
    queryKey: qk.scanHistory(),
    // Недоступная история — не повод для ошибки на экране.
    queryFn: () => getScanHistory().catch(() => [] as ScanRun[]),
  });
  const forget = useMutation({
    mutationFn: (run: ScanRun) => forgetScanRun(run.id),
    onSuccess: () => queryClient.invalidateQueries({queryKey: qk.scanHistory()}),
  });

  const runs = (history.data ?? []).slice(0, SHOWN);
  if (!runs.length) {
    return <p className="scan-empty">{history.isPending ? 'Загружаю историю…' : 'Заданий ещё не запускали.'}</p>;
  }

  return (
    <ul className="run-list">
      {runs.map(run => {
        const [statusText, tone] = STATUS[run.status] ?? [run.status, ''];
        const done = run.done.map(name => FEATURE_INFO[name]?.[0] ?? JOB_LABELS[name] ?? name);
        const source = run.roots[0]?.split(':')[0] ?? '';
        return (
          <li key={run.id} className="run-row">
            <span className={`run-status ${tone}`}>{statusText}</span>
            <span className="run-what">
              <strong title={run.roots.join('\n')}>{runTitle(run)}</strong>
              <small>
                {source && `${source} · `}{formatNumber(run.photos)} фото
                {' · '}{done.length ? done.join(', ') : 'ни один этап не завершён'}
              </small>
            </span>
            <span className="run-when">{runMoment(run.last_run_at)}</span>
            {canEdit && (
              <span className="run-actions">
                <Button small onClick={() => onRepeat(run)}>Повторить</Button>
                <IconButton icon="close" label="Убрать из истории" tiny disabled={forget.isPending}
                  onClick={() => forget.mutate(run)} />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
