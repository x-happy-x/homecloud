import {useEffect, useRef, type PointerEvent as ReactPointerEvent} from 'react';

const HOLD_MS = 430;
type SelectPhotos = (kind: 'photos', ids: string[]) => void;

/** После удержания палец или мышь «красят» плитки выбранными/снятыми. */
export function usePhotoDragSelection(selected: Set<string>, select: SelectPhotos, enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const suppressClick = useRef(false);
  const pointer = useRef<number | null>(null);
  const last = useRef('');
  const add = useRef(true);
  const draft = useRef(new Set<string>());

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelTimer, []);

  const pathAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-photo-path]')?.dataset.photoPath ?? '';
  const apply = (path: string) => {
    if (!path || path === last.current) return;
    last.current = path;
    add.current ? draft.current.add(path) : draft.current.delete(path);
    select('photos', [...draft.current]);
  };

  return {
    onPointerDownCapture(event: ReactPointerEvent<HTMLElement>) {
      if (!enabled || event.button !== 0) return;
      const tile = (event.target as HTMLElement).closest<HTMLElement>('[data-photo-path]');
      const path = tile?.dataset.photoPath;
      if (!path) return;
      cancelTimer();
      active.current = false;
      suppressClick.current = false;
      pointer.current = event.pointerId;
      last.current = '';
      const root = event.currentTarget;
      timer.current = setTimeout(() => {
        active.current = true;
        suppressClick.current = true;
        add.current = !selected.has(path);
        draft.current = new Set(selected);
        apply(path);
        root.setPointerCapture?.(event.pointerId);
        navigator.vibrate?.(12);
      }, HOLD_MS);
    },
    onPointerMoveCapture(event: ReactPointerEvent<HTMLElement>) {
      if (!active.current || event.pointerId !== pointer.current) return;
      event.preventDefault();
      apply(pathAt(event.clientX, event.clientY));
    },
    onPointerUpCapture(event: ReactPointerEvent<HTMLElement>) {
      cancelTimer();
      if (active.current) event.currentTarget.releasePointerCapture?.(event.pointerId);
      active.current = false;
      pointer.current = null;
      last.current = '';
    },
    onPointerCancelCapture() {
      cancelTimer();
      active.current = false;
      pointer.current = null;
      last.current = '';
    },
    onClickCapture(event: React.MouseEvent<HTMLElement>) {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
