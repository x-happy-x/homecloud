import {useEffect, type RefObject} from 'react';

/** Во сколько раз развести или свести пальцы, чтобы перейти на соседний размер плиток. */
export const PINCH_STEP = 1.3;

/**
 * Шаг масштаба по щипку: +1 — развели пальцы (плитки крупнее), −1 — свели,
 * 0 — ещё мало. ratio — нынешнее расстояние между пальцами к начальному.
 */
export function pinchStep(ratio: number): -1 | 0 | 1 {
  if (ratio >= PINCH_STEP) return 1;
  if (ratio <= 1 / PINCH_STEP) return -1;
  return 0;
}

const gap = (touches: TouchList) =>
  Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

/**
 * Щипок и Ctrl+колесо на сетке меняют размер плиток, как в галерее телефона.
 * Сам браузер страницу при этом не масштабирует: щипок двумя пальцами
 * перехватывается, Ctrl+колесо — тоже. Один шаг за жест: после перехода
 * отсчёт начинается заново, и можно пройти несколько размеров одним щипком.
 */
export function useGridZoom(ref: RefObject<HTMLElement | null>, onStep: (step: 1 | -1) => void, enabled = true) {
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    let base = 0;
    const start = (event: TouchEvent) => {
      if (event.touches.length === 2) base = gap(event.touches);
    };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !base) return;
      event.preventDefault();
      const step = pinchStep(gap(event.touches) / base);
      if (step) {
        onStep(step);
        base = gap(event.touches);
      }
    };
    const end = (event: TouchEvent) => {
      if (event.touches.length < 2) base = 0;
    };
    let wheelAt = 0;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      // Тачпад шлёт десятки событий на один жест — шаг не чаще раза в 250 мс.
      const now = Date.now();
      if (now - wheelAt < 250 || !event.deltaY) return;
      wheelAt = now;
      onStep(event.deltaY < 0 ? 1 : -1);
    };
    node.addEventListener('touchstart', start, {passive: true});
    node.addEventListener('touchmove', move, {passive: false});
    node.addEventListener('touchend', end, {passive: true});
    node.addEventListener('touchcancel', end, {passive: true});
    node.addEventListener('wheel', wheel, {passive: false});
    return () => {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', end);
      node.removeEventListener('wheel', wheel);
    };
  }, [ref, onStep, enabled]);
}

/**
 * Страница целиком не масштабируется: интерфейс рассчитан на свой размер, а
 * щипок нужен сетке и просмотрщику. Safari не слушает user-scalable=no в
 * viewport — ему отдельно гасим gesturestart; Ctrl+колесо и Ctrl+± на
 * компьютере тоже не увеличивают страницу.
 */
export function blockPageZoom(): () => void {
  const gesture = (event: Event) => event.preventDefault();
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey) event.preventDefault();
  };
  const keys = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) event.preventDefault();
  };
  // Второй палец на странице вне сетки и просмотрщика — не зум.
  const touch = (event: TouchEvent) => {
    if (event.touches.length > 1) event.preventDefault();
  };
  document.addEventListener('gesturestart', gesture);
  window.addEventListener('wheel', wheel, {passive: false});
  window.addEventListener('keydown', keys);
  document.addEventListener('touchmove', touch, {passive: false});
  return () => {
    document.removeEventListener('gesturestart', gesture);
    window.removeEventListener('wheel', wheel);
    window.removeEventListener('keydown', keys);
    document.removeEventListener('touchmove', touch);
  };
}
