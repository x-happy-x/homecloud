import {confirmAction} from '../../../services/dialogs';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import {fileSize, formatNumber, runMoment} from '../../../lib/format';
import {FEATURE_INFO} from '../../../lib/jobs';
import {
  exportLegacy, getExportLegacy, installCore, mergeImport, removeCore, startCoreSsh,
  type CorePackage, type Device, type Source,
} from '../../../services/endpoints/backends';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import {Button} from '../../../ui/Button/Button';
import {Icon} from '../../../ui/Icon/Icon';
import {IconButton} from '../../../ui/IconButton/IconButton';
import {Pill} from '../../../ui/Pill/Pill';
import {Popover} from '../../../ui/Popover/Popover';
import {Progress} from '../../../ui/Progress/Progress';
import {CoreComponents} from './CoreComponents';

const GIB = 1073741824;

const INSTALL_STEPS: Record<string, string> = {
  connect: 'Подключаюсь по SSH', upload: 'Загружаю пакет ядра', install: 'Устанавливаю',
  wait: 'Жду, пока ядро ответит', start: 'Запускаю ядро', key: 'Записываю ключ хаба',
  verify: 'Проверяю вход по ключу', done: 'Готово',
};

const INSTALL_ACTIONS: Record<string, string> = {
  install: 'Установка', update: 'Обновление', start: 'Запуск', key: 'Переход на ключ',
};

export interface CoreCardProps {
  device: Device;
  sources: Source[];
  corePackage: CorePackage | null;
  onEdit(device: Device): void;
}

/**
 * Ядро в настройках: подключение и SSH, установка и обновление, перенос
 * старого каталога, диски, что умеет, окружения и модели. Задания и их ход —
 * на экране «Сканирование».
 */
export function CoreCard({device, sources, corePackage, onEdit}: CoreCardProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const refresh = () => queryClient.invalidateQueries({queryKey: qk.devices()});

  const remove = useMutation({
    mutationFn: () => removeCore(device.id),
    onSuccess: () => { toast('Ядро удалено из HomeCloud'); void refresh(); },
  });
  const sshStart = useMutation({
    mutationFn: () => startCoreSsh(device.id),
    onSuccess: () => { toast('Запускаю ядро по SSH — статус обновится через пару секунд'); void refresh(); },
  });
  const install = useMutation({
    mutationFn: (action: 'install' | 'update') => installCore(device.id, action),
    onSuccess: (_state, action) => {
      toast(action === 'install' ? 'Ставлю ядро — это надолго, ход виден на карточке'
        : 'Обновляю ядро — ход виден на карточке');
      void refresh();
    },
  });
  const trustKey = useMutation({
    mutationFn: () => installCore(device.id, 'key'),
    onSuccess: () => { toast('Ставлю ключ хаба — ход виден на карточке'); void refresh(); },
  });

  const running = Boolean(device.job?.active);
  const installing = device.install?.status === 'running';
  const version = device.version || device.device?.version || '';

  const status = installing ? `${INSTALL_ACTIONS[device.install?.action ?? ''] ?? 'Установка'}…`
    : !device.online ? 'Не в сети'
    : device.legacy ? 'Старый бэкенд'
    : running ? 'Считает задание'
    : 'В сети';
  const tone = installing || running ? 'running' : !device.online || device.legacy ? 'error' : 'default';

  const confirmInstall = async (action: 'install' | 'update') => {
    const text = action === 'install'
      ? `Поставить ядро на «${device.name}» с нуля? Сервер загрузит пакет ${corePackage?.version ?? ''}, `
        + 'создаст окружение Python и автозапуск. Это может занять больше часа.'
      : `Обновить ядро на «${device.name}» до ${corePackage?.version ?? 'текущей версии'}? `
        + 'Код заменится, служба перезапустится; идущее задание прервётся.';
    if (await confirmAction(text, {title: action === 'install' ? 'Установка ядра' : 'Обновление ядра'})) {
      install.mutate(action);
    }
  };

  const confirmKey = async () => {
    const text = `Хаб войдёт на «${device.name}» по сохранённому паролю, добавит свой ключ SSH `
      + 'в authorized_keys и проверит вход по нему. Если вход по ключу сработает, пароль '
      + 'удалится из настроек хаба; если нет — останется как был.';
    if (await confirmAction(text, {title: 'Перейти на ключ'})) {
      trustKey.mutate();
    }
  };

  return (
    <article className={`device-card${device.online ? '' : ' offline'}${running || installing ? ' running' : ''}`}>
      <header className="device-head">
        <span className="device-mark" aria-hidden="true"><Icon name="scan" /></span>
        <div className="device-id">
          <h3>{device.name}{device.primary && <span className="device-primary">основное</span>}</h3>
          <span className="device-address" title={device.url}>
            {device.url}{version && ` · ${version}`}
          </span>
        </div>
        <Pill tone={tone}>{status}</Pill>
        {canEdit && (
          <div className="device-head-actions">
            {installing
              ? <Button small disabled>Идёт {INSTALL_ACTIONS[device.install?.action ?? '']?.toLowerCase() ?? 'установка'}…</Button>
              : device.online && device.legacy && device.ssh
              ? (
                <Button variant="primary" small disabled={install.isPending} onClick={() => confirmInstall('update')}>
                  <Icon name="process" size={16} />
                  <span>Перевести на хаб</span>
                </Button>
              )
              : !device.online && device.ssh
              ? (
                <Button variant="primary" small disabled={sshStart.isPending} onClick={() => sshStart.mutate()}>
                  <Icon name="play" size={16} />
                  <span>{sshStart.isPending ? 'Запускаю…' : 'Запустить'}</span>
                </Button>
              )
              : device.outdated && corePackage && device.ssh
              ? (
                <Button variant="primary" small disabled={install.isPending} onClick={() => void confirmInstall('update')}>
                  <Icon name="process" size={16} />
                  <span>Обновить</span>
                </Button>
              )
              : null}
            <DeviceMenu
              canInstall={Boolean(device.ssh && corePackage)}
              canTrustKey={Boolean(device.ssh?.hasPassword) && !installing}
              onEdit={() => onEdit(device)}
              onTrustKey={() => void confirmKey()}
              onUpdate={() => void confirmInstall('update')}
              onInstall={() => void confirmInstall('install')}
              onRemove={async () => {
                if (await confirmAction(`Убрать ядро «${device.name}» из HomeCloud?\nНа самом устройстве ничего не удаляется.`)) {
                  remove.mutate();
                }
              }}
            />
          </div>
        )}
      </header>

      {!device.online && !installing && (
        <p className="device-error">{device.error || 'Ядро не отвечает — проверьте, включён ли компьютер.'}</p>
      )}
      {device.outdated && corePackage && !installing && (
        <div className="core-update">
          <span>Есть новая версия ядра: <b>{corePackage.version}</b></span>
          {canEdit && device.ssh && (
            <Button small disabled={install.isPending} onClick={() => void confirmInstall('update')}>Обновить</Button>
          )}
        </div>
      )}
      {!device.ssh && (device.legacy || !device.online) && (
        <p className="fact-empty">Чтобы ставить, обновлять и запускать ядро отсюда, включите доступ по SSH в «Подключении».</p>
      )}

      {device.install && <InstallProgress device={device} />}
      {device.online && device.device?.legacy && !device.legacyMerged && (
        <LegacyCatalog device={device} sources={sources} />
      )}
      {device.online && <DeviceFacts device={device} />}
    </article>
  );
}

interface DeviceMenuProps {
  canInstall: boolean;
  canTrustKey: boolean;
  onEdit(): void;
  onTrustKey(): void;
  onUpdate(): void;
  onInstall(): void;
  onRemove(): void;
}

function DeviceMenu({canInstall, canTrustKey, onEdit, onTrustKey, onUpdate, onInstall, onRemove}: DeviceMenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <span ref={anchor}>
        <IconButton icon="more" label="Ещё" aria-expanded={open} onClick={() => setOpen(value => !value)} />
      </span>
      <Popover open={open} anchor={anchor} onClose={close} className="menu">
        <button type="button" onClick={() => { close(); onEdit(); }}>
          <Icon name="settings" />Подключение
        </button>
        {canTrustKey && (
          <button type="button" onClick={() => { close(); onTrustKey(); }}>
            <Icon name="check" />Перейти на ключ
          </button>
        )}
        {canInstall && (
          <>
            <button type="button" onClick={() => { close(); onUpdate(); }}>
              <Icon name="process" />Обновить ядро
            </button>
            <button type="button" onClick={() => { close(); onInstall(); }}>
              <Icon name="layers" />Установить с нуля
            </button>
          </>
        )}
        <button type="button" className="danger" onClick={() => { close(); onRemove(); }}>
          <Icon name="trash" />Убрать ядро
        </button>
      </Popover>
    </>
  );
}

/** Ход установки, обновления или запуска по SSH: шаг и хвост журнала. */
function InstallProgress({device}: {device: Device}) {
  const state = device.install!;
  const [open, setOpen] = useState(false);
  const failed = state.status === 'error';
  const done = state.status === 'completed';
  // Удачное действие — уже не новость: запуск через минуту, остальное через десять.
  const stale = state.action === 'start' ? 60 : 600;
  if (done && state.finished_at && Date.now() / 1000 - state.finished_at > stale) {
    return null;
  }
  const lines = open ? state.log : state.log.slice(-4);
  return (
    <section className={`device-run last${failed ? ' status-error' : done ? ' status-completed' : ''}`}>
      <div className="run-summary">
        <div className="run-summary-text">
          <span className="run-eyebrow">{INSTALL_ACTIONS[state.action] ?? state.action} ядра</span>
          <strong>{failed ? 'Ошибка' : done ? 'Готово' : INSTALL_STEPS[state.step] ?? state.step}</strong>
          {state.finished_at && <span className="run-meta">{runMoment(state.finished_at * 1000)}</span>}
        </div>
      </div>
      {state.status === 'running' && <Progress value={null} />}
      {failed && state.error && <p className="device-error">{state.error}</p>}
      {lines.length > 0 && (
        <pre className="install-log" onClick={() => setOpen(value => !value)}>{lines.join('\n')}</pre>
      )}
    </section>
  );
}

/**
 * Старый каталог устройства: до хаба ядро держало свой. Его переносят в
 * общий — лица, имена и анализ остаются, пути становятся ключами источника.
 */
function LegacyCatalog({device, sources}: {device: Device; sources: Source[]}) {
  const toast = useStore(state => state.toast);
  const canEdit = useStore(state => state.session.canEdit);
  const legacy = device.device!.legacy!;
  const target = sources.find(source => source.type === 'device' && source.device === device.id);
  const [running, setRunning] = useState(false);

  const status = useQuery({
    queryKey: ['export-legacy', device.id],
    queryFn: () => getExportLegacy(device.id),
    enabled: running,
    refetchInterval: 2000,
  });
  const merge = useMutation({
    mutationFn: ({catalog, thumbnails}: {catalog: string; thumbnails?: string}) =>
      mergeImport(catalog, thumbnails, target!.id),
    onSuccess: () => toast('Каталог переносится в общий — через несколько минут он появится в галерее'),
    onError: (error: Error) => toast(`Перенос не удался: ${error.message}`),
  });
  const start = useMutation({
    mutationFn: () => exportLegacy(device.id),
    onSuccess: () => { setRunning(true); toast('Отправляю старый каталог на сервер…'); },
  });

  const state = status.data;
  useEffect(() => {
    if (!running || !state) return;
    if (state.status === 'completed' && state.catalog) {
      setRunning(false);
      merge.mutate({catalog: state.catalog, thumbnails: state.thumbnails});
    } else if (state.status === 'error') {
      setRunning(false);
      toast(`Не удалось отправить каталог: ${state.error}`);
    }
  }, [running, state, merge, toast]);

  return (
    <div className="core-update legacy">
      <span>
        На устройстве старый каталог: {formatNumber(legacy.photos ?? 0)} фото,
        {' '}{formatNumber(legacy.faces ?? 0)} лиц, {formatNumber(legacy.people ?? 0)} людей
        {' '}({fileSize(legacy.bytes)}).
        {!target && ' Сначала заведите источник «Диск устройства» для него.'}
        {running && state?.step && ` Шаг: ${state.step}…`}
      </span>
      {canEdit && target && (
        <Button small disabled={running || start.isPending || merge.isPending}
          onClick={async () => {
            if (await confirmAction(
              `Перенести каталог «${device.name}» в общий? Имена, лица и анализ останутся, `
              + `снимки станут снимками источника «${target.name}».`,
              {title: 'Перенос каталога'})) start.mutate();
          }}>
          {running || merge.isPending ? 'Переношу…' : 'Перенести в общий'}
        </Button>
      )}
    </div>
  );
}

function DeviceFacts({device}: {device: Device}) {
  const info = device.device;
  const capabilities = info?.capabilities ?? {};
  const drives = info?.drives ?? [];
  const available = Object.entries(FEATURE_INFO).filter(([key]) => capabilities[key]);
  const missing = Object.entries(FEATURE_INFO).filter(([key]) => !capabilities[key]);
  const [components, setComponents] = useState(false);
  const isCore = !device.legacy;

  return (
    <>
      <div className="device-facts">
        <section className="fact-block">
          <h4>Диски</h4>
          {drives.length
            ? (
              <ul className="drive-list">
                {drives.map(drive => {
                  const used = drive.total && drive.free != null ? 1 - drive.free / drive.total : null;
                  return (
                    <li key={drive.path} title={drive.path}>
                      <Icon name="drive" size={16} />
                      <span className="drive-name">{drive.name || drive.path}</span>
                      <span className="drive-free">
                        {drive.free == null ? '—' : `${formatNumber(Math.round(drive.free / GIB))} ГБ свободно`}
                      </span>
                      {used !== null && <Progress value={used} className={`drive-bar${used > .9 ? ' full' : ''}`} />}
                    </li>
                  );
                })}
              </ul>
            )
            : <p className="fact-empty">Диски не найдены</p>}
        </section>

        <section className="fact-block">
          <h4>Что умеет</h4>
          <div className="capability-list">
            {available.map(([key, [title, note]]) => (
              <span key={key} className="feature-badge" title={note}><Icon name="check" size={13} />{title}</span>
            ))}
          </div>
          {missing.length > 0 && (
            <p className="fact-empty">Не установлено: {missing.map(([, [title]]) => title).join(', ')}</p>
          )}
          {isCore && (
            <Button small aria-expanded={components} onClick={() => setComponents(value => !value)}>
              <Icon name="layers" size={16} />
              <span>{components ? 'Скрыть окружения и модели' : 'Окружения и модели'}</span>
            </Button>
          )}
        </section>
      </div>
      {isCore && components && <CoreComponents device={device} />}
    </>
  );
}
