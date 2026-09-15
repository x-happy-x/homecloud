import {useEffect} from 'react';

export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

const chord = (event: KeyboardEvent): string => {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('mod');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  return parts.join('+');
};

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Горячие клавиши окна. Сочетания записываются как 'mod+k' или 'Escape';
 * когда пользователь печатает, одиночные буквы не срабатывают.
 */
export function useKeyboardShortcuts(map: ShortcutMap, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const listen = (event: KeyboardEvent) => {
      const handler = map[chord(event)];
      if (!handler) return;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.isContentEditable) || TYPING.has(target?.tagName ?? '');
      if (typing && !event.ctrlKey && !event.metaKey && event.key !== 'Escape') return;
      handler(event);
    };
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, [map, enabled]);
}
