import {useEffect, useState, type ChangeEvent} from 'react';
import {useMutation} from '@tanstack/react-query';
import {saveBackend, type Device} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {ToggleChip} from '../../ui/Chip/Chip';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';

export interface BackendDialogProps {
  open: boolean;
  /** null — новое устройство. */
  device: Device | null;
  onClose(): void;
}

const emptyForm = {
  id: '', name: '', url: '', token: '', primary: false,
  sshEnabled: false, sshUser: '', sshHost: '', sshPort: '22', sshCommand: '',
};

export function BackendDialog({open, device, onClose}: BackendDialogProps) {
  const toast = useStore(state => state.toast);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(device
      ? {
        id: device.id, name: device.name, url: device.url, token: '', primary: Boolean(device.primary),
        sshEnabled: Boolean(device.ssh),
        sshUser: device.ssh?.user ?? '', sshHost: device.ssh?.host ?? '',
        sshPort: device.ssh ? String(device.ssh.port) : '22', sshCommand: '',
      }
      : emptyForm);
  }, [open, device]);

  const save = useMutation({
    mutationFn: () => saveBackend({
      id: form.id.trim(), name: form.name.trim(), url: form.url.trim(),
      token: form.token, primary: form.primary,
      sshClear: !form.sshEnabled && Boolean(device?.ssh),
      sshUser: form.sshEnabled ? form.sshUser.trim() : '',
      sshHost: form.sshEnabled ? form.sshHost.trim() : '',
      sshPort: form.sshEnabled ? form.sshPort.trim() : '',
      sshCommand: form.sshEnabled ? form.sshCommand.trim() : '',
    }),
    onSuccess: async () => {
      onClose();
      await queryClient.invalidateQueries({queryKey: qk.devices()});
      toast('Устройство сохранено');
    },
  });

  const field = (key: 'id' | 'name' | 'url' | 'token' | 'sshUser' | 'sshHost' | 'sshPort' | 'sshCommand') =>
    (event: ChangeEvent<HTMLInputElement>) =>
      setForm(current => ({...current, [key]: event.target.value}));

  const sshWasConfigured = Boolean(device?.ssh);

  return (
    <Dialog open={open} onClose={onClose}>
      <Sheet
        className="device-sheet"
        bodyClassName="device-form"
        eyebrow="Backend HomeCloud"
        title="Подключить устройство"
        note="Адрес и токен хранятся только на сервере Proxmox."
        onClose={onClose}
        onSubmit={() => save.mutate()}
      >
        <label>
          ID устройства
          <input required pattern="[a-z0-9][a-z0-9_-]{0,47}" placeholder="pc-office"
            readOnly={Boolean(device)} value={form.id} onChange={field('id')} />
        </label>
        <label>
          Название
          <input required placeholder="Основной компьютер" value={form.name} onChange={field('name')} />
        </label>
        <label>
          Адрес backend
          <input required type="url" placeholder="http://192.168.1.10:18311"
            value={form.url} onChange={field('url')} />
        </label>
        <label>
          Токен
          {/* У сохранённого устройства токен уже есть: пустое поле его не меняет. */}
          <input type="password" placeholder="Оставьте пустым, чтобы не менять"
            required={!device?.hasToken} value={form.token} onChange={field('token')} />
        </label>
        <div className="toggle-row">
          <ToggleChip
            checked={form.primary}
            title="Галерея показывает каталог основного устройства"
            onChange={primary => setForm(current => ({...current, primary}))}
          >
            Основное устройство для галереи
          </ToggleChip>
          <ToggleChip
            checked={form.sshEnabled}
            title="Кнопка «Запустить» на офлайн-карточке устройства поднимет backend.ps1 по SSH"
            onChange={sshEnabled => setForm(current => ({...current, sshEnabled}))}
          >
            Запуск по SSH, если устройство не отвечает
          </ToggleChip>
        </div>
        {form.sshEnabled && (
          <>
            <label>
              Пользователь SSH
              <input required={!sshWasConfigured} placeholder="amagomedsharipov"
                value={form.sshUser} onChange={field('sshUser')} />
            </label>
            <label>
              Хост SSH
              <input placeholder="по умолчанию — хост из адреса backend"
                value={form.sshHost} onChange={field('sshHost')} />
            </label>
            <label>
              Порт SSH
              <input type="number" min={1} max={65535} placeholder="22"
                value={form.sshPort} onChange={field('sshPort')} />
            </label>
            <label>
              Команда запуска
              {/* Выполняется на устройстве через ssh; вывод в контейнер не попадает наружу. */}
              <input required={!sshWasConfigured}
                placeholder={sshWasConfigured
                  ? 'Оставьте пустым, чтобы не менять команду'
                  : 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\\...\\homecloud-core\\start-remote.ps1'}
                value={form.sshCommand} onChange={field('sshCommand')} />
            </label>
          </>
        )}
        <div className="form-actions">
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" type="submit" disabled={save.isPending}>Сохранить</Button>
        </div>
      </Sheet>
    </Dialog>
  );
}
