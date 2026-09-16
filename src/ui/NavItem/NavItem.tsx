import {Icon, type IconName} from '../Icon/Icon';

export interface NavItemProps {
  icon: IconName;
  label: string;
  active: boolean;
  onClick(): void;
}

/**
 * Пункт навигации — только знак и название. Числа отсюда убраны: «сколько
 * устройств в сети» и «сколько видео» к разделу отношения не имели, а размер
 * разбора (он всегда больше нуля) читался как ошибка. Счётчики стоят там, где
 * у них есть подпись, — на вкладках внутри раздела.
 */
export const NavItem = ({icon, label, active, onClick}: NavItemProps) => (
  <button
    type="button"
    className={`nav-item${active ? ' active' : ''}`}
    aria-current={active ? 'page' : undefined}
    onClick={onClick}
  >
    <Icon name={icon} />
    <span>{label}</span>
  </button>
);
