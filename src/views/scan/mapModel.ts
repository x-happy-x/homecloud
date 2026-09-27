import {sourceOf} from '../../lib/sources';
import type {Device, Source} from '../../services/endpoints/backends';

/** Узел схемы: источник, хаб или ядро. */
export type MapNode = {kind: 'hub'} | {kind: 'source'; id: string} | {kind: 'core'; id: string};

export const nodeKey = (node: MapNode) => (node.kind === 'hub' ? 'hub' : `${node.kind}:${node.id}`);

export type LinkState = 'idle' | 'active' | 'down';

export interface MapLink {
  from: string;
  to: string;
  state: LinkState;
}

/** Ядро сейчас считает: в сети, переведено на хаб и задание идёт. */
export const isWorking = (device: Device) => Boolean(device.online && !device.legacy && device.job?.active);

/** Какие ядра сейчас считают этот источник — по папкам их заданий. */
export function workersOf(source: Source, devices: Device[]): Device[] {
  return devices.filter(device => isWorking(device)
    && (device.job?.roots ?? []).some(root => sourceOf(root) === source.id));
}

/**
 * Доступен ли источник: диск компьютера — пока его ядро в сети или есть SSH,
 * остальные — по последней проверке хаба; не проверяли — считаем доступным.
 */
export function sourceReachable(source: Source, devices: Device[]): boolean {
  if (!source.enabled) return false;
  if (source.type === 'device') {
    const host = devices.find(item => item.id === source.device);
    return Boolean(host?.online || host?.ssh);
  }
  return source.health?.online ?? true;
}

/**
 * Связи схемы: каждый источник и каждое ядро связаны с хабом — каталог и
 * задания идут через него. Связь, по которой сейчас идёт задание, — active,
 * недоступный источник или ядро не в сети — down.
 */
export function mapLinks(sources: Source[], devices: Device[]): MapLink[] {
  const links: MapLink[] = sources.map(source => ({
    from: nodeKey({kind: 'source', id: source.id}),
    to: 'hub',
    state: workersOf(source, devices).length ? 'active' : sourceReachable(source, devices) ? 'idle' : 'down',
  }));
  for (const device of devices) {
    links.push({
      from: 'hub',
      to: nodeKey({kind: 'core', id: device.id}),
      state: isWorking(device) ? 'active' : device.online && !device.legacy ? 'idle' : 'down',
    });
  }
  return links;
}

/** Что показать под схемой сразу: считающее ядро, иначе основное, иначе хаб. */
export function defaultNode(devices: Device[]): MapNode {
  const device = devices.find(isWorking) ?? devices.find(item => item.primary && item.online) ?? devices[0];
  return device ? {kind: 'core', id: device.id} : {kind: 'hub'};
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Линия между узлами: в ряд — от правого края к левому плавной кривой,
 * друг под другом (телефон) — от нижнего края к верхнему.
 */
export function linkPath(from: Box, to: Box): string {
  const round = (value: number) => Math.round(value * 10) / 10;
  if (to.left >= from.right - 1) {
    const start = {x: from.right, y: (from.top + from.bottom) / 2};
    const end = {x: to.left, y: (to.top + to.bottom) / 2};
    const bend = (end.x - start.x) / 2;
    return `M${round(start.x)},${round(start.y)} C${round(start.x + bend)},${round(start.y)} `
      + `${round(end.x - bend)},${round(end.y)} ${round(end.x)},${round(end.y)}`;
  }
  const start = {x: (from.left + from.right) / 2, y: from.bottom};
  const end = {x: (to.left + to.right) / 2, y: to.top};
  const bend = (end.y - start.y) / 2;
  return `M${round(start.x)},${round(start.y)} C${round(start.x)},${round(start.y + bend)} `
    + `${round(end.x)},${round(end.y - bend)} ${round(end.x)},${round(end.y)}`;
}
