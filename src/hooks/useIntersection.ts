import {useEffect, useState, type RefObject} from 'react';

/**
 * Виден ли наблюдаемый узел. Запас в 800 точек нужен, чтобы следующая
 * страница галереи успевала подгрузиться до того, как пользователь до неё
 * докрутит.
 */
export function useIntersection(
  ref: RefObject<Element | null>,
  {rootMargin = '800px'}: {rootMargin?: string} = {},
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      entries => setVisible(entries.some(entry => entry.isIntersecting)),
      {rootMargin},
    );
    observer.observe(element);
    // Отключать обязательно: в StrictMode эффект выполняется дважды.
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return visible;
}
