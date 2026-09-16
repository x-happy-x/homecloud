import type {ReactNode} from 'react';
import './ToggleCard.scss';

export interface ToggleCardProps {
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  title: string;
  note?: ReactNode;
}

/**
 * Карточка-переключатель. Сам флажок спрятан: состояние показывают рамка,
 * фон и знак-галочка, а нажать можно куда угодно в карточке, а не в квадратик
 * тринадцать на тринадцать точек. Для клавиатуры это по-прежнему обычный
 * checkbox внутри label.
 */
export const ToggleCard = ({checked, onChange, disabled, title, note}: ToggleCardProps) => (
  <label className={`toggle-card${checked ? ' on' : ''}${disabled ? ' unavailable' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={event => onChange(event.target.checked)}
    />
    <span className="toggle-card-body">
      <b>{title}</b>
      {note && <small>{note}</small>}
    </span>
    <span className="toggle-card-mark" aria-hidden="true" />
  </label>
);
