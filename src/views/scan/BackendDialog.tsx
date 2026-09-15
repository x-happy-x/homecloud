import {useEffect, useState, type ChangeEvent} from 'react';
import {useMutation} from '@tanstack/react-query';
import {saveBackend, type Device} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {CheckRow} from '../../ui/CheckRow/CheckRow';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';

export interface BackendDialogProps {
  open: boolean;
  /** null — новое устройство. */
  device: Device | null;
  onClose(): void;
}

const emptyForm = {id: '', name: '', url: '', token: '', primary: false};

export function BackendDialog({open, device, onClose}: BackendDialogProps) {
  const toast = useStore(state => state.toast);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(device
      ? {id: device.id, name: device.name, url: device.url, token: '', primary: Boolean(device.primary)}
      : emptyForm);
  }, [open, device]);

  const save = useMutation({
    mutationFn: () => saveBackend({
      ...form, id: form.id.trim(), name: form.name.trim(), url: form.url.trim(),
    }),
    onSuccess: async () => {
      onClose();
      await queryClient.invalidateQueries({queryKey: qk.devices()});
      toast('Устройство сохранено');
    },
  });

  const field = (key: 'id' | 'name' | 'url' | 'token') =>
    (event: ChangeEvent<HTMLInputElement>) =>
      setForm(current => ({...current, [key]: event.target.value}));

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
        <CheckRow checked={form.primary} onChange={primary => setForm(current => ({...current, primary}))}>
          Основное устройство для галереи
        </CheckRow>
        <div className="form-actions">
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" type="submit" disabled={save.isPending}>Сохранить</Button>
        </div>
      </Sheet>
    </Dialog>
  );
}
