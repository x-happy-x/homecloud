import {useCallback, useRef, useState} from 'react';
import {useStore} from '../../store';
import {Icon} from '../../ui/Icon/Icon';
import {Popover} from '../../ui/Popover/Popover';
import {GROUP_OPTIONS, isDated, ORDER_OPTIONS} from './grouping';

/** Кнопка «Группы» у панели галереи: вид группировки, порядок, свернуть всё. */
export function GroupingMenu() {
  const grouping = useStore(state => state.prefs.grouping);
  const setGroupBy = useStore(state => state.setGroupBy);
  const setGroupOrder = useStore(state => state.setGroupOrder);
  const setAllGroups = useStore(state => state.setAllGroups);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const current = GROUP_OPTIONS.find(option => option.by === grouping.by) ?? GROUP_OPTIONS[0];
  const grouped = grouping.by !== 'none';
  // «По названию» у дат повторяет «сначала новые».
  const orders = ORDER_OPTIONS.filter(option => !(isDated(grouping.by) && option.order === 'name'));

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`button small grouping-button${grouped ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <Icon name="layers" size={16} />
        <span className="grouping-label">{current.short}</span>
        <Icon name="chevronDown" size={16} className="grouping-caret" />
      </button>
      <Popover open={open} anchor={anchor} onClose={close} className="menu grouping-menu">
        <div className="menu-title">Группировать</div>
        {GROUP_OPTIONS.map(option => (
          <button
            key={option.by}
            type="button"
            role="menuitemradio"
            aria-checked={option.by === grouping.by}
            onClick={() => { setGroupBy(option.by); close(); }}
          >
            <span>{option.label}</span>
            {option.by === grouping.by && <Icon name="check" />}
          </button>
        ))}
        {grouped && (
          <>
            <hr />
            <div className="menu-title">Порядок</div>
            {orders.map(option => (
              <button
                key={option.order}
                type="button"
                role="menuitemradio"
                aria-checked={option.order === grouping.order}
                onClick={() => { setGroupOrder(option.order); close(); }}
              >
                <span>{option.label}</span>
                {option.order === grouping.order && <Icon name="check" />}
              </button>
            ))}
            <hr />
            <button type="button" onClick={() => { setAllGroups(grouping.by, false); close(); }}>
              <Icon name="unfoldMore" />
              <span>Развернуть все</span>
            </button>
            <button type="button" onClick={() => { setAllGroups(grouping.by, true); close(); }}>
              <Icon name="unfoldLess" />
              <span>Свернуть все</span>
            </button>
          </>
        )}
      </Popover>
    </>
  );
}
