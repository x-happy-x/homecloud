import {useMutation} from '@tanstack/react-query';
import {insidePath, sourceAddress} from '../../../lib/sources';
import {removeSource, type Device, type Source} from '../../../services/endpoints/backends';
import {confirmAction} from '../../../services/dialogs';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import {Button} from '../../../ui/Button/Button';
import {Icon} from '../../../ui/Icon/Icon';
import {IconButton} from '../../../ui/IconButton/IconButton';
import {Pill} from '../../../ui/Pill/Pill';
import {DriveList} from './DriveList';

export interface SourceItemProps {
  source: Source;
  devices: Device[];
  onEdit(source: Source): void;
}

/**
 * Источник в настройках: где лежит, как подключён, обычные папки. Сколько в
 * нём снимков и что посчитано — в «Сканировании» и «Данных».
 */
export function SourceItem({source, devices, onEdit}: SourceItemProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const host = source.type === 'device' ? devices.find(item => item.id === source.device) : null;
  // Диск устройства хаб читает через ядро или по SSH; без них — только превью.
  const reachable = source.type !== 'device' || Boolean(host?.online || host?.ssh);
  const address = sourceAddress(source, devices);

  const remove = useMutation({
    mutationFn: (purge: boolean) => removeSource(source.id, purge),
    onSuccess: () => {
      toast('Источник удалён');
      void queryClient.invalidateQueries({queryKey: qk.sources()});
      void queryClient.invalidateQueries({queryKey: ['photos']});
      void queryClient.invalidateQueries({queryKey: ['state']});
    },
  });

  const confirmRemove = async () => {
    if (!await confirmAction(
      `Удалить источник «${source.name}»? Сами файлы в нём не трогаются.`,
      {title: 'Удалить источник', confirmLabel: 'Удалить', danger: true})) return;
    // Второй вопрос — про посчитанное: «Отмена» оставляет его на сервере.
    const purge = await confirmAction(
      'Удалить с сервера и всё посчитанное по этому источнику — лица, превью, '
      + 'описания? «Отмена» — оставить данные.',
      {title: 'Данные источника', confirmLabel: 'Удалить данные', danger: true});
    remove.mutate(purge);
  };

  return (
    <article className={`infra-item${source.enabled ? '' : ' muted'}`}>
      <span className="infra-mark" aria-hidden="true">
        <Icon name={source.type === 'device' ? 'drive' : 'folder'} />
      </span>
      <div className="infra-main">
        <div className="infra-title">
          <h3>{source.name}</h3>
          <span className="infra-tag">{source.typeName}</span>
          {!source.enabled && <span className="infra-tag">выключен</span>}
        </div>
        <code className="infra-address" title={address}>{address}</code>
        {source.roots.length > 0 && (
          <div className="infra-chips">
            {source.roots.map(root => (
              <span key={root} className="infra-chip" title={root}>
                <Icon name="folder" size={13} />{insidePath(root)}
              </span>
            ))}
          </div>
        )}
      </div>
      {host && (
        <div className="infra-drives">
          {host.online && host.device
            ? <DriveList drives={host.device.drives} used={source.roots.map(root => root.replace(/^[^:]+:/, ''))} />
            : <p className="fact-empty">{host.name} не в сети — место на дисках неизвестно.</p>}
        </div>
      )}
      <div className="infra-side">
        {!reachable && <Pill tone="error">Устройство не в сети</Pill>}
        {canEdit && (
          <>
            <Button small onClick={() => onEdit(source)}>
              <Icon name="settings" size={16} />
              <span>Подключение</span>
            </Button>
            <IconButton icon="trash" label="Удалить источник" disabled={remove.isPending}
              onClick={() => void confirmRemove()} />
          </>
        )}
      </div>
    </article>
  );
}
