import {beforeEach, expect, it, vi} from 'vitest';
import {deletePhotos} from '../../services/endpoints/photos';
import {deleteDuplicatesWithProgress} from './remove';

const notifications = vi.hoisted(() => ({setJob: vi.fn(), finishJob: vi.fn()}));
vi.mock('../../store', () => ({store: {getState: () => notifications}}));
vi.mock('../../services/endpoints/photos', () => ({deletePhotos: vi.fn()}));
beforeEach(() => vi.clearAllMocks());

it('обновляет одну карточку по партиям и сохраняет итог', async () => {
  vi.mocked(deletePhotos).mockResolvedValueOnce({deleted: 200, errors: []})
    .mockResolvedValueOnce({deleted: 1, errors: []});
  await deleteDuplicatesWithProgress(Array.from({length: 201}, (_, i) => `photo-${i}`));
  const calls = notifications.setJob.mock.calls;
  expect(new Set(calls.map(([id]) => id)).size).toBe(1);
  expect(calls.map(([, data]) => data.progress)).toEqual([0, 200 / 201, 1]);
  expect(notifications.finishJob).toHaveBeenCalledWith(calls[0][0], expect.objectContaining({level: 'success'}));
});

it('завершает карточку ошибкой при обрыве запроса, сохраняя счётчик', async () => {
  vi.mocked(deletePhotos).mockResolvedValueOnce({deleted: 200, errors: []})
    .mockRejectedValueOnce(new Error('Нет соединения'));
  await expect(deleteDuplicatesWithProgress(Array.from({length: 201}, (_, i) => `${i}`)))
    .rejects.toThrow('Нет соединения');
  expect(notifications.finishJob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    level: 'error', message: expect.stringContaining('200 из 201'),
  }));
});

it('отмечает частичное удаление как завершение с ошибками', async () => {
  vi.mocked(deletePhotos).mockResolvedValueOnce({deleted: 0, errors: [{path: 'photo', error: 'Нет доступа'}]});
  await deleteDuplicatesWithProgress(['photo']);
  expect(notifications.finishJob).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({level: 'error'}));
});
