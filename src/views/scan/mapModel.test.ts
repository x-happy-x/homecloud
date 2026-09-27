import {describe, expect, test} from 'vitest';
import type {Device, Source} from '../../services/endpoints/backends';
import {defaultNode, linkPath, mapLinks, workersOf} from './mapModel';

const source = (id: string, extra: Partial<Source> = {}) =>
  ({id, name: id, type: 'smb', device: '', enabled: true, health: null, roots: [], stats: {}, ...extra}) as Source;
const core = (id: string, extra: Partial<Device> = {}) =>
  ({id, name: id.toUpperCase(), url: '', online: true, ...extra}) as Device;

describe('схема сканирования', () => {
  const nas = source('nas');
  const disk = source('pc-a', {type: 'device', device: 'pc-a'});
  const busy = core('pc-a', {job: {active: true, roots: ['pc-a:F:\\']}});
  const idle = core('pc-x', {primary: true});
  const off = core('pc-y', {online: false});

  test('задание подсвечивает источник и ядро, выключенное — down', () => {
    const links = mapLinks([nas, disk], [idle, busy, off]);
    expect(links).toEqual([
      {from: 'source:nas', to: 'hub', state: 'idle'},
      {from: 'source:pc-a', to: 'hub', state: 'active'},
      {from: 'hub', to: 'core:pc-x', state: 'idle'},
      {from: 'hub', to: 'core:pc-a', state: 'active'},
      {from: 'hub', to: 'core:pc-y', state: 'down'},
    ]);
    expect(workersOf(disk, [idle, busy]).map(item => item.id)).toEqual(['pc-a']);
  });

  test('диск выключенного компьютера и упавшая проверка — недоступны', () => {
    const links = mapLinks([disk, source('ftp', {health: {online: false, error: 'x', checked_at: 1}})],
      [core('pc-a', {online: false})]);
    expect(links.slice(0, 2).map(link => link.state)).toEqual(['down', 'down']);
  });

  test('сначала показывается считающее ядро', () => {
    expect(defaultNode([idle, busy])).toEqual({kind: 'core', id: 'pc-a'});
    expect(defaultNode([idle])).toEqual({kind: 'core', id: 'pc-x'});
    expect(defaultNode([])).toEqual({kind: 'hub'});
  });

  test('линия идёт вбок в ряд и вниз в столбик', () => {
    expect(linkPath({left: 0, top: 0, right: 100, bottom: 40}, {left: 200, top: 100, right: 300, bottom: 140}))
      .toBe('M100,20 C150,20 150,120 200,120');
    expect(linkPath({left: 0, top: 0, right: 100, bottom: 40}, {left: 0, top: 80, right: 100, bottom: 120}))
      .toBe('M50,40 C50,60 50,60 50,80');
  });
});
