import {useEffect, type RefObject} from 'react';

/** Меньше этого — щелчок, а не перетаскивание. */
const DRAG_THRESHOLD = 5;

/**
 * Горизонтальная лента без полосы прокрутки листается свайпом. Пальцем это
 * делает сам браузер (с инерцией), а мышью — этот хук: лента тянется за
 * курсором, и щелчок в конце перетаскивания гасится, чтобы не открыть карточку.
 *
 * В отличие от useDragScroll колесо не перехватывается: над лентой страница
 * должна прокручиваться вниз как обычно.
 */
export function useSwipeScroll(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    let drag: {x: number; left: number; moved: boolean} | null = null;
    let suppressClick = false;

    const move = (event: PointerEvent) => {
      if (!drag) return;
      const shift = event.clientX - drag.x;
      if (!drag.moved && Math.abs(shift) > DRAG_THRESHOLD) {
        drag.moved = true;
        // Прилипание к карточкам мешает тянуть — выключаем на время.
        element.classList.add('dragging');
      }
      if (drag.moved) element.scrollLeft = drag.left - shift;
    };

    const up = () => {
      if (!drag) return;
      suppressClick = drag.moved;
      drag = null;
      element.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      if (element.scrollWidth <= element.clientWidth) return;
      drag = {x: event.clientX, left: element.scrollLeft, moved: false};
      suppressClick = false;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };

    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    // Картинки и ссылки браузер пытается перетащить как файл.
    const dragstart = (event: DragEvent) => event.preventDefault();

    element.addEventListener('pointerdown', down);
    element.addEventListener('click', click, true);
    element.addEventListener('dragstart', dragstart);
    return () => {
      up();
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('click', click, true);
      element.removeEventListener('dragstart', dragstart);
    };
  }, [ref, enabled]);
}
