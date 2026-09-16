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
    [false, filters, 200, 0], [false, filters, 200, 200], [false, filters, 200, 400],
  ]);
});
