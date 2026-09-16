import {useEffect, type MouseEvent} from 'react';

export interface FolderMenuState {
  path: string;
  label: string;
  x: number;
  y: number;
}

interface FolderContextMenuProps {
  menu: FolderMenuState | null;
  canEdit: boolean;
  busy?: boolean;
  onClose(): void;
  onExclude(path: string): void;
  onHide(path: string): void;
  onMove(path: string): void;
  onDelete(path: string): void;
}

export function FolderContextMenu({
  menu, canEdit, busy, onClose, onExclude, onHide, onMove, onDelete,
}: FolderContextMenuProps) {
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => onClose();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const act = (call: (path: string) => void) => (event: MouseEvent) => {
    event.stopPropagation();
    call(menu.path);
    onClose();
  };
  return (
    <div
      className="folder-context-menu"
      style={{left: menu.x, top: menu.y}}
      role="menu"
      aria-label={`Действия с папкой ${menu.label}`}
      onPointerDown={event => event.stopPropagation()}
      onContextMenu={event => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={act(onExclude)}>Исключить из фильтра</button>
      {canEdit && <button type="button" role="menuitem" disabled={busy} onClick={act(onHide)}>Скрыть</button>}
      {canEdit && <button type="button" role="menuitem" disabled={busy} onClick={act(onMove)}>Переместить…</button>}
      {canEdit && <button type="button" role="menuitem" disabled={busy} onClick={act(onDelete)}>Удалить</button>}
    </div>
  );
}
