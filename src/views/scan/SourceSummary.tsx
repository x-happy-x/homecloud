import {fileSize, formatNumber} from '../../lib/format';
import {sourceAddress} from '../../lib/sources';
import type {Device, Source} from '../../services/endpoints/backends';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';

/** Доля от целого для полоски покрытия; пустое — ноль. */
const share = (part: number | undefined, whole: number) => (whole > 0 ? Math.min(1, (part ?? 0) / whole) : 0);

function Coverage({value, whole, title}: {value: number | undefined; whole: number; title: string}) {
  const part = share(value, whole);
  return (
    <span className="coverage" title={title}>
      <b>{formatNumber(value ?? 0)}</b>
      <span className="coverage-bar" aria-hidden="true">
        <span style={{width: `${Math.round(part * 100)}%`}} />
      </span>
      <small>{whole > 0 ? `${Math.floor(part * 100)}%` : '—'}</small>
    </span>
  );
}

/**
 * Что уже есть по каждому источнику и чего не хватает: превью, визуальный
 * индекс, лица. Отсюда же — задание по источнику; подключение источников —
 * в «Настройки → Источники».
 */
export function SourceSummary({sources, devices, onScan}: {
  sources: Source[]; devices: Device[]; onScan(source: Source): void;
}) {
  const canEdit = useStore(state => state.session.canEdit);
  return (
    <div className="summary-table" role="table" aria-label="Источники">
      <div className="summary-row summary-header" role="row">
        <span role="columnheader">Источник</span>
        <span role="columnheader">Файлы</span>
        <span role="columnheader">Превью</span>
        <span role="columnheader">Индекс</span>
        <span role="columnheader">Лица</span>
        <span role="columnheader" aria-label="Действия" />
      </div>
      {sources.map(source => {
        const stats = source.stats ?? {};
        const files = (stats.photos ?? 0) + (stats.videos ?? 0);
        const host = source.type === 'device' ? devices.find(item => item.id === source.device) : null;
        const reachable = source.type !== 'device' || Boolean(host?.online || host?.ssh);
        return (
          <div key={source.id} className={`summary-row${source.enabled ? '' : ' muted'}`} role="row">
            <span className="summary-source" role="cell">
              <Icon name={source.type === 'device' ? 'drive' : 'folder'} />
              <span>
                <strong>{source.name}</strong>
                <small title={sourceAddress(source, devices)}>
                  {reachable ? sourceAddress(source, devices) : 'устройство не в сети'}
                </small>
              </span>
            </span>
            <span className="summary-files" role="cell">
              <span><b>{formatNumber(stats.photos ?? 0)}</b> фото</span>
              <small>{formatNumber(stats.videos ?? 0)} видео{stats.missing ? ` · ${formatNumber(stats.missing)} пропало` : ''}</small>
            </span>
            <span role="cell">
              <Coverage value={stats.thumbs} whole={files}
                title={`Превью для галереи${stats.thumb_bytes ? `, ${fileSize(stats.thumb_bytes)} на сервере` : ''}`} />
            </span>
            <span role="cell">
              <Coverage value={stats.analysis} whole={files} title="Визуальный индекс: смысловой поиск и тип снимка" />
            </span>
            <span className="summary-faces" role="cell" title={`С именем: ${formatNumber(stats.named_faces ?? 0)}`}>
              <b>{formatNumber(stats.faces ?? 0)}</b>
              <small>{formatNumber(stats.named_faces ?? 0)} с именем</small>
            </span>
            <span className="summary-action" role="cell">
              {canEdit && source.enabled && (
                <Button small onClick={() => onScan(source)}>
                  <Icon name="scan" size={16} />
                  <span>Сканировать</span>
                </Button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
