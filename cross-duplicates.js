const SMALL_FILE = 100 * 1024;

const refOf = item => `${item.device_id}:${item.path}`;
const distance = (first, second) => {
  let bits = BigInt(`0x${first}`) ^ BigInt(`0x${second}`);
  let count = 0;
  while (bits) { count += Number(bits & 1n); bits >>= 1n; }
  return count;
};

function makeGroup(kind, key, items) {
  if (new Set(items.map(item => item.device_id)).size < 2) return null;
  const rank = item => [(item.width || 0) * (item.height || 0), item.size || 0, -item.path.length];
  const keep = items.reduce((best, item) => {
    const a = rank(item); const b = rank(best);
    return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))
      ? item : best;
  });
  const ordered = [keep, ...items.filter(item => item !== keep)]
    .map(item => ({...item, ref: refOf(item)}));
  const total = ordered.reduce((sum, item) => sum + (item.size || 0), 0);
  return {
    key: `cross:${kind}:${key}`, kind, keep: refOf(keep), count: ordered.length,
    extra: total - (keep.size || 0), file_size: Math.max(...ordered.map(item => item.size || 0)),
    paths: ordered.map(item => item.ref), items: ordered,
  };
}

/** Merge compact hash inventories. Only groups spanning at least two devices survive. */
export function crossDuplicateGroups(inventories, similar = false) {
  const all = inventories.flatMap(({device, items}) => items.map(item => ({
    ...item, device_id: device.id, device_name: device.name,
  })));
  const exactBuckets = new Map();
  for (const item of all) {
    if (!item.sha1) continue;
    if (!exactBuckets.has(item.sha1)) exactBuckets.set(item.sha1, []);
    exactBuckets.get(item.sha1).push(item);
  }
  const groups = [];
  const exactRefs = new Set();
  for (const [hash, items] of exactBuckets) {
    const group = makeGroup('exact', hash, items);
    if (!group) continue;
    groups.push(group);
    items.forEach(item => exactRefs.add(refOf(item)));
  }

  if (similar) {
    const buckets = new Map();
    for (const item of all) {
      if (!item.dhash || exactRefs.has(refOf(item))) continue;
      if (!buckets.has(item.dhash)) buckets.set(item.dhash, []);
      buckets.get(item.dhash).push(item);
    }
    const bands = new Map();
    for (const hash of buckets.keys()) {
      for (let number = 0; number < 4; number++) {
        const band = `${number}:${hash.slice(number * 4, number * 4 + 4)}`;
        if (!bands.has(band)) bands.set(band, []);
        bands.get(band).push(hash);
      }
    }
    const used = new Set();
    for (const hash of buckets.keys()) {
      if (used.has(hash)) continue;
      const near = new Set([hash]);
      const queue = [hash];
      while (queue.length) {
        const current = queue.pop();
        for (let number = 0; number < 4; number++) {
          const band = `${number}:${current.slice(number * 4, number * 4 + 4)}`;
          for (const other of bands.get(band) || []) {
            if (near.has(other) || used.has(other) || distance(current, other) > 3) continue;
            near.add(other); queue.push(other);
          }
        }
      }
      near.forEach(item => used.add(item));
      const items = [...near].flatMap(item => buckets.get(item));
      const group = makeGroup('similar', hash, items);
      if (group) groups.push(group);
    }
  }
  return groups;
}

export function crossDuplicatePage(groups, {kind = 'all', sort = 'size', hideSmall = false,
  limit = 60, offset = 0} = {}, totals = {}) {
  let chosen = groups.filter(group => kind === 'all' || group.kind === kind);
  if (hideSmall) chosen = chosen.filter(group => group.file_size >= SMALL_FILE);
  chosen.sort(sort === 'count'
    ? (a, b) => b.count - a.count || b.extra - a.extra
    : (a, b) => b.extra - a.extra || b.count - a.count);
  const summary = {
    groups: groups.length,
    exact: groups.filter(group => group.kind === 'exact').length,
    similar: groups.filter(group => group.kind === 'similar').length,
    files: groups.reduce((sum, group) => sum + group.count, 0),
    extra_files: groups.reduce((sum, group) => sum + group.count - 1, 0),
    extra_bytes: groups.reduce((sum, group) => sum + group.extra, 0),
    small_groups: groups.filter(group => group.file_size < SMALL_FILE).length,
    hashed: totals.hashed || 0, pictured: totals.pictured || 0,
    // A folder filter is local-device semantics; cross-device groups use device badges instead.
    top_folders: [],
  };
  return {groups: chosen.slice(offset, offset + limit), total: chosen.length, summary};
}
