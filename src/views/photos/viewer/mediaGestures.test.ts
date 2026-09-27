import {describe, expect, test} from 'vitest';
import {
  clampTransform,
  isCurrentMediaEvent,
  panTransform,
  pinchTransform,
  resetTransform,
  shouldSwipe,
  zoomTransform,
} from './mediaGestures';

const bounds = {width: 400, height: 300};

describe('viewer media gestures', () => {
  test('recognizes horizontal swipe only at base scale', () => {
    expect(shouldSwipe(70, 12, 1)).toBe(true);
    expect(shouldSwipe(70, 12, 2)).toBe(false);
    expect(shouldSwipe(30, 3, 1)).toBe(false);
    expect(shouldSwipe(70, 120, 1)).toBe(false);
  });

  test('limits pan to the scaled media bounds', () => {
    expect(panTransform({scale: 3, x: 0, y: 0}, {x: 1000, y: -1000}, bounds))
      .toEqual({scale: 3, x: 400, y: -300});
  });

  test('clamps zoom and resets offsets at 1x', () => {
    const zoomed = zoomTransform(resetTransform(), 12, {x: 320, y: 200}, bounds);
    expect(zoomed.scale).toBe(5);
    expect(clampTransform({...zoomed, scale: 0.4}, bounds)).toEqual(resetTransform());
  });

  test('ignores stale media loading events', () => {
    expect(isCurrentMediaEvent('photo-a', 'photo-a')).toBe(true);
    expect(isCurrentMediaEvent('photo-a', 'photo-b')).toBe(false);
  });
});

describe('щипок', () => {
  const bounds = {width: 400, height: 800};
  test('пальцы на месте — снимок не уползает, сколько бы ни было движений', () => {
    const start = {scale: 1, x: 0, y: 0};
    const mid = {x: 300, y: 500};
    const first = pinchTransform(start, mid, mid, 2, bounds);
    let current = first;
    for (let step = 0; step < 20; step++) current = pinchTransform(start, mid, mid, 2, bounds);
    expect(current).toEqual(first);
    // Точка под пальцами остаётся под пальцами: (mid − центр − x) / scale постоянно.
    expect((mid.x - 200 - current.x) / current.scale).toBeCloseTo(mid.x - 200);
  });

  test('движение пальцев сдвигает снимок вслед', () => {
    const start = {scale: 2, x: 0, y: 0};
    const moved = pinchTransform(start, {x: 200, y: 400}, {x: 230, y: 380}, 1, bounds);
    expect(moved).toEqual({scale: 2, x: 30, y: -20});
  });
});
