import {useEffect, useRef} from 'react';

/**
 * Чем пользователь ткнул последним. Нужно, чтобы правая кнопка мыши работала
 * как выбор, а долгое нажатие пальцем не превращалось в контекстное меню.
 */
export function usePointerType(): {current: string} {
  const type = useRef('mouse');
  useEffect(() => {
    const listen = (event: PointerEvent) => { type.current = event.pointerType || 'mouse'; };
    // Фаза перехвата: обработчики элементов не должны успеть съесть событие.
    window.addEventListener('pointerdown', listen, true);
    return () => window.removeEventListener('pointerdown', listen, true);
  }, []);
  return type;
}
