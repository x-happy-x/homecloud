export interface MediaTransform {
  scale: number;
  x: number;
  y: number;
}

export interface MediaBounds {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
export const SWIPE_MIN = 45;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const resetTransform = (): MediaTransform => ({scale: MIN_SCALE, x: 0, y: 0});

export function clampTransform(transform: MediaTransform, bounds: MediaBounds): MediaTransform {
  const scale = clamp(transform.scale, MIN_SCALE, MAX_SCALE);
  if (scale <= MIN_SCALE || bounds.width <= 0 || bounds.height <= 0) return resetTransform();
  const maxX = bounds.width * (scale - MIN_SCALE) / 2;
  const maxY = bounds.height * (scale - MIN_SCALE) / 2;
  return {
    scale,
    x: clamp(transform.x, -maxX, maxX),
    y: clamp(transform.y, -maxY, maxY),
  };
}

export function panTransform(transform: MediaTransform, delta: Point, bounds: MediaBounds): MediaTransform {
  return clampTransform({...transform, x: transform.x + delta.x, y: transform.y + delta.y}, bounds);
}

export function zoomTransform(
  transform: MediaTransform,
  scale: number,
  origin: Point,
  bounds: MediaBounds,
): MediaTransform {
  const nextScale = clamp(scale, MIN_SCALE, MAX_SCALE);
  if (nextScale <= MIN_SCALE) return resetTransform();
  const center = {x: bounds.width / 2, y: bounds.height / 2};
  const factor = nextScale / Math.max(transform.scale, MIN_SCALE);
  return clampTransform({
    scale: nextScale,
    x: origin.x - center.x - (origin.x - center.x - transform.x) * factor,
    y: origin.y - center.y - (origin.y - center.y - transform.y) * factor,
  }, bounds);
}

/**
 * Щипок: масштаб и сдвиг считаются от положения в начале щипка, а не от
 * прошлого кадра. Раньше масштаб брался начальный, а сдвиг — уже сдвинутый, и
 * на каждом движении пальцев смещение копилось: снимок уезжал к краю.
 */
export function pinchTransform(
  start: MediaTransform,
  startMid: Point,
  mid: Point,
  factor: number,
  bounds: MediaBounds,
): MediaTransform {
  const zoomed = zoomTransform(start, start.scale * factor, startMid, bounds);
  if (zoomed.scale <= MIN_SCALE) return zoomed;
  return panTransform(zoomed, {x: mid.x - startMid.x, y: mid.y - startMid.y}, bounds);
}

export function shouldSwipe(dx: number, dy: number, scale: number): boolean {
  return scale <= MIN_SCALE + 0.02 && Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy);
}

export function isCurrentMediaEvent(token: string, expected: string): boolean {
  return token === expected;
}
