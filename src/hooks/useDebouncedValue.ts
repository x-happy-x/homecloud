import {useEffect, useState} from 'react';

/** Значение, догоняющее исходное после паузы: поиск не шлёт запрос на каждую букву. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
