import {expect, test} from 'vitest';
import {query} from './api';

test('query: пустое выбрасывается', () => {
  expect(query({a: '', b: null, c: undefined, d: false})).toBe('');
});

// Бэкенд сравнивает флаги со строкой '1': с «true» фильтр молча не срабатывал.
test('query: истина уходит единицей', () => {
  expect(query({blurry: true, limit: 24, key: 'auto:1'})).toBe('?blurry=1&limit=24&key=auto%3A1');
});
