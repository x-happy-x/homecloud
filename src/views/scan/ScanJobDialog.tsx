import {useState} from 'react';
import {keepPreviousData, useMutation, useQuery} from '@tanstack/react-query';
import {FeaturePicker} from '../../components/features/FeaturePicker';
import {formatNumber, plural} from '../../lib/format';
import {
  browseSource, startJob, startParallel, type Device, type Source,
} from '../../services/endpoints/backends';
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
import {insidePath} from '../../lib/sources';
import {useInventory} from './useInventory';

/**
 * Окно задания: источник, папки в нём и ядро, которое будет считать. Опись
 * живёт на уровне окна, а не формы: если закрыть окно посреди сбора
 * списка, итог всё равно придёт уведомлением.
 */
export function ScanJobDialog({devices, sources}: {devices: Device[] | undefined; sources: Source[]}) {
  const deviceId = useStore(state => state.scan.deviceId);
  const closeScan = useStore(state => state.closeScan);
  const inventory = useInventory(devices);
  const device = devices?.find(item => item.id === deviceId) ?? null;

  return (
    <Dialog open={deviceId !== null} onClose={closeScan}>
      {device && (
        <ScanJobForm device={device} devices={devices ?? []} sources={sources}
          inventory={inventory} onClose={closeScan} />
      )}
    </Dialog>
  );
}

interface ScanJobFormProps {
  device: Device;
  devices: Device[];
  sources: Source[];
  inventory: ReturnType<typeof useInventory>;
  onClose(): void;
}

function ScanJobForm({device, devices, sources, inventory, onClose}: ScanJobFormProps) {
  const roots = useStore(state => state.selection.roots);
  const select = useStore(state => state.select);
  const selectedPaths = useStore(state => state.scan.selectedPaths);
  const features = useStore(state => state.scan.features);
  const setFeatures = useStore(state => state.setFeatures);
  const force = useStore(state => state.scan.force);
  const setForce = useStore(state => state.setScanForce);
  const visualModel = useStore(state => state.scan.visualModel);
  const sourceId = useStore(state => state.scan.sourceId);
  const setScanSource = useStore(state => state.setScanSource);
  const setScanCore = useStore(state => state.setScanCore);
  const toast = useStore(state => state.toast);

  const capabilities = device.device?.capabilities ?? {};
  const source = sources.find(item => item.id === sourceId) ?? null;
  const cores = devices.filter(item => item.online && !item.legacy);
  const [parallel, setParallel] = useState(false);
  // Делить можно папки: отдельные файлы из списка идут одному ядру.
  const canSplit = cores.length > 1 && roots.size > 0 && !selectedPaths.length;
  const split = parallel && canSplit;

  const submit = useMutation({
    mutationFn: async () => {
      const job = {
        features: features.photos,
        video_features: features.videos,
        force,
        visual_model: visualModel,
      };
      if (split) return startParallel({roots: [...roots], ...job});
      return startJob(device.id, {roots: [...roots], paths: selectedPaths, ...job});
    },
    onSuccess: async () => {
      onClose();
      await queryClient.invalidateQueries({queryKey: qk.devices()});
      await queryClient.invalidateQueries({queryKey: qk.parallel()});
      toast(split ? 'Задание разделено между ядрами — ход виден над карточками ядер'
        : `Задание запущено на ${device.name}`);
    },
  });

  const onSubmit = () => {
    if (!roots.size && !selectedPaths.length) {
      toast('Выберите папку источника или источник из прошлого запуска');
      return;
    }
    if (!anyFeature(features)) {
      toast('Выберите хотя бы один этап — для снимков или для роликов');
      return;
    }
    submit.mutate();
  };

  const addRoot = (path: string) => select('roots', [...roots, path]);
  const count = roots.size + (selectedPaths.length ? 1 : 0);
  const stages = new Set((['photos', 'videos'] as const)
    .flatMap(kind => Object.entries(features[kind]).filter(([, on]) => on).map(([key]) => key))).size;
  const summary = [
    count ? `${formatNumber(count)} ${plural(count, 'папка', 'папки', 'папок')}` : 'Нет папок',
    stages ? `${formatNumber(stages)} ${plural(stages, 'этап', 'этапа', 'этапов')}` : 'нет этапов',
  ].join(' · ');

  return (
    <Sheet
      className="scan-device-sheet"
      bodyClassName="scan-device-body"
      eyebrow="Новое задание"
      title={`Сканирование${source ? ` · ${source.name}` : ''}`}
      note="Откуда брать файлы, при желании — проверить список, и что с ними делать. Превью для галереи обновляются при каждом обходе."
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <section className="scan-step">
        <StepHead number={1} title="Откуда брать файлы" note="Источник и папки в нём" />
        <div className="source-picker">
          {sources.map(item => (
            <button key={item.id} type="button"
              className={`root-chip${item.id === sourceId ? ' active' : ''}`}
              onClick={() => setScanSource(item.id)}>
              <Icon name={item.type === 'device' ? 'drive' : 'folder'} size={14} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        <ScanHistory />
        {source
          ? <BrowsePanel source={source} onAdd={addRoot} />
          : <HintLine>Выберите источник — появятся его папки.</HintLine>}
        <SelectedRoots />
        <div className="collect-row">
          <label className="core-picker">
            Считает
            <select value={device.id} onChange={event => setScanCore(event.target.value)}>
              {cores.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <Button disabled={inventory.busy} onClick={() => inventory.collect(device.id, [...roots])}>
            Собрать список файлов
          </Button>
        </div>
      </section>

      <section className="scan-step tree-section">
        <StepHead number={2} title="Проверить список" note="Необязательно: исключите лишние папки" />
        <FileTree
          busy={inventory.busy}
          onCollect={paths => inventory.collect(device.id, paths)}
        />
      </section>

      <section className="scan-step">
        <StepHead number={3} title="Что делать" note="Этапы для снимков и роликов" />
        <FeaturePicker value={features} onChange={setFeatures} capabilities={capabilities} />
        <div className="toggle-row">
          <ToggleChip checked={force} onChange={setForce}>Переделать заново, даже если уже посчитано</ToggleChip>
          {canSplit && (
            <ToggleChip checked={parallel} onChange={setParallel}>
              Параллельно на всех подходящих ядрах
            </ToggleChip>
          )}
        </div>
        <HintLine>
          Пока переключатель выключен, повторный запуск считает только новые файлы и те, что изменились с прошлого раза.
        </HintLine>
        {split && (
          <HintLine>
            Опись сделает ядро, где лежит источник, потом файлы поделятся между всеми свободными ядрами,
            которые умеют выбранные этапы; подборки соберутся один раз в конце.
          </HintLine>
        )}
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

function BrowsePanel({source, onAdd}: {source: Source; onAdd(path: string): void}) {
  const path = useStore(state => state.scan.browsePath);
  const setBrowsePath = useStore(state => state.setBrowsePath);

  const browse = useQuery({
    queryKey: qk.browse(source.id, path),
    queryFn: () => browseSource(source.id, path),
    // Недоступная папка не должна стирать уже показанный список.
    placeholderData: keepPreviousData,
    retry: false,
  });
  const data = browse.data?.source === source.id ? browse.data : undefined;
  const entries = data?.directories ?? [];

  return (
    <>
      <div className="path-toolbar">
        <Button small disabled={!data || data.parent === null} onClick={() => setBrowsePath(data?.parent ?? '')}>
          <Icon name="chevronLeft" size={16} />
          <span>Выше</span>
        </Button>
        <code>{data?.path ? insidePath(data.path) : source.name}</code>
        <Button small disabled={!data?.path} onClick={() => data?.path && onAdd(data.path)}>
          <Icon name="plus" size={16} />
          <span>Эту папку</span>
        </Button>
      </div>
      <div className="folder-list">
        {browse.isError
          ? <div className="folder-empty">Источник не открылся: {(browse.error as Error).message}</div>
          : !data
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
            : <div className="folder-empty">
                {data.media ? `Вложенных папок нет, снимков и роликов здесь: ${formatNumber(data.media)}` : 'Нет доступных папок'}
              </div>}
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
