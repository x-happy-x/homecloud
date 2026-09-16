import {useState} from 'react';
import './ScanView.scss';
import type {Device} from '../../services/endpoints/backends';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {SectionHead} from '../../ui/ViewHeader/ViewHeader';
import {BackendDialog} from './BackendDialog';
import {DeviceCard} from './DeviceCard';
import {ScanJobDialog} from './ScanJobDialog';

export interface ScanViewProps {
  /** Список устройств из общего опроса; undefined — ещё не загружен. */
  devices: Device[] | undefined;
}

export function ScanView({devices}: ScanViewProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const openScan = useStore(state => state.openScan);
  const [editing, setEditing] = useState<{device: Device | null} | null>(null);
  const list = devices ?? [];

  const startScan = (device: Device) => {
    if (!device.online) return;
    const info = device.device;
    const model = info?.visual_model || info?.visual_models.find(item => item.installed)?.id || '';
    openScan(device.id, info?.capabilities ?? {}, model);
  };

  return (
    <section className="analysis-panel">
      <SectionHead
        title="Сканирование"
        note="Каждый backend — отдельное устройство: выберите на нём диски или папки и включите
          только нужные этапы. Файлы обрабатываются на самом устройстве и не загружаются
          в HomeCloud или облако."
        actions={canEdit && (
          <Button variant="primary" onClick={() => setEditing({device: null})}>Добавить устройство</Button>
        )}
      />

      <div className="device-grid">
        {list.map(device => (
          <DeviceCard
            key={device.id}
            device={device}
            onScan={startScan}
            onEdit={item => setEditing({device: item})}
          />
        ))}
      </div>
      {devices && list.length === 0 && (
        <EmptyState mark="⌁" title="Нет устройств">Подключите компьютер с backend HomeCloud.</EmptyState>
      )}

      <BackendDialog open={Boolean(editing)} device={editing?.device ?? null} onClose={() => setEditing(null)} />
      <ScanJobDialog devices={devices} />
    </section>
  );
}
