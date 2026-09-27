import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import './ScanView.scss';
import {formatNumber} from '../../lib/format';
import {pickCore} from '../../lib/sources';
import {getSources, type Device, type ScanRun, type Source} from '../../services/endpoints/backends';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Icon} from '../../ui/Icon/Icon';
import {CoreActivity} from './CoreActivity';
import {ParallelStatus} from './ParallelStatus';
import {RecentRuns} from './RecentRuns';
import {ScanJobDialog} from './ScanJobDialog';
import {ScanMap} from './ScanMap';
import {defaultNode, isWorking, type MapNode} from './mapModel';
import {SourceSummary} from './SourceSummary';

export interface ScanViewProps {
  /** Ядра из общего опроса; undefined — ещё не загружены. */
  devices: Device[] | undefined;
}

/**
 * «Сканирование» — только работа: схема источников, хаба и ядер с идущими
 * заданиями, подробности выбранного на ней, недавние задания и запуск нового.
 * Подключение источников и ядер, установка и модели — в «Настройки →
 * Источники / Ядра».
 */
export function ScanView({devices}: ScanViewProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const openScan = useStore(state => state.openScan);
  const openSettings = useStore(state => state.openSettings);
  const toast = useStore(state => state.toast);
  const list = devices ?? [];

  const sources = useQuery({queryKey: qk.sources(), queryFn: getSources, refetchInterval: 15_000});
  const sourceList = sources.data?.sources ?? [];
  const busy = list.filter(isWorking).length;
  const [picked, setPicked] = useState<MapNode | null>(null);
  // Выбранный узел пропал (ядро или источник удалили) — показываем то, что считает.
  const exists = (node: MapNode | null): node is MapNode => Boolean(node && (node.kind === 'hub'
    || (node.kind === 'core' ? list.some(item => item.id === node.id) : sourceList.some(item => item.id === node.id))));
  const selected = exists(picked) ? picked : defaultNode(list);

  const scanWith = (device: Device | null, source: Source | null, roots?: string[]) => {
    if (!device) {
      toast('Нет включённого ядра: запустите его в «Настройки → Ядра»');
      return;
    }
    const info = device.device;
    const model = info?.visual_model || info?.visual_models.find(item => item.installed)?.id || '';
    const chosen = source ?? sourceList.find(item => item.type === 'device' && item.device === device.id)
      ?? sourceList[0] ?? null;
    openScan(device.id, info?.capabilities ?? {}, model, chosen?.id ?? '', roots ?? (source ? source.roots : []));
  };

  const repeat = (run: ScanRun) => {
    const source = sourceList.find(item => run.roots[0]?.startsWith(`${item.id}:`)) ?? null;
    scanWith(pickCore(list, source), source, run.roots);
  };

  return (
    <section className="analysis-panel scan-screen">
      <header className="scan-top">
        <div>
          <h2>Сканирование</h2>
          <p>Распознавание папок источников на ядрах: запуск, ход и что уже посчитано.</p>
        </div>
        <div className="scan-top-actions">
          <Button variant="ghost" small onClick={() => openSettings('sources')}>
            <Icon name="settings" size={16} />
            <span>Источники и ядра</span>
          </Button>
          {canEdit && (
            <Button variant="primary" onClick={() => scanWith(pickCore(list, null), null)}>
              <Icon name="plus" size={18} />
              <span>Новое задание</span>
            </Button>
          )}
        </div>
      </header>

      <section className="scan-block" aria-labelledby="scan-now">
        <div className="scan-block-head">
          <h3 id="scan-now">Схема</h3>
          <span>{busy ? `считают ${formatNumber(busy)} из ${formatNumber(list.length)}` : 'ядра свободны'}</span>
        </div>
        <ParallelStatus />
        {list.length > 0 || sourceList.length > 0
          ? (
            <>
              <ScanMap sources={sourceList} devices={list} selected={selected} onSelect={setPicked} />
              <div className="map-detail">
                <Detail node={selected} devices={list} sources={sourceList} onScanCore={item => scanWith(item, null)}
                  onScanSource={item => scanWith(pickCore(list, item), item)} />
              </div>
            </>
          )
          : devices && sources.data && (
            <EmptyState mark="⌁" title="Нет ядер и источников">
              Подключите компьютер с видеокартой в «Настройки → Ядра» и добавьте источник в «Настройки → Источники».
            </EmptyState>
          )}
      </section>

      <section className="scan-block" aria-labelledby="scan-runs">
        <div className="scan-block-head">
          <h3 id="scan-runs">Недавние запуски</h3>
          <span>повторить с теми же папками</span>
        </div>
        <RecentRuns onRepeat={repeat} />
      </section>

      <ScanJobDialog devices={devices} sources={sourceList} />
    </section>
  );
}

/** Под схемой — подробности выбранного узла: ход задания ядра или сводка источников. */
function Detail({node, devices, sources, onScanCore, onScanSource}: {
  node: MapNode; devices: Device[]; sources: Source[];
  onScanCore(device: Device): void; onScanSource(source: Source): void;
}) {
  if (node.kind === 'core') {
    const device = devices.find(item => item.id === node.id);
    return device ? <CoreActivity device={device} onScan={onScanCore} /> : null;
  }
  const shown = node.kind === 'source' ? sources.filter(item => item.id === node.id) : sources;
  if (!shown.length) return null;
  return <SourceSummary sources={shown} devices={devices} onScan={onScanSource} />;
}
