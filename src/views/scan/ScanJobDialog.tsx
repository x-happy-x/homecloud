import {keepPreviousData, useMutation, useQuery} from '@tanstack/react-query';
import {formatNumber, plural} from '../../lib/format';
import {browseDevice, startJob, type Device} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {CheckRow} from '../../ui/CheckRow/CheckRow';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {Field} from '../../ui/Field/Field';
import {HintLine} from '../../ui/Hint/Hint';
import {FeatureList} from './FeatureList';
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
  const force = useStore(state => state.scan.force);
  const setForce = useStore(state => state.setScanForce);
  const visualModel = useStore(state => state.scan.visualModel);
  const setVisualModel = useStore(state => state.setScanVisualModel);
  const toast = useStore(state => state.toast);

  const capabilities = device.device?.capabilities ?? {};
  const models = device.device?.visual_models ?? [];

  const submit = useMutation({
    mutationFn: () => startJob(device.id, {
      roots: [...roots], paths: selectedPaths, features, force, visual_model: visualModel,
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
    if (!Object.values(features).some(Boolean)) {
      toast('Выберите хотя бы одну возможность');
      return;
    }
    submit.mutate();
  };

  const addRoot = (path: string) => select('roots', [...roots, path]);

  return (
    <Sheet
      className="scan-device-sheet"
      bodyClassName="scan-device-body"
      eyebrow="Новое задание"
      title={`Сканирование · ${device.name}`}
      note="Выберите источники и этапы обработки."
      onClose={onClose}
      onSubmit={onSubmit}
    >
      <section>
        <div className="section-label">Диски и папки</div>
        <ScanHistory deviceId={device.id} />
        <BrowsePanel deviceId={device.id} onAdd={addRoot} />
        <SelectedRoots />
        <div className="collect-row">
          <Button disabled={inventory.busy} onClick={() => inventory.collect(device.id, [...roots])}>
            Собрать список файлов
          </Button>
        </div>
      </section>

      <section className="tree-section">
        <div className="section-label">Что найдено</div>
        <FileTree
          deviceId={device.id}
          busy={inventory.busy}
          onCollect={paths => inventory.collect(device.id, paths)}
        />
      </section>

      <section>
        <div className="section-label">Возможности</div>
        <FeatureList capabilities={capabilities} />
        {capabilities.visual && (
          <Field
            label="Модель визуального индекса"
            hint="Индексы моделей сохраняются отдельно; выбранная станет основной для поиска."
          >
            {id => (
              <select id={id} value={visualModel} onChange={event => setVisualModel(event.target.value)}>
                {models.map(model => (
                  <option key={model.id} value={model.id} disabled={!model.installed}>
                    {model.name} — {model.installed ? model.note : 'загружается'}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <CheckRow checked={force} onChange={setForce}>
          Переделать заново, даже если уже посчитано
        </CheckRow>
        <HintLine>
          Без этой галочки повторный запуск считает только новые файлы и те, что изменились с прошлого раза.
        </HintLine>
      </section>

      <div className="form-actions">
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" type="submit" disabled={submit.isPending}>Запустить на устройстве</Button>
      </div>
    </Sheet>
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
          ↑
        </Button>
        <code>{data?.path || 'Диски'}</code>
        <Button small disabled={!data?.path} onClick={() => data?.path && onAdd(data.path)}>
          Добавить эту папку
        </Button>
      </div>
      <div className="folder-list">
        {!data
          ? <div className="folder-empty">Загрузка…</div>
          : entries.length
            ? entries.map(entry => (
                <div key={entry.path} className="folder-row">
                  <button type="button" className="folder-open" onClick={() => setBrowsePath(entry.path)}>
                    <span>📁</span><span>{entry.name || entry.path}</span>
                  </button>
                  <Button small onClick={() => onAdd(entry.path)}>Добавить</Button>
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
        <button key={path} type="button" className="root-chip" onClick={() => toggle('roots', path)}>
          {path} <span>×</span>
        </button>
      ))}
      {count > 0 && (
        <button type="button" className="root-chip" onClick={() => setSelectedPaths([])}>
          {formatNumber(count)}{' '}
          {plural(count, 'выбранная фотография', 'выбранные фотографии', 'выбранных фотографий')}{' '}
          <span>×</span>
        </button>
      )}
      {!roots.size && !count && (
        <small>Добавьте диск, папку или возьмите источник из прошлого запуска.</small>
      )}
    </div>
  );
}
