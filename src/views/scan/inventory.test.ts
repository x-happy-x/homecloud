import {describe, expect, test} from 'vitest';
import type {DeviceJob} from '../../services/endpoints/backends';
import {inventoryOutcome, jobSignature} from './inventory';

const found = {total: 1200, new: 30, changed: 4, missing: 2};
const job = (part: Partial<DeviceJob>): DeviceJob => ({active: false, ...part});

describe('inventoryOutcome', () => {
  test('ошибка — последняя строка текста ошибки', () => {
    expect(inventoryOutcome(job({status: 'error', error: 'Traceback\nOSError: диск недоступен'})))
      .toEqual({level: 'error', message: 'Не удалось собрать список: OSError: диск недоступен'});
    expect(inventoryOutcome(job({status: 'error'})).message)
      .toBe('Не удалось собрать список: ошибка на устройстве');
  });

  test('всё ещё идёт', () => {
    expect(inventoryOutcome(job({active: true, status: 'running'})).message)
      .toBe('Сбор списка файлов ещё не завершился — идёт дальше в фоне, загляните позже.');
  });

  test('остановлено — с найденным и без', () => {
    expect(inventoryOutcome(job({status: 'stopped', inventory: found})).message)
      .toBe('Остановлено. Успели найти 1 200 · новых 30 · изменилось 4');
    expect(inventoryOutcome(job({status: 'stopped'})).message)
      .toBe('Остановлено, ничего не успели найти');
  });

  test('готово — с итогом и без', () => {
    expect(inventoryOutcome(job({status: 'completed', inventory: found})).message)
      .toBe('Найдено 1 200 · новых 30 · изменилось 4 · пропало 2');
    expect(inventoryOutcome(job({status: 'completed'})).message).toBe('Список собран');
  });
});

test('отпечаток меняется с новым заданием', () => {
  const before = jobSignature(job({status: 'completed', pid: 10, started_at: 100}));
  expect(jobSignature(job({status: 'completed', pid: 11, started_at: 200}))).not.toBe(before);
  expect(jobSignature(job({status: 'completed', pid: 10, started_at: 100}))).toBe(before);
});
