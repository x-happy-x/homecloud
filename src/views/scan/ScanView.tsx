import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import './ScanView.scss';
import {getCores, getSources, type Device, type Source} from '../../services/endpoints/backends';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {SectionHead} from '../../ui/ViewHeader/ViewHeader';
import {CoreDialog} from './CoreDialog';
import {DeviceCard} from './DeviceCard';
import {ScanJobDialog} from './ScanJobDialog';
import {SourceCard} from './SourceCard';
import {SourceDialog} from './SourceDialog';

export interface ScanViewProps {
  /** Ядра из общего опроса; undefined — ещё не загружены. */
  devices: Device[] | undefined;
}

/** Ядро для задания по источнику: у своего диска — его хозяин, иначе основное в сети. */
export function pickCore(devices: Device[], source: Source | null): Device | null {
  const ready = devices.filter(device => device.online && !device.legacy);
  if (source?.type === 'device') {
    const own = ready.find(device => device.id === source.device);
    if (own) return own;
  }
  return ready.find(device => device.primary) ?? ready[0] ?? null;
}

export function ScanView({devices}: ScanViewProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const openScan = useStore(state => state.openScan);
  const toast = useStore(state => state.toast);
  const [editingCore, setEditingCore] = useState<{device: Device | null} | null>(null);
  const [editingSource, setEditingSource] = useState<{source: Source | null} | null>(null);
  const list = devices ?? [];

  const sources = useQuery({queryKey: qk.sources(), queryFn: getSources, refetchInterval: 15_000});
  // Пакет ядра и ключ хаба меняются редко — отдельно от опроса статуса.
  const overview = useQuery({queryKey: ['cores-overview'], queryFn: getCores, staleTime: 30_000});
  const sourceList = sources.data?.sources ?? [];

  const scanWith = (device: Device | null, source: Source | null) => {
    if (!device) {
      toast('Нет включённого ядра: запустите PC-X или PC-A');
      return;
    }
    const info = device.device;
    const model = info?.visual_model || info?.visual_models.find(item => item.installed)?.id || '';
    const chosen = source ?? sourceList.find(item => item.type === 'device' && item.device === device.id)
      ?? sourceList[0] ?? null;
    openScan(device.id, info?.capabilities ?? {}, model, chosen?.id ?? '',
      source ? source.roots : []);
  };

  return (
    <section className="analysis-panel">
      <SectionHead
        title="Источники"
        note="Где лежат сами фотографии и видео: диски компьютеров, сетевые папки, SSH, FTP, WebDAV. В источниках ничего не создаётся — превью, лица и описания хранятся на сервере HomeCloud."
        actions={canEdit && (
          <Button small onClick={() => setEditingSource({source: null})}>
            <Icon name="plus" size={16} />
            <span>Источник</span>
          </Button>
        )}
      />
      <div className="source-list">
        {sourceList.map(source => (
          <SourceCard
            key={source.id}
            source={source}
            devices={list}
            onScan={item => scanWith(pickCore(list, item), item)}
            onEdit={item => setEditingSource({source: item})}
          />
        ))}
      </div>
      {sources.data && sourceList.length === 0 && (
        <EmptyState mark="⌁" title="Нет источников">
          Добавьте диск компьютера или сетевую папку, где лежат снимки.
        </EmptyState>
      )}

      <SectionHead
        title="Ядра"
        note="Компьютеры с видеокартой, которые распознают снимки. Каталог живёт на сервере, поэтому уже обработанное видно, даже когда ядра выключены."
        actions={canEdit && (
          <Button small onClick={() => setEditingCore({device: null})}>
            <Icon name="plus" size={16} />
            <span>Ядро</span>
          </Button>
        )}
      />
      <div className="device-list">
        {list.map(device => (
          <DeviceCard
            key={device.id}
            device={device}
            sources={sourceList}
            corePackage={overview.data?.package ?? null}
            onScan={item => scanWith(item, null)}
            onEdit={item => setEditingCore({device: item})}
          />
        ))}
      </div>
      {devices && list.length === 0 && (
        <EmptyState mark="⌁" title="Нет ядер">Подключите компьютер с видеокартой.</EmptyState>
      )}

      <CoreDialog
        open={Boolean(editingCore)}
        device={editingCore?.device ?? null}
        publicKey={overview.data?.publicKey ?? ''}
        onClose={() => setEditingCore(null)}
      />
      <SourceDialog
        open={Boolean(editingSource)}
        source={editingSource?.source ?? null}
        devices={sources.data?.devices ?? list.map(item => ({id: item.id, name: item.name}))}
        types={sources.data?.types}
        onClose={() => setEditingSource(null)}
      />
      <ScanJobDialog devices={devices} sources={sourceList} />
    </section>
  );
}
