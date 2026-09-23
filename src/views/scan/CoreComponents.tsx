import {useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import {fileSize} from '../../lib/format';
import {
  getCoreComponents, startCoreComponent, stopCoreComponent,
  type ComponentOperation, type CoreComponent, type Device,
} from '../../services/endpoints/backends';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';
import {Progress} from '../../ui/Progress/Progress';
import './CoreComponents.scss';

const ACTIONS: Record<string, string> = {
  install: 'Установка', download: 'Загрузка', copy: 'Копия',
};

type StartPayload = Parameters<typeof startCoreComponent>[1];

/**
 * Окружения и модели ядра: что стоит и что доставить. Модель, которая уже
 * есть на другом ядре, копируется с него по домашней сети, а не качается.
 */
export function CoreComponents({device}: {device: Device}) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const query = useQuery({
    queryKey: qk.coreComponents(device.id),
    queryFn: () => getCoreComponents(device.id),
    refetchInterval: current => (current.state.data?.operation?.status === 'running' ? 2000 : false),
    staleTime: 10_000,
  });
  const start = useMutation({
    mutationFn: (payload: StartPayload) => startCoreComponent(device.id, payload),
    onSuccess: () => { void query.refetch(); },
    onError: (error: Error) => toast(error.message),
  });
  const stop = useMutation({
    mutationFn: () => stopCoreComponent(device.id),
    onSuccess: () => { void query.refetch(); },
    onError: (error: Error) => toast(error.message),
  });

  if (query.isPending) return <p className="fact-empty">Смотрю, что установлено…</p>;
  if (query.isError) return <p className="fact-empty">Не удалось узнать: {query.error.message}</p>;

  const {venvs, models, operation} = query.data;
  const busy = operation?.status === 'running' || start.isPending;
  const actions = canEdit && !busy ? (payload: StartPayload) => start.mutate(payload) : null;

  return (
    <div className="core-components">
      {operation && (
        <ComponentProgress
          operation={operation}
          title={[...venvs, ...models].find(item => item.id === operation.id)?.title ?? operation.id}
          onStop={canEdit ? () => stop.mutate() : null}
        />
      )}
      <section className="fact-block">
        <h4>Окружения</h4>
        <ul className="component-list">
          {venvs.map(item => <ComponentRow key={item.id} item={item} onStart={actions} />)}
        </ul>
      </section>
      <section className="fact-block">
        <h4>Модели</h4>
        <ul className="component-list">
          {models.map(item => <ComponentRow key={item.id} item={item} onStart={actions} />)}
        </ul>
      </section>
    </div>
  );
}

function ComponentRow({item, onStart}: {item: CoreComponent; onStart: ((payload: StartPayload) => void) | null}) {
  const peers = item.peers ?? [];
  return (
    <li className={`component-row${item.installed ? ' installed' : ''}`}>
      <span className="component-mark" aria-hidden="true">
        {item.installed ? <Icon name="check" size={14} /> : null}
      </span>
      <span className="component-title">{item.title}</span>
      <span className="component-state">
        {item.installed
          ? (item.bytes ? fileSize(item.bytes) : 'есть')
          : item.note && !peers.length ? item.note : 'нет'}
      </span>
      {!item.installed && onStart && (
        <span className="component-actions">
          {item.kind === 'venv' && (
            <Button small onClick={() => onStart({id: item.id, action: 'install'})}>Установить</Button>
          )}
          {peers.map(peer => (
            <Button key={peer.id} small variant="primary"
              onClick={() => onStart({id: item.id, action: 'copy', from: peer.id})}>
              Скопировать с {peer.name}
            </Button>
          ))}
          {item.kind === 'model' && item.downloadable && (
            <Button small onClick={() => onStart({id: item.id, action: 'download'})}
              title={item.gated ? 'Нужен hf-token.txt в папке ядра' : undefined}>
              Скачать
            </Button>
          )}
        </span>
      )}
    </li>
  );
}

function ComponentProgress({operation, title, onStop}: {
  operation: ComponentOperation; title: string; onStop: (() => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const running = operation.status === 'running';
  const failed = operation.status === 'error';
  const share = operation.total ? operation.done / operation.total : null;
  return (
    <div className={`component-progress${failed ? ' failed' : ''}`}>
      <div className="component-progress-head">
        <span>
          <span className="run-eyebrow">{ACTIONS[operation.action] ?? operation.action}</span>
          <strong>{title}</strong>
        </span>
        <span className="component-progress-state">
          {running
            ? (operation.total ? `${fileSize(operation.done)} из ${fileSize(operation.total)}` : 'идёт…')
            : failed ? operation.error || 'Ошибка' : 'Готово'}
        </span>
        {running && onStop && <Button small variant="danger" onClick={onStop}>Остановить</Button>}
        <Button small onClick={() => setOpen(value => !value)}>{open ? 'Скрыть журнал' : 'Журнал'}</Button>
      </div>
      {running && <Progress value={share} />}
      {open && <pre className="component-log">{operation.log.join('\n')}</pre>}
    </div>
  );
}
