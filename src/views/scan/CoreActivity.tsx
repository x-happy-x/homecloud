import {useMutation} from '@tanstack/react-query';
import {planSteps} from '../../hooks/useDeviceJobNotifications';
import {useResumeJob} from '../../hooks/useResumeJob';
import {formatNumber, roughDuration, runMoment} from '../../lib/format';
import {lastRun, planJob, planMeta} from '../../lib/scanPlan';
import {insidePath, shortPath} from '../../lib/sources';
import {stopJob, type Device} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';
import {Pill} from '../../ui/Pill/Pill';
import {Progress} from '../../ui/Progress/Progress';
import {Pipeline} from './Pipeline';

const LAST_STATUS: Record<string, string> = {
  completed: 'Готово', stopped: 'Остановлено', error: 'Ошибка', interrupted: 'Прервано',
};

/**
 * Что сейчас делает ядро: идущее задание с этапами или последний запуск.
 * Управление самим ядром (SSH, установка, модели) — в «Настройки → Ядра».
 */
export function CoreActivity({device, onScan}: {device: Device; onScan(device: Device): void}) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const openSettings = useStore(state => state.openSettings);
  const stop = useMutation({
    mutationFn: () => stopJob(device.id),
    onSuccess: () => {
      toast('Остановка запрошена — этап доработает текущий файл');
      void queryClient.invalidateQueries({queryKey: qk.devices()});
    },
  });

  const job = device.job ?? {active: false};
  const running = device.online && !device.legacy && job.active;
  const plan = running ? planJob(device) : null;
  const last = device.online && !device.legacy && !job.active ? lastRun(job) : null;
  const installing = device.install?.status === 'running';

  const status = installing ? 'Обновляется'
    : !device.online ? 'Не в сети'
    : device.legacy ? 'Не переведено на хаб'
    : running ? (job.stop_requested ? 'Останавливается' : 'Считает')
    : 'Свободно';
  const tone = installing || running ? 'running' : !device.online || device.legacy ? 'error' : 'default';

  return (
    <article className={`activity-card${running ? ' running' : ''}${device.online ? '' : ' offline'}`}>
      <header className="activity-head">
        <span className={`activity-dot ${tone}`} aria-hidden="true" />
        <div className="activity-id">
          <h3>{device.name}</h3>
          <span>{device.primary ? 'основное ядро' : 'ядро'}</span>
        </div>
        <Pill tone={tone}>{status}</Pill>
        {canEdit && running && (
          <Button variant="danger" small disabled={stop.isPending || job.stop_requested} onClick={() => stop.mutate()}>
            <Icon name="stop" size={16} />
            <span>Остановить</span>
          </Button>
        )}
        {canEdit && !running && device.online && !device.legacy && !installing && (
          <Button small onClick={() => onScan(device)}>
            <Icon name="plus" size={16} />
            <span>Задание</span>
          </Button>
        )}
      </header>

      {running && plan && <RunningJob device={device} plan={plan} />}
      {last && <LastJob device={device} last={last} />}
      {device.online && !device.legacy && !running && !last && (
        <p className="activity-note">Заданий ещё не было.</p>
      )}
      {(!device.online || device.legacy) && (
        <p className="activity-note">
          {device.legacy
            ? 'На компьютере старый бэкенд со своим каталогом. '
            : 'Ядро не отвечает — проверьте, включён ли компьютер. '}
          <button type="button" className="link-button" onClick={() => openSettings('cores')}>
            {device.legacy ? 'Перевести на хаб' : 'Запустить'} в настройках
          </button>
        </p>
      )}
    </article>
  );
}

function Sources({roots, paths}: {roots?: string[]; paths?: string[]}) {
  const items = roots ?? [];
  const files = paths?.length ?? 0;
  if (!items.length && !files) return null;
  return (
    <div className="run-sources">
      {items.map(root => (
        <span key={root} className="run-source" title={root}>
          <Icon name="folder" size={14} />{shortPath(root)}
        </span>
      ))}
      {files > 0 && <span className="run-source"><Icon name="photos" size={14} />{formatNumber(files)} файлов</span>}
    </div>
  );
}

function RunningJob({device, plan}: {device: Device; plan: NonNullable<ReturnType<typeof planJob>>}) {
  const job = device.job!;
  const phase = plan.phases[plan.index - 1];
  const step = planSteps(plan, job)[plan.index - 1];

  return (
    <section className="device-run" aria-live="polite">
      <div className="run-summary">
        <div className="run-summary-text">
          <span className="run-eyebrow">Этап {plan.index} из {plan.phases.length}</span>
          <strong>{phase?.title ?? 'Обработка'}{phase?.kind && <span className="pipe-kind">{phase.kind}</span>}</strong>
          <span className="run-meta">{planMeta(plan)}</span>
        </div>
        <b className="run-percent">{plan.fraction === null ? '…' : `${Math.floor(plan.fraction * 100)}%`}</b>
      </div>
      <Progress value={plan.fraction} />
      <Sources roots={job.roots} paths={job.paths} />

      <Pipeline phases={plan.phases} />

      {step && (
        <div className="run-now">
          <div className="run-now-head">
            <span>Сейчас</span>
            {step.aside && <b>{step.aside}</b>}
          </div>
          {step.progress !== undefined && <Progress value={step.progress} className="run-now-bar" />}
          {step.lines?.map(line => <p key={line}>{line}</p>)}
          {step.file && (
            <code className="run-file" title={step.file}>
              <span>{shortPath(step.file)}</span>
              <small>{insidePath(step.file).slice(0, Math.max(0, insidePath(step.file).length - shortPath(step.file).length - 1))}</small>
            </code>
          )}
        </div>
      )}
    </section>
  );
}

function LastJob({device, last}: {device: Device; last: NonNullable<ReturnType<typeof lastRun>>}) {
  const job = device.job!;
  const canEdit = useStore(state => state.session.canEdit);
  const {plan, mutation} = useResumeJob(device);
  const bits = [
    last.duration ? `за ${roughDuration(last.duration)}` : '',
    last.finishedAt ? runMoment(last.finishedAt * 1000) : '',
  ].filter(Boolean).join(' · ');
  return (
    <section className={`device-run last status-${last.status}`}>
      <div className="run-summary">
        <div className="run-summary-text">
          <span className="run-eyebrow">Последний запуск</span>
          <strong>{LAST_STATUS[last.status] ?? last.status}</strong>
          {bits && <span className="run-meta">{bits}</span>}
        </div>
      </div>
      {job.error && <p className="device-error">{job.error.split('\n').filter(Boolean).pop()}</p>}
      {canEdit && plan && (
        <div className="run-resume">
          <Button variant="primary" small disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            <Icon name="play" size={16} />
            <span>Продолжить с этапа «{plan.from}»</span>
          </Button>
          <small>Готовое не пересчитывается: этапы пропустят уже обработанные файлы.</small>
        </div>
      )}
      <Sources roots={job.roots} paths={job.paths} />
      <Pipeline phases={last.phases} compact />
    </section>
  );
}
