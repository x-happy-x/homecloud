import {adultFlag, unchecked} from '../lib/adult';
import type {AdultMode, Photo, ZoomLevel} from '../types/domain';

/** Плотность экрана с потолком: за 2× разница уже не видна, а трафик растёт. */
export const density = (): number => Math.min(window.devicePixelRatio || 1, 2);

const TILE_BASE: Record<ZoomLevel, number> = {small: 120, medium: 190, large: 300};

/**
 * Размер копии под плитку сетки. Считать один раз на сетку и передавать вниз:
 * devicePixelRatio на каждую из тысяч плиток заметен в раскладке.
 */
export const tileSize = (zoom: ZoomLevel): number => Math.round(TILE_BASE[zoom] * density());

export const viewerSize = (): number =>
  Math.round(Math.min(2200, Math.max(window.innerWidth, window.innerHeight) * density()));

/**
 * Адрес уменьшенной копии. Решение о блюре зашито в URL, а значит и в кэш
 * браузера, поэтому порядок проверок менять нельзя: ошибка здесь — это
 * откровенный кадр, показанный без замыливания.
 */
export function photoMediaUrl(photo: Photo, adultMode: AdultMode, size?: number): string {
  const scaled = size ? `&size=${size}` : '';
  // «Замыливать и непроверенные» закрывает всё, что этап 18+ ещё не смотрел.
  if (adultMode === 'strict' && unchecked(photo)) return `${photo.preview}${scaled}&blur=full`;
  if (!adultFlag(photo) || adultMode === 'show' || adultMode === 'hide') {
    return `${photo.preview}${scaled}`;
  }
  const mode = adultMode === 'full' ? 'full' : adultMode === 'strict' ? 'explicit' : adultMode;
  return `${photo.preview}${scaled}&blur=${encodeURIComponent(mode)}`;
}
