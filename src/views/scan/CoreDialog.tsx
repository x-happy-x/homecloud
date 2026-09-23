import {useEffect, useState, type ChangeEvent} from 'react';
import {useMutation} from '@tanstack/react-query';
import {copyText} from '../../lib/clipboard';
import {saveCore, type Device} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {ToggleChip} from '../../ui/Chip/Chip';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {HintLine} from '../../ui/Hint/Hint';

export interface CoreDialogProps {
  open: boolean;
  /** null — новое ядро. */
  device: Device | null;
  /** Открытый ключ сервера: его кладут в authorized_keys устройства. */
  publicKey: string;
  onClose(): void;
}

const emptyForm = {
  id: '', name: '', host: '', port: '18311', primary: false, installDir: 'C:\\HomeCloud\\core',
  sshEnabled: true, sshUser: '', sshPort: '22', sshPassword: '',
};

export function CoreDialog({open, device, publicKey, onClose}: CoreDialogProps) {
  const toast = useStore(state => state.toast);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(device
      ? {
        id: device.id, name: device.name, host: device.host ?? '', port: String(device.port ?? 18311),
        primary: Boolean(device.primary), installDir: device.installDir ?? '',
        sshEnabled: Boolean(device.ssh), sshUser: device.ssh?.user ?? '',
        sshPort: device.ssh ? String(device.ssh.port) : '22', sshPassword: '',
      }
      : emptyForm);
  }, [open, device]);

  const save = useMutation({
    mutationFn: () => saveCore({
      id: form.id.trim(), name: form.name.trim(), host: form.host.trim(), port: form.port.trim(),
      primary: form.primary, installDir: form.installDir.trim(),
      sshClear: !form.sshEnabled && Boolean(device?.ssh),
      sshUser: form.sshEnabled ? form.sshUser.trim() : '',
      sshPort: form.sshEnabled ? form.sshPort.trim() : '',
      sshPassword: form.sshEnabled ? form.sshPassword : '',
    }),
    onSuccess: async () => {
      onClose();
      await queryClient.invalidateQueries({queryKey: qk.devices()});
      await queryClient.invalidateQueries({queryKey: ['cores-overview']});
      toast('Ядро сохранено');
    },
  });

  const field = (key: 'id' | 'name' | 'host' | 'port' | 'installDir' | 'sshUser' | 'sshPort' | 'sshPassword') =>
    (event: ChangeEvent<HTMLInputElement>) =>
      setForm(current => ({...current, [key]: event.target.value}));

  return (
    <Dialog open={open} onClose={onClose}>
      <Sheet
        className="device-sheet"
        bodyClassName="device-form"
        eyebrow="Ядро HomeCloud"
        title={device ? `Ядро «${device.name}»` : 'Новое ядро'}
        note="Компьютер с видеокартой. Ставится и обновляется отсюда по SSH; токены хранит только сервер."
        onClose={onClose}
        onSubmit={() => save.mutate()}
      >
        <label>
          ID устройства
          <input required pattern="[a-z0-9][a-z0-9_-]{1,31}" placeholder="pc-a"
            readOnly={Boolean(device)} value={form.id} onChange={field('id')} />
        </label>
        <label>
          Название
          <input required placeholder="PC-A" value={form.name} onChange={field('name')} />
        </label>
        <label>
          Адрес в домашней сети
          <input required placeholder="192.168.1.20" value={form.host} onChange={field('host')} />
        </label>
        <label>
          Порт ядра
          <input type="number" min={1} max={65535} value={form.port} onChange={field('port')} />
        </label>
        <label>
          Папка ядра на устройстве
          <input placeholder="C:\HomeCloud\core" value={form.installDir} onChange={field('installDir')} />
        </label>
        <div className="toggle-row">
          <ToggleChip
            checked={form.primary}
            title="Основное ядро берёт задания, для которых не выбрано другое: группировку, подборки, поиск"
            onChange={primary => setForm(current => ({...current, primary}))}
          >
            Основное ядро
          </ToggleChip>
          <ToggleChip
            checked={form.sshEnabled}
            title="По SSH сервер ставит и обновляет ядро и запускает его, если оно не отвечает"
            onChange={sshEnabled => setForm(current => ({...current, sshEnabled}))}
          >
            Доступ по SSH
          </ToggleChip>
        </div>
        {form.sshEnabled && (
          <>
            <label>
              Пользователь Windows
              <input required={!device?.ssh} placeholder="amagomedsharipov"
                value={form.sshUser} onChange={field('sshUser')} />
            </label>
            <label>
              Порт SSH
              <input type="number" min={1} max={65535} value={form.sshPort} onChange={field('sshPort')} />
            </label>
            <label>
              Пароль
              <input type="password" autoComplete="new-password"
                placeholder={device?.ssh?.hasPassword ? 'Оставьте пустым, чтобы не менять' : 'если ключ сервера не добавлен'}
                value={form.sshPassword} onChange={field('sshPassword')} />
            </label>
            <HintLine>
              На устройстве нужен включённый OpenSSH Server. Вместо пароля можно добавить ключ сервера в
              {' '}<code>authorized_keys</code> (для администраторов — <code>C:\ProgramData\ssh\administrators_authorized_keys</code>).
            </HintLine>
            {publicKey && (
              <div className="core-key">
                <code title={publicKey}>{publicKey}</code>
                <Button small onClick={() => { void copyText(publicKey).then(() => toast('Ключ скопирован')); }}>
                  Скопировать ключ
                </Button>
              </div>
            )}
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
