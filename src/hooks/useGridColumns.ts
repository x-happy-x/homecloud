import {useEffect, useState, type RefObject} from 'react';

/**
 * Сколько колонок сейчас в CSS-сетке с `auto-fill`. Нужно, когда что-то
 * вставляется «под рядом»: сама сетка число колонок не сообщает, а оно
 * меняется с шириной окна.
 */
export function useGridColumns(ref: RefObject<HTMLElement | null>, enabled = true): number {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const measure = () => {
      const template = getComputedStyle(element).gridTemplateColumns;
      setColumns(Math.max(1, template.split(' ').filter(Boolean).length));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Отключать обязательно: в StrictMode эффект выполняется дважды.
    return () => observer.disconnect();
  }, [ref, enabled]);

  return columns;
}
