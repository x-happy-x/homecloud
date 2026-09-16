import {useCallback, useRef, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {planSteps} from '../../hooks/useDeviceJobNotifications';
import {formatNumber, roughDuration, runMoment} from '../../lib/format';
import {FEATURE_INFO} from '../../lib/jobs';
import {lastRun, planJob, planMeta} from '../../lib/scanPlan';
import {removeBackend, stopJob, type Device} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';
import {IconButton} from '../../ui/IconButton/IconButton';
import {Pill} from '../../ui/Pill/Pill';
import {Popover} from '../../ui/Popover/Popover';
import {Progress} from '../../ui/Progress/Progress';
import {Pipeline} from './Pipeline';

const GIB = 1073741824;

const LAST_STATUS: Record<string, string> = {
  completed: 'Готово', stopped: 'Остановлено', error: 'Ошибка', interrupted: 'Прервано',
};

export interface DeviceCardProps {
  device: Device;
  onScan(device: Device): void;
  onEdit(device: Device): void;
}

/** Путь источника коротко: последняя папка, полный путь — в подсказке. */
const shortPath = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

export function DeviceCard({device, onScan, onEdit}: DeviceCardProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const refresh = () => queryClient.invalidateQueries({queryKey: qk.devices()});

  const stop = useMutation({
    mutationFn: () => stopJob(device.id),
    onSuccess: () => { toast('Остановка запрошена — этап доработает текущий файл'); void refresh(); },
  });
  const remove = useMutation({
    mutationFn: () => removeBackend(device.id),
    onSuccess: () => { toast('Устройство удалено'); void refresh(); },
  });

  const job = device.job ?? {active: false};
  const running = device.online && job.active;
  const plan = running ? planJob(device) : null;
  const last = device.online && !job.active ? lastRun(job) : null;

  const status = !device.online ? 'Не в сети'
    : running ? (job.stop_requested ? 'Останавливается' : 'Идёт задание')
    : 'Готово к работе';

  return (
    <article className={`device-card${device.online ? '' : ' offline'}${running ? ' running' : ''}`}>
      <header className="device-head">
        <span className="device-mark" aria-hidden="true"><Icon name="scan" /></span>
        <div className="device-id">
          <h3>{device.name}{device.primary && <span className="device-primary">основное</span>}</h3>
          <span className="device-address" title={device.url}>{device.url}</span>
        </div>
        <Pill tone={!device.online ? 'error' : running ? 'running' : 'default'}>{status}</Pill>
        {canEdit && (
          <div className="device-head-actions">
            {running
              ? (
                <Button variant="danger" small disabled={stop.isPending || job.stop_requested} onClick={() => stop.mutate()}>
                  <Icon name="stop" size={16} />
                  <span>Остановить</span>
                </Button>
              )
              : (
                <Button variant="primary" small disabled={!device.online} onClick={() => onScan(device)}>
                  <Icon name="plus" size={16} />
                  <span>Новое задание</span>
                </Button>
              )}
            <DeviceMenu
              onEdit={() => onEdit(device)}
              onRemove={() => {
                if (confirm(`Удалить устройство «${device.name}» из HomeCloud?\nКаталог на самом устройстве не тронется.`)) {
                  remove.mutate();
                }
              }}
            />
          </div>
        )}
      </header>

      {!device.online && (
        <p className="device-error">{device.error || 'Устройство не отвечает — проверьте, запущен ли backend.'}</p>
      )}

      {running && plan && <RunningJob device={device} plan={plan} />}
      {last && <LastJob device={device} last={last} />}
      {device.online && !running && !last && (
        <div className="device-empty">
          <strong>Заданий ещё не было</strong>
          <span>Выберите папки на устройстве и этапы — прогресс появится здесь пайплайном.</span>
        </div>
      )}

      {device.online && <DeviceFacts device={device} />}
    </article>
  );
}

function DeviceMenu({onEdit, onRemove}: {onEdit(): void; onRemove(): void}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <span ref={anchor}>
        <IconButton icon="more" label="Ещё" aria-expanded={open} onClick={() => setOpen(value => !value)} />
      </span>
      <Popover open={open} anchor={anchor} onClose={close} className="menu">
        <button type="button" onClick={() => { close(); onEdit(); }}>
          <Icon name="settings" />Подключение
        </button>
        <button type="button" className="danger" onClick={() => { close(); onRemove(); }}>
          <Icon name="trash" />Удалить устройство
        </button>
      </Popover>
    </>
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
              <small>{step.file.slice(0, Math.max(0, step.file.length - shortPath(step.file).length - 1))}</small>
            </code>
          )}
        </div>
      )}
    </section>
  );
}

function LastJob({device, last}: {device: Device; last: NonNullable<ReturnType<typeof lastRun>>}) {
  const job = device.job!;
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
      <Sources roots={job.roots} paths={job.paths} />
      <Pipeline phases={last.phases} compact />
    </section>
  );
}

function DeviceFacts({device}: {device: Device}) {
  const job = device.job ?? {active: false};
  const info = device.device;
  const capabilities = info?.capabilities ?? {};
  const drives = info?.drives ?? [];
  // Старые бэкенды отдают счётчики каталога россыпью, а не объектом.
  const catalog = job.catalog ?? {
    photos: job.catalog_photos ?? 0, faces: job.catalog_faces ?? 0,
    videos: job.catalog_videos ?? 0, indexed: job.catalog_indexed ?? 0,
    ocr: job.catalog_ocr ?? 0, captioned: job.catalog_captioned ?? 0,
    adult: job.catalog_adult_analyzed ?? 0,
  };
  const metrics: Array<[string, number | undefined]> = [
    ['фото', catalog.photos], ['видео', catalog.videos], ['лиц', catalog.faces],
    ['в индексе', catalog.indexed], ['с текстом', catalog.ocr], ['с описанием', catalog.captioned],
    ['проверено 18+', catalog.adult],
  ];
  const available = Object.entries(FEATURE_INFO).filter(([key]) => capabilities[key]);
  const missing = Object.entries(FEATURE_INFO).filter(([key]) => !capabilities[key]);

  return (
    <div className="device-facts">
      <section className="fact-block">
        <h4>Каталог на устройстве</h4>
        <div className="device-metrics">
          {metrics.map(([label, value]) => (
            <span key={label}><b>{formatNumber(value)}</b>{label}</span>
          ))}
        </div>
      </section>

      <section className="fact-block">
        <h4>Диски</h4>
        {drives.length
          ? (
            <ul className="drive-list">
              {drives.map(drive => {
                const used = drive.total && drive.free != null ? 1 - drive.free / drive.total : null;
                return (
                  <li key={drive.path} title={drive.path}>
                    <Icon name="drive" size={16} />
                    <span className="drive-name">{drive.name || drive.path}</span>
                    <span className="drive-free">
                      {drive.free == null ? '—' : `${formatNumber(Math.round(drive.free / GIB))} ГБ свободно`}
                    </span>
                    {used !== null && <Progress value={used} className={`drive-bar${used > .9 ? ' full' : ''}`} />}
                  </li>
                );
              })}
            </ul>
          )
          : <p className="fact-empty">Диски не найдены</p>}
      </section>

      <section className="fact-block">
        <h4>Что умеет</h4>
        <div className="capability-list">
          {available.map(([key, [title, note]]) => (
            <span key={key} className="feature-badge" title={note}><Icon name="check" size={13} />{title}</span>
          ))}
        </div>
        {missing.length > 0 && (
          <p className="fact-empty">Не установлено: {missing.map(([, [title]]) => title).join(', ')}</p>
        )}
      </section>
    </div>
  );
}
