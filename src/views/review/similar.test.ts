import {describe, expect, test} from 'vitest';
import {mergeTarget, similarTone, type SimilarGroup} from './similar';

const group = (part: Partial<SimilarGroup>): SimilarGroup =>
  ({key: 'k', title: 'Группа', count: 1, kind: 'auto', ...part});

describe('similarTone', () => {
  test.each([
    [0.9, 'same'], [0.62, 'same'],
    [0.61, 'close'], [0.5, 'close'],
    [0.49, 'kin'], [0.38, 'kin'],
    [0.37, 'far'], [0, 'far'],
  ])('%f → %s', (score, want) => expect(similarTone(score)).toBe(want));
});

describe('mergeTarget', () => {
  test('вливаем в того, у кого есть имя', () => {
    const named = group({key: 'person:1', kind: 'person', count: 3});
    const auto = group({key: 'auto:7', count: 90});
    expect(mergeTarget(auto, named)).toBe(named);
    expect(mergeTarget(named, auto)).toBe(named);
  });

  test('оба с именами — побеждает тот, где лиц больше', () => {
    const small = group({key: 'person:1', kind: 'person', count: 3});
    const big = group({key: 'person:2', kind: 'person', count: 40});
    expect(mergeTarget(small, big)).toBe(big);
    expect(mergeTarget(big, small)).toBe(big);
  });

  test('при равном числе лиц берём первую — она названа раньше', () => {
    const first = group({key: 'person:1', kind: 'person', count: 5});
    const second = group({key: 'person:2', kind: 'person', count: 5});
    expect(mergeTarget(first, second)).toBe(first);
  });

  test('две безымянные сливать не во что', () => {
    expect(mergeTarget(group({key: 'auto:1'}), group({key: 'auto:2'}))).toBeNull();
  });
});
