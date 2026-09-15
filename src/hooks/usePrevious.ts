import {useEffect, useRef} from 'react';

/**
 * Значение с прошлой отрисовки. По нему ловятся переходы вроде «задача была
 * активна, а теперь нет» — раньше такие проверки были закопаны в тело опроса.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}
