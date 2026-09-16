import type {ReactNode} from 'react';
import './ToggleCard.scss';
import {Icon, type IconName} from '../Icon/Icon';

export interface ToggleCardProps {
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  title: string;
  note?: ReactNode;
  /** Большая иконка слева, прижатая к низу карточки; включённая — акцентного цвета. */
  icon: IconName;
}

/**
 * Карточка-переключатель. Сам флажок спрятан: состояние показывают рамка,
 * фон и цвет иконки, а нажать можно куда угодно в карточке, а не в квадратик
 * тринадцать на тринадцать точек. Для клавиатуры это по-прежнему обычный
 * checkbox внутри label.
 */
export const ToggleCard = ({checked, onChange, disabled, title, note, icon}: ToggleCardProps) => (
  <label className={`toggle-card${checked ? ' on' : ''}${disabled ? ' unavailable' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={event => onChange(event.target.checked)}
    />
    <span className="toggle-card-icon" aria-hidden="true"><Icon name={icon} /></span>
    <span className="toggle-card-body">
      <b>{title}</b>
      {note && <small>{note}</small>}
    </span>
  </label>
);
