import {useLayoutEffect, useRef, useState, type ReactNode, type RefObject} from 'react';

export interface PopoverProps {
  open: boolean;
  /** Элемент, у которого всплывашка появляется. */
  anchor: RefObject<HTMLElement | null>;
  onClose(): void;
  /** Меню учётной записи живёт внизу боковой панели и раскрывается вверх. */
  placement?: 'below' | 'above';
  className?: string;
  children: ReactNode;
}

const MARGIN = 12;

/**
 * Всплывашка рядом с элементом. Раньше одну и ту же арифметику прижимания к
 * краю экрана писали дважды: для меню учётной записи и для окошка лица.
 */
export function Popover({open, anchor, onClose, placement = 'below', className, children}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({left: 0, top: 0});

  useLayoutEffect(() => {
    if (!open) return;
    const source = anchor.current;
    const element = ref.current;
    if (!source || !element) return;
    const box = source.getBoundingClientRect();
    const size = element.getBoundingClientRect();
    setPosition({
      left: Math.min(Math.max(MARGIN, box.left), window.innerWidth - size.width - MARGIN),
      top: placement === 'above'
        ? Math.max(MARGIN, box.top - size.height - 8)
        : Math.min(box.bottom + 8, window.innerHeight - size.height - MARGIN),
    });
  }, [open, anchor, placement]);

  useLayoutEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const element = ref.current;
      if (element && !element.contains(event.target as Node)) onClose();
    };
    // Откладываем на кадр: щелчок, который открыл всплывашку, ещё всплывает.
    const id = requestAnimationFrame(() => document.addEventListener('click', outside));
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('click', outside);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className={className}
      style={{position: 'fixed', left: position.left, top: position.top}}
    >
      {children}
    </div>
  );
}
