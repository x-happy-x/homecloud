import {useEffect, useMemo, useState} from 'react';
import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {browseDevice, getDevices, type Device} from '../../services/endpoints/backends';
import {qk} from '../../services/queryKeys';
import {Button} from '../../ui/Button/Button';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {HintLine} from '../../ui/Hint/Hint';
import './FolderPickerDialog.scss';

export interface PickedFolder {
  deviceId: string;
  deviceName: string;
  path: string;
}

interface FolderPickerDialogProps {
  open: boolean;
  title: string;
  note?: string;
  confirmLabel?: string;
  onClose(): void;
  onPick(folder: PickedFolder): void;
}

export function FolderPickerDialog({
  open, title, note, confirmLabel = 'Выбрать эту папку', onClose, onPick,
}: FolderPickerDialogProps) {
  const devices = useQuery({queryKey: qk.devices(), queryFn: getDevices, enabled: open});
  const online = useMemo(() => (devices.data ?? []).filter(device => device.online), [devices.data]);
  const [deviceId, setDeviceId] = useState('');
  const [path, setPath] = useState('');

  useEffect(() => {
    if (!open) return;
    const first = online[0]?.id ?? '';
    setDeviceId(current => (current && online.some(device => device.id === current) ? current : first));
    setPath('');
  }, [open, online]);

  const device = online.find(item => item.id === deviceId) ?? online[0] ?? null;
  const browse = useQuery({
    queryKey: qk.browse(device?.id ?? '', path),
    queryFn: () => browseDevice(device!.id, path),
    enabled: open && Boolean(device),
    placeholderData: keepPreviousData,
  });
  const data = browse.data;
  const entries = data?.directories ?? [];

  const pick = () => {
    if (!device || !data?.path) return;
    onPick({deviceId: device.id, deviceName: device.name, path: data.path});
  };

  const chooseDevice = (next: string) => {
    setDeviceId(next);
    setPath('');
  };

  return (
    <Dialog open={open} onClose={onClose} className="folder-picker-dialog">
      <Sheet
        title={title}
        note={note}
        onClose={onClose}
        footer={(
          <>
            <Button onClick={onClose}>Отмена</Button>
            <Button variant="primary" disabled={!data?.path} onClick={pick}>{confirmLabel}</Button>
          </>
        )}
      >
        <div className="folder-picker-device-row">
          <label>
            Бэк
            <select value={device?.id ?? ''} onChange={event => chooseDevice(event.target.value)}>
              {online.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>

        {!online.length && <HintLine>Нет подключенных доступных бэков.</HintLine>}

        {device && (
          <>
            <div className="path-toolbar">
              <Button small disabled={!data || data.parent === null} onClick={() => setPath(data?.parent ?? '')}>
                ↑
              </Button>
              <code>{data?.path || 'Диски'}</code>
            </div>
            <div className="folder-list folder-picker-list">
              {browse.isError
                ? <div className="folder-empty">Не удалось открыть папку</div>
                : !data
                  ? <div className="folder-empty">Загрузка…</div>
                  : entries.length
                    ? entries.map(entry => (
                        <button
                          key={entry.path}
                          type="button"
                          className="folder-picker-entry"
                          onClick={() => setPath(entry.path)}
                        >
                          <span>📁</span>
                          <span>{entry.name || entry.path}</span>
                        </button>
                      ))
                    : <div className="folder-empty">Нет доступных папок</div>}
            </div>
          </>
        )}
      </Sheet>
    </Dialog>
  );
}
