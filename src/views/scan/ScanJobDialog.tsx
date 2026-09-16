import {keepPreviousData, useMutation, useQuery} from '@tanstack/react-query';
import {FeaturePicker} from '../../components/features/FeaturePicker';
import {formatNumber, plural} from '../../lib/format';
import {browseDevice, startJob, type Device} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {anyFeature} from '../../store/slices/scan';
import {Button} from '../../ui/Button/Button';
import {ToggleChip} from '../../ui/Chip/Chip';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {HintLine} from '../../ui/Hint/Hint';
import {Icon} from '../../ui/Icon/Icon';
import {IconButton} from '../../ui/IconButton/IconButton';
import {FileTree} from './FileTree';
import {ScanHistory} from './ScanHistory';
import {useInventory} from './useInventory';

/**
 * Окно задания на устройстве. Опись живёт на уровне окна, а не формы: если
 * закрыть окно посреди сбора списка, итог всё равно придёт уведомлением.
 */
export function ScanJobDialog({devices}: {devices: Device[] | undefined}) {
  const deviceId = useStore(state => state.scan.deviceId);
  const closeScan = useStore(state => state.closeScan);
  const inventory = useInventory(devices);
  const device = devices?.find(item => item.id === deviceId) ?? null;

  return (
    <Dialog open={deviceId !== null} onClose={closeScan}>
      {device && <ScanJobForm device={device} inventory={inventory} onClose={closeScan} />}
    </Dialog>
  );
}

interface ScanJobFormProps {
  device: Device;
  inventory: ReturnType<typeof useInventory>;
  onClose(): void;
}

function ScanJobForm({device, inventory, onClose}: ScanJobFormProps) {
  const roots = useStore(state => state.selection.roots);
  const select = useStore(state => state.select);
  const selectedPaths = useStore(state => state.scan.selectedPaths);
  const features = useStore(state => state.scan.features);
  const setFeatures = useStore(state => state.setFeatures);
  const force = useStore(state => state.scan.force);
  const setForce = useStore(state => state.setScanForce);
  const visualModel = useStore(state => state.scan.visualModel);
  const toast = useStore(state => state.toast);

  const capabilities = device.device?.capabilities ?? {};

  const submit = useMutation({
    mutationFn: () => startJob(device.id, {
      roots: [...roots],
      paths: selectedPaths,
      features: features.photos,
      video_features: features.videos,
      force,
      visual_model: visualModel,
    }),
    onSuccess: async () => {
      onClose();
      await queryClient.invalidateQueries({queryKey: qk.devices()});
      toast('Задание запущено на устройстве');
    },
  });

  const onSubmit = () => {
    if (!roots.size && !selectedPaths.length) {
      toast('Выберите диск, папку или источник из прошлого запуска');
      return;
    }
    if (!anyFeature(features)) {
      toast('Выберите хотя бы один этап — для снимков или для роликов');
      return;
    }
    submit.mutate();
  };

  const addRoot = (path: string) => select('roots', [...roots, path]);
  const sources = roots.size + (selectedPaths.length ? 1 : 0);
  const stages = new Set((['photos', 'videos'] as const)
    .flatMap(kind => Object.entries(features[kind]).filter(([, on]) => on).map(([key]) => key))).size;
  const summary = [
    sources ? `${formatNumber(sources)} ${plural(sources, 'источник', 'источника', 'источников')}` : 'Нет источников',
    stages ? `${formatNumber(stages)} ${plural(stages, 'этап', 'этапа', 'этапов')}` : 'нет этапов',
  ].join(' · ');

  return (
    <Sheet
      className="scan-device-sheet"
      bodyClassName="scan-device-body"
      eyebrow="Новое задание"
      title={`Сканирование · ${device.name}`}
      note="Три шага: откуда брать файлы, при желании — проверить список, и что с ними делать."
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <section className="scan-step">
        <StepHead number={1} title="Откуда брать файлы" note="Диски и папки на устройстве" />
        <ScanHistory deviceId={device.id} />
        <BrowsePanel deviceId={device.id} onAdd={addRoot} />
        <SelectedRoots />
        <div className="collect-row">
          <Button disabled={inventory.busy} onClick={() => inventory.collect(device.id, [...roots])}>
            Собрать список файлов
          </Button>
        </div>
      </section>

      <section className="scan-step tree-section">
        <StepHead number={2} title="Проверить список" note="Необязательно: исключите лишние папки" />
        <FileTree
          deviceId={device.id}
          busy={inventory.busy}
          onCollect={paths => inventory.collect(device.id, paths)}
        />
      </section>

      <section className="scan-step">
        <StepHead number={3} title="Что делать" note="Этапы для снимков и роликов" />
        <FeaturePicker value={features} onChange={setFeatures} capabilities={capabilities} />
        <div className="toggle-row">
          <ToggleChip checked={force} onChange={setForce}>Переделать заново, даже если уже посчитано</ToggleChip>
        </div>
        <HintLine>
          Пока переключатель выключен, повторный запуск считает только новые файлы и те, что изменились с прошлого раза.
        </HintLine>
      </section>

      <div className="form-actions scan-submit">
        <span className="scan-summary">{summary}</span>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" type="submit" disabled={submit.isPending}>Запустить</Button>
      </div>
    </Sheet>
  );
}

function StepHead({number, title, note}: {number: number; title: string; note: string}) {
  return (
    <div className="scan-step-head">
      <span className="scan-step-number">{number}</span>
      <div>
        <strong>{title}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

function BrowsePanel({deviceId, onAdd}: {deviceId: string; onAdd(path: string): void}) {
  const path = useStore(state => state.scan.browsePath);
  const setBrowsePath = useStore(state => state.setBrowsePath);

  const browse = useQuery({
    queryKey: qk.browse(deviceId, path),
    queryFn: () => browseDevice(deviceId, path),
    // Недоступная папка не должна стирать уже показанный список.
    placeholderData: keepPreviousData,
  });
  const data = browse.data;
  const entries = data?.directories ?? [];

  return (
    <>
      <div className="path-toolbar">
        <Button small disabled={!data || data.parent === null} onClick={() => setBrowsePath(data?.parent ?? '')}>
          <Icon name="chevronLeft" size={16} />
          <span>Выше</span>
        </Button>
        <code>{data?.path || 'Диски'}</code>
        <Button small disabled={!data?.path} onClick={() => data?.path && onAdd(data.path)}>
          <Icon name="plus" size={16} />
          <span>Эту папку</span>
        </Button>
      </div>
      <div className="folder-list">
        {!data
          ? <div className="folder-empty">Загрузка…</div>
          : entries.length
            ? entries.map(entry => (
                <div key={entry.path} className="folder-row">
                  <button type="button" className="folder-open" onClick={() => setBrowsePath(entry.path)}>
                    <Icon name={data.path ? 'folder' : 'drive'} size={18} />
                    <span>{entry.name || entry.path}</span>
                    <Icon name="chevronRight" size={16} className="folder-go" />
                  </button>
                  <IconButton icon="plus" label="Добавить в задание" onClick={() => onAdd(entry.path)} />
                </div>
              ))
            : <div className="folder-empty">Нет доступных папок</div>}
      </div>
    </>
  );
}

function SelectedRoots() {
  const roots = useStore(state => state.selection.roots);
  const toggle = useStore(state => state.toggle);
  const selectedPaths = useStore(state => state.scan.selectedPaths);
  const setSelectedPaths = useStore(state => state.setSelectedPaths);
  const count = selectedPaths.length;

  return (
    <div className="selected-roots">
      {[...roots].map(path => (
        <button key={path} type="button" className="root-chip" title={`Убрать ${path}`} onClick={() => toggle('roots', path)}>
          <Icon name="folder" size={14} />
          <span className="root-chip-path">{path}</span>
          <Icon name="close" size={14} />
        </button>
      ))}
      {count > 0 && (
        <button type="button" className="root-chip" onClick={() => setSelectedPaths([])}>
          {formatNumber(count)}{' '}
          {plural(count, 'выбранная фотография', 'выбранные фотографии', 'выбранных фотографий')}
          <Icon name="close" size={14} />
        </button>
      )}
      {!roots.size && !count && (
        <small>Пока ничего не выбрано — добавьте папку из списка выше или возьмите прошлый источник.</small>
      )}
    </div>
  );
}
