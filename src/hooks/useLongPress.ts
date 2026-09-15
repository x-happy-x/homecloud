import {useEffect, useRef} from 'react';
import {usePointerType} from './usePointerType';

const HOLD_MS = 460;
/** Палец всегда немного ведёт; больше десяти точек — это уже прокрутка. */
const MOVE_TOLERANCE = 10;

export interface LongPressHandlers {
  onPointerDown(event: React.PointerEvent): void;
  onPointerMove(event: React.PointerEvent): void;
  onPointerUp(): void;
  onPointerCancel(): void;
  onPointerLeave(): void;
  onClickCapture(event: React.MouseEvent): void;
  onContextMenu(event: React.MouseEvent): void;
}

/**
 * Долгое нажатие (и правая кнопка мыши) выбирает карточку, обычный клик
 * по-прежнему открывает её.
 */
export function useLongPress(action: () => void): LongPressHandlers {
  const pointerType = usePointerType();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef({x: 0, y: 0});
  const latest = useRef(action);
  latest.current = action;

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => cancel, []);

  return {
    onPointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      cancel();
      fired.current = false;
      start.current = {x: event.clientX, y: event.clientY};
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(12);
        latest.current();
      }, HOLD_MS);
    },

    onPointerMove(event) {
      const moved = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
      if (timer.current && moved > MOVE_TOLERANCE) cancel();
    },

    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,

    // Клик после долгого нажатия гасим, иначе следом откроется карточка.
    onClickCapture(event) {
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },

    onContextMenu(event) {
      event.preventDefault();
      if (fired.current) { fired.current = false; return; }
      if (pointerType.current === 'mouse') { cancel(); latest.current(); }
    },
  };
}
