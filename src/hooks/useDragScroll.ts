import {useEffect, useRef, type RefObject} from 'react';

/** Меньше трёх точек — это дрожание руки, а не перетаскивание. */
const DRAG_THRESHOLD = 3;

/**
 * Лента кадров тянется мышью, а колесо прокручивает её вбок. Возвращает
 * признак «только что тянули» — по нему клик по кадру подавляется, чтобы
 * перетаскивание не превращалось в выбор.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>): {dragged: RefObject<boolean>} {
  const dragged = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let drag: {x: number; left: number; moved: boolean} | null = null;

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      drag = {x: event.clientX, left: element.scrollLeft, moved: false};
      element.classList.add('dragging');
      element.setPointerCapture(event.pointerId);
    };

    const move = (event: PointerEvent) => {
      if (!drag) return;
      const shift = event.clientX - drag.x;
      if (Math.abs(shift) > DRAG_THRESHOLD) drag.moved = true;
      element.scrollLeft = drag.left - shift;
    };

    const release = (event: PointerEvent) => {
      if (!drag) return;
      dragged.current = drag.moved;
      drag = null;
      element.classList.remove('dragging');
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    const click = (event: MouseEvent) => {
      if (!dragged.current) return;
      dragged.current = false;
      event.stopPropagation();
      event.preventDefault();
    };

    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };

    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('click', click, true);
    element.addEventListener('wheel', wheel, {passive: false});
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', release);
      element.removeEventListener('pointercancel', release);
      element.removeEventListener('click', click, true);
      element.removeEventListener('wheel', wheel);
    };
  }, [ref]);

  return {dragged};
}
