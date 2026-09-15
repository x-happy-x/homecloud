import {useEffect, useState} from 'react';

/** Прокрутили ли страницу настолько, что у шапки пора показать тень. */
export function useStickyHeader(threshold = 8): boolean {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const listen = () => setStuck(window.scrollY > threshold);
    listen();
    window.addEventListener('scroll', listen, {passive: true});
    return () => window.removeEventListener('scroll', listen);
  }, [threshold]);
  return stuck;
}
