import {expect, it, vi} from 'vitest';
import {getDuplicates} from '../../services/endpoints/jobs';
import {loadAllDuplicates} from './loadAll';

vi.mock('../../services/endpoints/jobs', () => ({getDuplicates: vi.fn()}));
it('загружает все страницы с текущими фильтрами до удаления', async () => {
  const filters = {kind: 'exact' as const, sort: 'size' as const, hideSmall: true, folder: 'D:/album'};
  vi.mocked(getDuplicates)
    .mockResolvedValueOnce({groups: [], total: 401})
    .mockResolvedValueOnce({groups: [], total: 401})
    .mockResolvedValueOnce({groups: [], total: 401});
  await loadAllDuplicates(false, filters);
  expect(vi.mocked(getDuplicates).mock.calls).toEqual([
    [false, filters, 200, 0, undefined], [false, filters, 200, 200, undefined], [false, filters, 200, 400, undefined],
  ]);
});


it('прекращает загрузку при отмене и сообщает прогресс', async () => {
  vi.mocked(getDuplicates).mockClear();
  vi.mocked(getDuplicates).mockResolvedValue({groups: [], total: 401});
  const controller = new AbortController();
  const onProgress = vi.fn(() => controller.abort());
  await expect(loadAllDuplicates(false, {kind: 'all', sort: 'size', hideSmall: true, folder: ''}, {
    signal: controller.signal, onProgress,
  })).rejects.toMatchObject({name: 'AbortError'});
  expect(getDuplicates).toHaveBeenCalledTimes(1);
  expect(onProgress).toHaveBeenCalledWith(200, 401);
});
