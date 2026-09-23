import {useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import {formatNumber, plural, runMoment} from '../../lib/format';
import {FEATURE_INFO} from '../../lib/jobs';
import {forgetScanRun, getScanHistory, type ScanRun} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Icon} from '../../ui/Icon/Icon';

const STATUS_NOTES: Record<string, string> = {
  stopped: 'остановлено', error: 'ошибка', interrupted: 'прервано', running: 'идёт',
};

const runTitle = (run: ScanRun) => run.roots.length
  ? run.roots.join(' · ')
  : `${formatNumber(run.paths.length)} ${plural(run.paths.length, 'фотография', 'фотографии', 'фотографий')}`;

/** Прошлые задания: взять те же папки и включить другие этапы. */
export function ScanHistory() {
  const select = useStore(state => state.select);
  const setSelectedPaths = useStore(state => state.setSelectedPaths);
  const toast = useStore(state => state.toast);
  // Свёрнут по умолчанию: это подсказка, а не главный путь выбора источника.
  const [open, setOpen] = useState(false);

  const history = useQuery({
    queryKey: qk.scanHistory(),
    // Недоступная история — не повод для ошибки на экране.
    queryFn: () => getScanHistory().catch((error: Error) => {
      console.warn('История заданий недоступна:', error.message);
      return [] as ScanRun[];
    }),
  });

  const forget = useMutation({
    mutationFn: (run: ScanRun) => forgetScanRun(run.id),
    onSuccess: () => queryClient.invalidateQueries({queryKey: qk.scanHistory()}),
  });

  const runs = history.data ?? [];
  if (!runs.length) return null;

  return (
    <div className={`history-list${open ? ' open' : ''}`}>
      <button type="button" className="history-head" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <Icon name="chevronDown" size={18} className="history-caret" />
        <span>
          <strong>Уже сканировали</strong>
          <small>{formatNumber(runs.length)} {plural(runs.length, 'источник', 'источника', 'источников')} · взять те же папки и включить другие этапы</small>
        </span>
      </button>
      {open && runs.map(run => {
        const title = runTitle(run);
        const done = run.done.map(name => FEATURE_INFO[name]?.[0] ?? name).join(', ');
        const note = STATUS_NOTES[run.status] ? ` · ${STATUS_NOTES[run.status]}` : '';
        return (
          <div key={run.id} className="history-row">
            <button
              type="button"
              className="history-pick"
              title={title}
              onClick={() => {
                select('roots', run.roots);
                setSelectedPaths([...run.paths]);
                toast(`Источник взят: ${title}`);
              }}
            >
              <span className="history-title">{title}</span>
              <span className="history-meta">
                {formatNumber(run.photos)} фото · {done ? `готово: ${done}` : 'ни один этап не завершён'}
                {' · '}{runMoment(run.last_run_at)}{note}
              </span>
            </button>
            <button
              type="button"
              className="history-forget"
              aria-label="Забыть источник"
              disabled={forget.isPending}
              onClick={() => forget.mutate(run)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
