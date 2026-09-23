import {useQuery} from '@tanstack/react-query';
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
import {SourceSummary} from './SourceSummary';

export interface ScanViewProps {
  /** Ядра из общего опроса; undefined — ещё не загружены. */
  devices: Device[] | undefined;
}

/**
 * «Сканирование» — только работа: что считается сейчас, что есть по
 * источникам, недавние задания и запуск нового. Подключение источников и
 * ядер, установка и модели — в «Настройки → Источники / Ядра».
 */
export function ScanView({devices}: ScanViewProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const openScan = useStore(state => state.openScan);
  const openSettings = useStore(state => state.openSettings);
  const toast = useStore(state => state.toast);
  const list = devices ?? [];

  const sources = useQuery({queryKey: qk.sources(), queryFn: getSources, refetchInterval: 15_000});
  const sourceList = sources.data?.sources ?? [];
  const busy = list.filter(device => device.job?.active).length;

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
          <h3 id="scan-now">Сейчас</h3>
          <span>{busy ? `считают ${formatNumber(busy)} из ${formatNumber(list.length)}` : 'ядра свободны'}</span>
        </div>
        <ParallelStatus />
        {list.length > 0
          ? (
            <div className="activity-grid">
              {list.map(device => (
                <CoreActivity key={device.id} device={device} onScan={item => scanWith(item, null)} />
              ))}
            </div>
          )
          : devices && (
            <EmptyState mark="⌁" title="Нет ядер">
              Подключите компьютер с видеокартой в «Настройки → Ядра».
            </EmptyState>
          )}
      </section>

      <section className="scan-block" aria-labelledby="scan-sources">
        <div className="scan-block-head">
          <h3 id="scan-sources">Источники</h3>
          <span>что уже посчитано по каждому</span>
        </div>
        {sourceList.length > 0
          ? <SourceSummary sources={sourceList} devices={list} onScan={item => scanWith(pickCore(list, item), item)} />
          : sources.data && (
            <EmptyState mark="⌁" title="Нет источников">
              Добавьте диск компьютера или сетевую папку в «Настройки → Источники».
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
