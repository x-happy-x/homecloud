import {roughDuration, formatNumber} from '../../lib/format';
import type {PlannedPhase} from '../../lib/scanPlan';
import {Icon} from '../../ui/Icon/Icon';

const STATE_NOTES: Record<PlannedPhase['state'], string> = {
  done: 'готово', active: 'идёт', waiting: 'в очереди', failed: 'ошибка', skipped: 'не выполнялся',
};

/** Что написать под названием этапа: длительность, счётчик или прогноз. */
function phaseNote(phase: PlannedPhase): string {
  switch (phase.state) {
    case 'done':
      return phase.seconds === null ? 'готово' : roughDuration(phase.seconds);
    case 'active':
      if (phase.total) return `${formatNumber(phase.completed ?? 0)} / ${formatNumber(phase.total)}`;
      return phase.loading ? 'запуск' : 'идёт';
    case 'waiting':
      return phase.seconds === null ? 'в очереди' : `≈ ${roughDuration(phase.seconds)}`;
    case 'failed':
      return 'ошибка';
    default:
      return 'не выполнялся';
  }
}

function Mark({phase, index}: {phase: PlannedPhase; index: number}) {
  if (phase.state === 'done') return <Icon name="check" />;
  if (phase.state === 'failed') return <span>!</span>;
  if (phase.state === 'active') return <span className="pipe-spinner" />;
  return <span>{index + 1}</span>;
}

/**
 * Этапы задания цепочкой, как пайплайн в CI: на широком экране — в строку со
 * связками, на телефоне — столбиком с линией слева.
 */
export function Pipeline({phases, compact}: {phases: PlannedPhase[]; compact?: boolean}) {
  return (
    <ol className={`pipeline${compact ? ' compact' : ''}`} aria-label="Этапы задания">
      {phases.map((phase, index) => {
        const fraction = phase.state === 'active' && phase.total
          ? Math.min(1, (phase.completed ?? 0) / phase.total) : null;
        return (
          <li
            key={phase.key}
            className={`pipe-node ${phase.state}`}
            aria-current={phase.state === 'active' ? 'step' : undefined}
            title={`${phase.title}: ${STATE_NOTES[phase.state]}`}
          >
            <span className="pipe-mark" aria-hidden="true"><Mark phase={phase} index={index} /></span>
            <span className="pipe-text">
              <span className="pipe-title">{phase.title}</span>
              <span className="pipe-note">
                {phase.kind && <span className="pipe-kind">{phase.kind}</span>}
                <span>{phaseNote(phase)}</span>
              </span>
            </span>
            {fraction !== null && (
              <span className="pipe-bar" aria-hidden="true">
                <span style={{width: `${Math.round(fraction * 100)}%`}} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
