import {useLayoutEffect, useRef, useState} from 'react';
import {formatNumber} from '../../lib/format';
import {planJob} from '../../lib/scanPlan';
import {sourceAddress} from '../../lib/sources';
import type {Device, Source} from '../../services/endpoints/backends';
import {Icon} from '../../ui/Icon/Icon';
import {isWorking, linkPath, mapLinks, nodeKey, sourceReachable, workersOf, type MapNode} from './mapModel';

export interface ScanMapProps {
  sources: Source[];
  devices: Device[];
  selected: MapNode;
  onSelect(node: MapNode): void;
}

interface DrawnLink {
  key: string;
  d: string;
  state: string;
}

/**
 * Вся связка на одной схеме: источники слева, хаб с общим каталогом в
 * середине, ядра справа. Линия, по которой идёт задание, бежит; недоступное
 * — пунктиром. На телефоне колонки встают друг под другом.
 */
export function ScanMap({sources, devices, selected, onSelect}: ScanMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<{links: DrawnLink[]; width: number; height: number}>(
    {links: [], width: 0, height: 0});
  const links = mapLinks(sources, devices);
  const signature = links.map(link => `${link.from}>${link.to}:${link.state}`).join('|');
  const chosen = nodeKey(selected);

  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const draw = () => {
      const origin = node.getBoundingClientRect();
      const rect = (key: string) => {
        const element = node.querySelector<HTMLElement>(`[data-node="${key}"]`);
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return {left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left,
          bottom: r.bottom - origin.top};
      };
      const next: DrawnLink[] = [];
      for (const link of links) {
        const from = rect(link.from);
        const to = rect(link.to);
        if (from && to) next.push({key: `${link.from}>${link.to}`, d: linkPath(from, to), state: link.state});
      }
      setDrawn({links: next, width: origin.width, height: origin.height});
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(node);
    node.querySelectorAll('[data-node]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
    // Перерисовка — когда меняются узлы или их состояние, а не на каждый опрос.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const online = devices.filter(device => device.online && !device.legacy).length;
  const files = sources.reduce((sum, source) => sum + (source.stats.photos ?? 0) + (source.stats.videos ?? 0), 0);

  return (
    <div className="scan-map" ref={box}>
      <svg className="map-links" width={drawn.width} height={drawn.height} aria-hidden="true">
        {drawn.links.map(link => <path key={link.key} d={link.d} className={`map-link ${link.state}`} />)}
      </svg>

      <div className="map-col map-sources">
        <h4>Источники <span>{formatNumber(sources.length)}</span></h4>
        {sources.map(source => (
          <SourceNode key={source.id} source={source} devices={devices}
            active={chosen === nodeKey({kind: 'source', id: source.id})}
            onClick={() => onSelect({kind: 'source', id: source.id})} />
        ))}
      </div>

      <div className="map-col map-hub">
        <button type="button" data-node="hub" className={`map-node hub${chosen === 'hub' ? ' selected' : ''}`}
          onClick={() => onSelect({kind: 'hub'})}>
          <img src="/favicon.svg" alt="" />
          <span className="map-node-text">
            <strong>Хаб</strong>
            <small>общий каталог</small>
          </span>
          <span className="map-hub-facts">
            <span><b>{formatNumber(files)}</b> файлов</span>
            <span><b>{online}</b> из {devices.length} ядер в сети</span>
          </span>
        </button>
      </div>

      <div className="map-col map-cores">
        <h4>Ядра <span>{formatNumber(devices.length)}</span></h4>
        {devices.map(device => (
          <CoreNode key={device.id} device={device}
            active={chosen === nodeKey({kind: 'core', id: device.id})}
            onClick={() => onSelect({kind: 'core', id: device.id})} />
        ))}
      </div>
    </div>
  );
}

function SourceNode({source, devices, active, onClick}: {
  source: Source; devices: Device[]; active: boolean; onClick(): void;
}) {
  const stats = source.stats;
  const files = (stats.photos ?? 0) + (stats.videos ?? 0);
  const indexed = files > 0 ? Math.min(1, (stats.analysis ?? 0) / files) : 0;
  const workers = workersOf(source, devices);
  const reachable = sourceReachable(source, devices);
  const state = workers.length ? 'working' : reachable ? 'ok' : 'down';
  return (
    <button type="button" data-node={nodeKey({kind: 'source', id: source.id})}
      className={`map-node source ${state}${active ? ' selected' : ''}`} onClick={onClick}
      title={sourceAddress(source, devices)}>
      <span className="map-node-icon"><Icon name={source.type === 'device' ? 'drive' : 'folder'} size={18} /></span>
      <span className="map-node-text">
        <strong>{source.name}</strong>
        <small>
          {workers.length ? `считает ${workers.map(item => item.name).join(', ')}`
            : !source.enabled ? 'выключен'
            : reachable ? sourceAddress(source, devices) : 'недоступен'}
        </small>
      </span>
      <span className="map-node-meter" title={`Визуальный индекс: ${Math.floor(indexed * 100)}%`}>
        <b>{formatNumber(files)}</b>
        <span className="map-bar" aria-hidden="true"><span style={{width: `${Math.round(indexed * 100)}%`}} /></span>
      </span>
    </button>
  );
}

function CoreNode({device, active, onClick}: {device: Device; active: boolean; onClick(): void}) {
  const working = isWorking(device);
  const plan = working ? planJob(device) : null;
  const phase = plan ? plan.phases[plan.index - 1] : null;
  const installing = device.install?.status === 'running';
  const state = installing || working ? 'working' : device.online && !device.legacy ? 'ok' : 'down';
  const note = installing ? 'обновляется'
    : !device.online ? 'не в сети'
    : device.legacy ? 'не переведено на хаб'
    : working ? (device.job?.stop_requested ? 'останавливается' : phase?.title ?? 'считает')
    : 'свободно';
  const percent = plan?.fraction == null ? null : Math.floor(plan.fraction * 100);
  return (
    <button type="button" data-node={nodeKey({kind: 'core', id: device.id})}
      className={`map-node core ${state}${active ? ' selected' : ''}`} onClick={onClick}>
      <span className="map-node-icon"><Icon name="chip" size={18} /></span>
      <span className="map-node-text">
        <strong>{device.name}{device.primary && <em>основное</em>}</strong>
        <small>{note}</small>
      </span>
      {working && (
        <span className="map-node-meter">
          <b>{percent === null ? '…' : `${percent}%`}</b>
          <span className="map-bar" aria-hidden="true"><span style={{width: `${percent ?? 0}%`}} /></span>
        </span>
      )}
    </button>
  );
}
