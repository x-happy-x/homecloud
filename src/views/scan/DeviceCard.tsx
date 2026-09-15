import {useMutation} from '@tanstack/react-query';
import {deviceEta} from '../../lib/eta';
import {formatNumber} from '../../lib/format';
import {FEATURE_INFO, JOB_LABELS, jobFraction} from '../../lib/jobs';
import {removeBackend, stopJob, type Device} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Pill} from '../../ui/Pill/Pill';
import {Progress} from '../../ui/Progress/Progress';

const GIB = 1073741824;

export interface DeviceCardProps {
  device: Device;
  onScan(device: Device): void;
  onEdit(device: Device): void;
}

export function DeviceCard({device, onScan, onEdit}: DeviceCardProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const refresh = () => queryClient.invalidateQueries({queryKey: qk.devices()});

  const stop = useMutation({
    mutationFn: () => stopJob(device.id),
    onSuccess: () => { toast('Остановка запрошена'); void refresh(); },
  });
  const remove = useMutation({
    mutationFn: () => removeBackend(device.id),
    onSuccess: () => { toast('Устройство удалено'); void refresh(); },
  });

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
    ['в индексе', catalog.indexed], ['OCR', catalog.ocr], ['описаний', catalog.captioned],
    ['18+ проверено', catalog.adult],
  ];
  const fraction = jobFraction(job);
  const eta = deviceEta.estimate(device);
  const status = device.online
    ? JOB_LABELS[job.phase ?? ''] || JOB_LABELS[job.status ?? ''] || 'В сети'
    : 'Не в сети';

  return (
    <article className={`device-card${device.online ? '' : ' offline'}`}>
      <header className="device-card-head">
        <div>
          <div className="device-title"><span className="status-dot" />{device.name}</div>
          <div className="device-address">{device.url}</div>
        </div>
        <Pill tone={!device.online ? 'error' : job.active ? 'running' : 'default'}>{status}</Pill>
      </header>

      {device.online ? (
        <>
          <div className="drive-list">
            {drives.length
              ? drives.map(drive => {
                  const free = drive.free == null ? null : Math.round(drive.free / GIB);
                  return (
                    <span key={drive.path} title={drive.path}>
                      {drive.name || drive.path} · {free == null ? '—' : `${formatNumber(free)} ГБ свободно`}
                    </span>
                  );
                })
              : <span>Диски не найдены</span>}
          </div>
          <div className="capability-list">
            {Object.entries(FEATURE_INFO).map(([key, [title]]) => (
              <span key={key} className={`feature-badge ${capabilities[key] ? 'available' : 'unavailable'}`}>
                {capabilities[key] ? '✓' : '—'} {title}
              </span>
            ))}
          </div>
          <div className="device-metrics">
            {metrics.map(([label, value]) => (
              <span key={label}><b>{formatNumber(value)}</b> {label}</span>
            ))}
          </div>
          {job.active && (
            <div className="device-progress">
              <div>
                <span>{JOB_LABELS[job.phase ?? ''] || 'Обработка'}</span>
                <b>{Math.round(fraction * 100)}%</b>
              </div>
              <Progress value={fraction} />
              <small>
                {formatNumber(job.completed)} из {formatNumber(job.total)}
                {job.videos_done ? ` · видео: ${formatNumber(job.videos_done)}` : ''}
                {eta ? ` · ${eta}` : ''} · {job.current ?? ''}
              </small>
            </div>
          )}
        </>
      ) : (
        <p className="device-error">{device.error || 'Устройство не отвечает'}</p>
      )}

      {canEdit && (
        <footer className="device-actions">
          <Button variant="primary" small disabled={!device.online} onClick={() => onScan(device)}>
            Выбрать папки и запустить
          </Button>
          {job.active && (
            <Button variant="danger" small disabled={stop.isPending} onClick={() => stop.mutate()}>
              Остановить
            </Button>
          )}
          <Button small onClick={() => onEdit(device)}>Настройки</Button>
          <Button small disabled={remove.isPending} onClick={() => remove.mutate()}>Удалить</Button>
        </footer>
      )}
    </article>
  );
}
