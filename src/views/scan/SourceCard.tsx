import {useCallback, useRef, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {fileSize, formatNumber} from '../../lib/format';
import {removeSource, type Device, type Source} from '../../services/endpoints/backends';
import {confirmAction} from '../../services/dialogs';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';
import {IconButton} from '../../ui/IconButton/IconButton';
import {Pill} from '../../ui/Pill/Pill';
import {Popover} from '../../ui/Popover/Popover';

export interface SourceCardProps {
  source: Source;
  devices: Device[];
  onScan(source: Source): void;
  onEdit(source: Source): void;
}

/** Где источник: адрес и шара у сетевых, устройство у дисков. */
export function sourceAddress(source: Source, devices: Device[]): string {
  if (source.type === 'device') {
    const device = devices.find(item => item.id === source.device);
    return `диски ${device?.name ?? source.device}`;
  }
  if (source.type === 'local') return source.path;
  const scheme = {smb: 'smb', sftp: 'sftp', ftp: source.secure ? 'ftps' : 'ftp',
    webdav: source.secure ? 'https' : 'http'}[source.type] ?? source.type;
  const user = source.user ? `${source.user}@` : '';
  const tail = source.type === 'smb' ? `/${source.share}` : source.path;
  return `${scheme}://${user}${source.host}${tail ?? ''}`;
}

/** Путь папки внутри источника без его id: «/HDD/photo», «D:\Фото». */
export const insidePath = (key: string) => key.replace(/^[a-z0-9][a-z0-9_-]{1,31}:/, '') || '/';

export function SourceCard({source, devices, onScan, onEdit}: SourceCardProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const stats = source.stats ?? {};
  const host = source.type === 'device' ? devices.find(item => item.id === source.device) : null;
  // Диск устройства хаб читает через ядро или по SSH; без них — только превью.
  const reachable = source.type !== 'device' || Boolean(host?.online || host?.ssh);

  const remove = useMutation({
    mutationFn: (purge: boolean) => removeSource(source.id, purge),
    onSuccess: () => {
      toast('Источник удалён');
      void queryClient.invalidateQueries({queryKey: qk.sources()});
      void queryClient.invalidateQueries({queryKey: ['photos']});
      void queryClient.invalidateQueries({queryKey: ['state']});
    },
  });

  const metrics: Array<[string, number | undefined]> = [
    ['фото', stats.photos], ['видео', stats.videos], ['лиц', stats.faces],
    ['с именем', stats.named_faces], ['превью', stats.thumbs], ['в индексе', stats.analysis],
  ];

  return (
    <article className={`device-card source-card${source.enabled ? '' : ' offline'}`}>
      <header className="device-head">
        <span className="device-mark" aria-hidden="true">
          <Icon name={source.type === 'device' ? 'drive' : 'folder'} />
        </span>
        <div className="device-id">
          <h3>{source.name}<span className="device-primary">{source.typeName}</span></h3>
          <span className="device-address" title={sourceAddress(source, devices)}>
            {sourceAddress(source, devices)}
          </span>
        </div>
        {!reachable && <Pill tone="error">Устройство не в сети</Pill>}
        {canEdit && (
          <div className="device-head-actions">
            <Button variant="primary" small onClick={() => onScan(source)}>
              <Icon name="scan" size={16} />
              <span>Сканировать</span>
            </Button>
            <SourceMenu
              onEdit={() => onEdit(source)}
              onRemove={async () => {
                if (!await confirmAction(
                  `Удалить источник «${source.name}»? Сами файлы в нём не трогаются.`,
                  {title: 'Удалить источник', confirmLabel: 'Удалить', danger: true})) return;
                // Второй вопрос — про посчитанное: «Отмена» оставляет его на сервере.
                const purge = await confirmAction(
                  'Удалить с сервера и всё посчитанное по этому источнику — лица, превью, '
                  + 'описания? «Отмена» — оставить данные.',
                  {title: 'Данные источника', confirmLabel: 'Удалить данные', danger: true});
                remove.mutate(purge);
              }}
            />
          </div>
        )}
      </header>

      <div className="device-metrics source-metrics">
        {metrics.map(([label, value]) => (
          <span key={label}><b>{formatNumber(value ?? 0)}</b>{label}</span>
        ))}
        {Boolean(stats.thumb_bytes) && (
          <span><b>{fileSize(stats.thumb_bytes)}</b>превью на сервере</span>
        )}
      </div>

      {source.roots.length > 0 && (
        <div className="run-sources">
          {source.roots.map(root => (
            <span key={root} className="run-source" title={root}>
              <Icon name="folder" size={14} />{insidePath(root)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function SourceMenu({onEdit, onRemove}: {onEdit(): void; onRemove(): void}) {
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
          <Icon name="trash" />Удалить источник
        </button>
      </Popover>
    </>
  );
}
