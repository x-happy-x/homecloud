import {expect, test} from 'vitest';
import {EtaBook, type ProfileStore} from './eta';

const memory = (): ProfileStore & {saved: Record<string, number>} => {
  const store = {saved: {} as Record<string, number>, read: () => ({}), write: (p: Record<string, number>) => { store.saved = {...p}; }};
  return store;
};

test('скользящее среднее: прежнее значение весит keep', () => {
  const book = new EtaBook(memory());
  book.learn('k', 10, .6);
  expect(book.learn('k', 20, .6)).toBeCloseTo(14);
});
