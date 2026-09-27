import {useState, type ReactNode} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './InfraPanels.scss';
import {checkSources, getCores, getSources, type Device, type Source} from '../../../services/endpoints/backends';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import {Button} from '../../../ui/Button/Button';
import {EmptyState} from '../../../ui/EmptyState/EmptyState';
import {Icon} from '../../../ui/Icon/Icon';
import {CoreCard} from './CoreCard';
import {CoreDialog} from './CoreDialog';
import {SourceDialog} from './SourceDialog';
import {SourceItem} from './SourceItem';

/** Заголовок панели: что это и кнопка «добавить». */
function PanelHead({title, note, action}: {title: string; note: string; action?: ReactNode}) {
  return (
    <header className="infra-head">
      <div>
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
      {action}
    </header>
  );
}

/** «Настройки → Источники»: где лежат оригиналы и как до них добраться. */
export function SourcesPanel({devices}: {devices: Device[]}) {
  const canEdit = useStore(state => state.session.canEdit);
  const [editing, setEditing] = useState<{source: Source | null} | null>(null);
  const sources = useQuery({queryKey: qk.sources(), queryFn: getSources, refetchInterval: 15_000});
  const list = sources.data?.sources ?? [];
  const toast = useStore(state => state.toast);
  const check = useMutation({
    mutationFn: checkSources,
    onSuccess: data => {
      queryClient.setQueryData(qk.sources(), data);
      void queryClient.invalidateQueries({queryKey: qk.devices()});
      void queryClient.invalidateQueries({queryKey: ['cores-overview']});
      const down = data.sources.filter(item => item.health && !item.health.online).length;
      toast(down ? `Недоступно источников: ${down}` : 'Все источники доступны');
    },
    onError: error => toast(error instanceof Error ? error.message : 'Проверка не удалась'),
  });

  return (
    <section className="infra-panel" aria-label="Источники">
      <PanelHead
        title="Источники"
        note="Диски компьютеров, сетевые папки, SSH, FTP, WebDAV. В источниках ничего не создаётся, кроме роликов, которые вы сами перекодировали, — превью, лица и описания хранятся на сервере. Доступность хаб проверяет раз в пять минут."
        action={(
          <div className="infra-head-actions">
            <Button small disabled={check.isPending} onClick={() => check.mutate()}
              title="Хаб сам проверяет источники раз в пять минут">
              <Icon name="undo" size={16} />
              <span>{check.isPending ? 'Проверяю…' : 'Проверить сейчас'}</span>
            </Button>
            {canEdit && (
              <Button variant="primary" small onClick={() => setEditing({source: null})}>
                <Icon name="plus" size={16} />
                <span>Добавить источник</span>
              </Button>
            )}
          </div>
        )}
      />
      <div className="infra-list">
        {list.map(source => (
          <SourceItem key={source.id} source={source} devices={devices} onEdit={item => setEditing({source: item})} />
        ))}
      </div>
      {sources.data && list.length === 0 && (
        <EmptyState mark="⌁" title="Нет источников">Добавьте диск компьютера или сетевую папку, где лежат снимки.</EmptyState>
      )}
      <SourceDialog
        open={Boolean(editing)}
        source={editing?.source ?? null}
        devices={sources.data?.devices ?? devices.map(item => ({id: item.id, name: item.name}))}
        types={sources.data?.types}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

/** «Настройки → Ядра»: компьютеры, которые считают, и всё, что на них стоит. */
export function CoresPanel({devices}: {devices: Device[] | undefined}) {
  const canEdit = useStore(state => state.session.canEdit);
  const [editing, setEditing] = useState<{device: Device | null} | null>(null);
  const sources = useQuery({queryKey: qk.sources(), queryFn: getSources, refetchInterval: 15_000});
  // Пакет ядра и ключ хаба меняются редко — отдельно от опроса статуса.
  const overview = useQuery({queryKey: ['cores-overview'], queryFn: getCores, staleTime: 30_000});
  const list = devices ?? [];

  return (
    <section className="infra-panel" aria-label="Ядра">
      <PanelHead
        title="Ядра"
        note="Компьютеры с видеокартой, которые распознают снимки. Сервер ставит, обновляет и запускает их по SSH; каталог живёт на сервере, поэтому обработанное видно и без ядер."
        action={canEdit && (
          <Button variant="primary" small onClick={() => setEditing({device: null})}>
            <Icon name="plus" size={16} />
            <span>Добавить ядро</span>
          </Button>
        )}
      />
      {overview.data?.package && (
        <p className="infra-package">
          <Icon name="layers" size={16} />
          Пакет ядра на сервере: <b>{overview.data.package.version}</b>
        </p>
      )}
      <div className="infra-list">
        {list.map(device => (
          <CoreCard
            key={device.id}
            device={device}
            sources={sources.data?.sources ?? []}
            corePackage={overview.data?.package ?? null}
            onEdit={item => setEditing({device: item})}
          />
        ))}
      </div>
      {devices && list.length === 0 && (
        <EmptyState mark="⌁" title="Нет ядер">Подключите компьютер с видеокартой.</EmptyState>
      )}
      <CoreDialog
        open={Boolean(editing)}
        device={editing?.device ?? null}
        publicKey={overview.data?.publicKey ?? ''}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
