import {Icon} from '../Icon/Icon';

export interface InlineSearchProps {
  value: string;
  onChange(value: string): void;
  placeholder: string;
  label: string;
}

/** Поле поиска внутри экрана или панели — без горячей клавиши и без крестика. */
export const InlineSearch = ({value, onChange, placeholder, label}: InlineSearchProps) => (
  <label className="inline-search">
    <Icon name="search" />
    <input
      type="search"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      onChange={event => onChange(event.target.value)}
    />
  </label>
);
