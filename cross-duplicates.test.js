import {describe, expect, it} from 'vitest';
import {crossDuplicateGroups, crossDuplicatePage} from './cross-duplicates.js';

const inventory = (id, items) => ({device: {id, name: id.toUpperCase()}, items});
const photo = (path, sha1, dhash = null, size = 1000) =>
  ({path, sha1, dhash, size, width: 100, height: 80});

describe('cross-device duplicates', () => {
  it('keeps only exact groups spanning devices', () => {
    const groups = crossDuplicateGroups([
      inventory('pc-x', [photo('X:/a.jpg', 'same'), photo('X:/b.jpg', 'local')]),
      inventory('pc-a', [photo('A:/a.jpg', 'same')]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('exact');
    expect(new Set(groups[0].items.map(item => item.device_id))).toEqual(new Set(['pc-x', 'pc-a']));
  });

  it('connects close dHashes across devices without repeating exact copies', () => {
    const groups = crossDuplicateGroups([
      inventory('pc-x', [photo('X:/a.jpg', 'x', '0000000000000000')]),
      inventory('pc-a', [photo('A:/a.jpg', 'a', '0000000000000001')]),
    ], true);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('similar');
  });

  it('filters, sorts and paginates aggregated groups', () => {
    const groups = crossDuplicateGroups([
      inventory('pc-x', [photo('X:/a', 'one', null, 200), photo('X:/b', 'two', null, 900)]),
      inventory('pc-a', [photo('A:/a', 'one', null, 100), photo('A:/b', 'two', null, 800)]),
    ]);
    const page = crossDuplicatePage(groups, {sort: 'size', limit: 1});
    expect(page.total).toBe(2);
    expect(page.groups[0].extra).toBe(800);
    expect(page.summary.groups).toBe(2);
  });
});
