import {describe, expect, test} from 'vitest';
import {pinchStep} from './useGridZoom';

describe('щипок по сетке', () => {
  test('развели пальцы — крупнее, свели — мельче, чуть-чуть — ничего', () => {
    expect(pinchStep(1.35)).toBe(1);
    expect(pinchStep(0.7)).toBe(-1);
    expect(pinchStep(1.1)).toBe(0);
    expect(pinchStep(0.9)).toBe(0);
  });
});
