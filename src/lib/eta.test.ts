import {expect, test} from 'vitest';
import type {Device, DeviceJob} from '../services/endpoints/backends';
import {DeviceEta, EtaBook, type ProfileStore} from './eta';

const memory = (): ProfileStore & {saved: Record<string, number>} => {
  const store = {saved: {} as Record<string, number>, read: () => ({}), write: (p: Record<string, number>) => { store.saved = {...p}; }};
  return store;
};

const device = (job: Partial<DeviceJob>): Device =>
  ({id: 'pc', name: 'ПК', url: '', online: true, job: {active: true, ...job}});

test('без активного задания оценки нет', () => {
  const eta = new DeviceEta(new EtaBook(memory()));
  expect(eta.estimate(device({active: false, phase: 'faces'}))).toBe('');
});

test('до замеров берётся скорость этапа по умолчанию', () => {
  const eta = new DeviceEta(new EtaBook(memory()));
  expect(eta.estimate(device({phase: 'faces', total: 100, completed: 0}), 1_000_000))
    .toBe('Осталось примерно 9 сек');
});

test('следующие включённые этапы прибавляются к оценке', () => {
  const eta = new DeviceEta(new EtaBook(memory()));
  expect(eta.estimate(device({phase: 'faces', total: 100, completed: 0, features: {visual: true}}), 1_000_000))
    .toBe('Осталось примерно 16 сек');
});

test('замеренная скорость запоминается', () => {
  const store = memory();
  const eta = new DeviceEta(new EtaBook(store));
  const now = 2_000_000_000;
  // Десять секунд на двадцать снимков — полсекунды на снимок, осталось восемьдесят.
  const text = eta.estimate(device({phase: 'faces', total: 100, completed: 20, started_at: now / 1000 - 10}), now);
  expect(text).toBe('Осталось примерно 40 сек');
  expect(store.saved['pc:faces']).toBeCloseTo(0.5);
});

test('скользящее среднее: прежнее значение весит keep', () => {
  const book = new EtaBook(memory());
  book.learn('k', 10, .6);
  expect(book.learn('k', 20, .6)).toBeCloseTo(14);
});
