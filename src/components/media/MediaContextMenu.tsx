import {useEffect, type MouseEvent} from 'react';
import './MediaContextMenu.scss';
import {Icon} from '../../ui/Icon/Icon';

export interface MediaMenuState {
  path: string;
  video: boolean;
  x: number;
  y: number;
}

export interface MediaMenuItem {
  label: string;
  icon?: 'openExternal' | 'check' | 'trash';
  danger?: boolean;
  disabled?: boolean;
  onSelect(path: string): void;
}

/** Состояние меню у точки щелчка, прижатое к краям окна. */
export function mediaMenuAt(event: MouseEvent, path: string, video: boolean, height = 150): MediaMenuState {
  event.preventDefault();
  return {
    path,
    video,
    x: Math.min(event.clientX, window.innerWidth - 230),
    y: Math.min(event.clientY, window.innerHeight - height),
  };
}

/**
 * Меню по правой кнопке у снимка или ролика. Закрывается щелчком мимо,
 * Esc, прокруткой и сменой размера окна — как и меню папки.
 */
export function MediaContextMenu({menu, items, onClose}: {
  menu: MediaMenuState | null;
  items: MediaMenuItem[];
  onClose(): void;
}) {
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
  return (
    <div
      className="media-context-menu"
      style={{left: menu.x, top: menu.y}}
      role="menu"
      onPointerDown={event => event.stopPropagation()}
      onContextMenu={event => event.preventDefault()}
    >
      {items.map(item => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={item.danger ? 'danger' : undefined}
          disabled={item.disabled}
          onClick={event => {
            event.stopPropagation();
            onClose();
            item.onSelect(menu.path);
          }}
        >
          {item.icon && <Icon name={item.icon} size={16} />}
          {item.label}
        </button>
      ))}
    </div>
  );
}
