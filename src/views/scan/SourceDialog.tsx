import {useEffect, useState, type ChangeEvent} from 'react';
import {useMutation} from '@tanstack/react-query';
import {
  saveSource, testSource, type Source, type SourcePayload, type SourceType,
} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {ToggleChip} from '../../ui/Chip/Chip';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {HintLine} from '../../ui/Hint/Hint';

const TYPE_TITLES: Record<SourceType, string> = {
  device: 'Диск устройства с ядром',
  smb: 'Сетевая папка (SMB)',
  sftp: 'SSH / SFTP',
  ftp: 'FTP',
  webdav: 'WebDAV',
  local: 'Папка на сервере HomeCloud',
};

const DEFAULT_PORTS: Partial<Record<SourceType, string>> = {
  smb: '445', sftp: '22', ftp: '21', webdav: '443',
};

const TYPE_NOTES: Record<SourceType, string> = {
  device: 'Снимки на дисках компьютера, где стоит ядро. Ядро читает их напрямую, сервер — через '
    + 'ядро или по SSH этого устройства.',
  smb: 'Общая папка Windows, NAS или флешка в роутере. Нужны адрес, имя шары и учётная запись.',
  sftp: 'Любой сервер с SSH: файлы читаются по SFTP. Пароль или ключ сервера HomeCloud.',
  ftp: 'FTP-сервер. Включите FTPS, если сервер его поддерживает.',
  webdav: 'Nextcloud, Яндекс Диск, NAS с WebDAV. Путь — папка на сервере.',
  local: 'Папка, смонтированная прямо на сервере HomeCloud.',
};

type Form = {
  id: string; name: string; type: SourceType; host: string; port: string; user: string;
  password: string; share: string; path: string; device: string; secure: boolean; roots: string;
};

const emptyForm: Form = {
  id: '', name: '', type: 'smb', host: '', port: '', user: '', password: '', share: '', path: '',
  device: '', secure: false, roots: '',
};

/** Id из имени: латиница, цифры и дефис — он станет частью ключей снимков. */
const slug = (name: string) => {
  const table: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
    л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
    ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya',
  };
  const text = name.toLowerCase().split('').map(ch => table[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return text.length >= 2 ? text : '';
};

export interface SourceDialogProps {
  open: boolean;
  /** null — новый источник. */
  source: Source | null;
  devices: Array<{id: string; name: string}>;
  types?: Record<string, string>;
  onClose(): void;
}

export function SourceDialog({open, source, devices, onClose}: SourceDialogProps) {
  const toast = useStore(state => state.toast);
  const [form, setForm] = useState<Form>(emptyForm);
  const [idTouched, setIdTouched] = useState(false);
  const [tested, setTested] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setTested('');
    setIdTouched(Boolean(source));
    setForm(source
      ? {
        id: source.id, name: source.name, type: source.type, host: source.host,
        port: source.port ? String(source.port) : '', user: source.user, password: '',
        share: source.share, path: source.path, device: source.device, secure: source.secure,
        roots: source.roots.join('\n'),
      }
      : {...emptyForm, device: devices[0]?.id ?? ''});
  }, [open, source, devices]);

  const payload = (): SourcePayload => ({
    id: form.id.trim(), name: form.name.trim(), type: form.type,
    host: form.host.trim(), port: form.port.trim(), user: form.user.trim(),
    password: form.password, share: form.share.trim(), path: form.path.trim(),
    device: form.device, secure: form.secure,
    roots: form.roots.split('\n').map(line => line.trim()).filter(Boolean),
  });

  const save = useMutation({
    mutationFn: () => saveSource(payload()),
    onSuccess: async () => {
      onClose();
      await queryClient.invalidateQueries({queryKey: qk.sources()});
      toast('Источник сохранён');
    },
  });

  const test = useMutation({
    mutationFn: () => testSource(payload()),
    onSuccess: result => setTested(result.roots.length
      ? `Подключение есть. Видно: ${result.roots.slice(0, 8).join(', ')}`
      : 'Подключение есть'),
    onError: (error: Error) => setTested(`Не подключается: ${error.message}`),
  });

  const field = (key: keyof Form) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setForm(current => {
      const next = {...current, [key]: value};
      if (key === 'name' && !idTouched) next.id = slug(value);
      return next;
    });
  };

  const network = form.type !== 'device' && form.type !== 'local';
  const credentials = network;
  const withPath = form.type === 'sftp' || form.type === 'ftp' || form.type === 'webdav'
    || form.type === 'local';

  return (
    <Dialog open={open} onClose={onClose}>
      <Sheet
        className="device-sheet"
        bodyClassName="device-form"
        eyebrow="Источник фотографий"
        title={source ? `Источник «${source.name}»` : 'Новый источник'}
        note="Пароли хранятся только на сервере HomeCloud и в браузер не возвращаются."
        onClose={onClose}
        onSubmit={() => save.mutate()}
      >
        <label>
          Тип
          <select value={form.type} disabled={Boolean(source)} onChange={field('type')}>
            {(Object.keys(TYPE_TITLES) as SourceType[]).map(type => (
              <option key={type} value={type}>{TYPE_TITLES[type]}</option>
            ))}
          </select>
        </label>
        <HintLine>{TYPE_NOTES[form.type]}</HintLine>
        <label>
          Название
          <input required placeholder="Netcraze" value={form.name} onChange={field('name')} />
        </label>
        <label>
          ID источника
          {/* Id входит в ключ каждого снимка: у сохранённого источника его не меняют. */}
          <input required pattern="[a-z0-9][a-z0-9_-]{1,31}" placeholder="netcraze"
            readOnly={Boolean(source)} value={form.id}
            onChange={event => { setIdTouched(true); field('id')(event); }} />
        </label>

        {form.type === 'device' && (
          <label>
            Устройство
            <select required value={form.device} onChange={field('device')}>
              {devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}
            </select>
          </label>
        )}

        {network && (
          <>
            <label>
              Адрес сервера
              <input required placeholder="192.168.1.219" value={form.host} onChange={field('host')} />
            </label>
            <label>
              Порт
              <input type="number" min={1} max={65535} placeholder={DEFAULT_PORTS[form.type]}
                value={form.port} onChange={field('port')} />
            </label>
          </>
        )}
        {form.type === 'smb' && (
          <label>
            Шара
            <input placeholder="HDD — пусто, чтобы выбирать из всех" value={form.share}
              onChange={field('share')} />
          </label>
        )}
        {withPath && (
          <label>
            Папка
            <input required={form.type === 'local'} placeholder="/photos"
              value={form.path} onChange={field('path')} />
          </label>
        )}
        {credentials && (
          <>
            <label>
              Пользователь
              <input autoComplete="off" value={form.user} onChange={field('user')} />
            </label>
            <label>
              Пароль
              <input type="password" autoComplete="new-password"
                placeholder={source?.hasPassword ? 'Оставьте пустым, чтобы не менять' : ''}
                value={form.password} onChange={field('password')} />
            </label>
          </>
        )}
        {(form.type === 'ftp' || form.type === 'webdav') && (
          <div className="toggle-row">
            <ToggleChip checked={form.secure} onChange={secure => setForm(current => ({...current, secure}))}>
              {form.type === 'ftp' ? 'FTPS (шифрование)' : 'HTTPS'}
            </ToggleChip>
          </div>
        )}
        <label>
          Папки для сканирования
          <textarea rows={2} placeholder={'по одной в строке, например netcraze:/HDD/photo'}
            value={form.roots} onChange={field('roots')} />
        </label>
        <HintLine>Их можно не заполнять — папки выбираются и в окне задания.</HintLine>

        {tested && <p className={tested.startsWith('Не') ? 'device-error' : 'source-tested'}>{tested}</p>}
        <div className="form-actions">
          <Button disabled={test.isPending} onClick={() => test.mutate()}>
            {test.isPending ? 'Проверяю…' : 'Проверить подключение'}
          </Button>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" type="submit" disabled={save.isPending}>Сохранить</Button>
        </div>
      </Sheet>
    </Dialog>
  );
}
