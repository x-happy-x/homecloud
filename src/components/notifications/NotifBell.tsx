import {useEffect, useState} from 'react';
import {usePrevious} from '../../hooks/usePrevious';
import {useStore} from '../../store';
import {Icon} from '../../ui/Icon/Icon';

const FLASH_MS = 700;

/** Колокольчик: точка пульсирует, пока идёт задача, число — непрочитанное. */
export function NotifBell() {
  const unseen = useStore(state => state.notifications.unseen);
  const busy = useStore(state => state.notifications.jobs.size > 0);
  const open = useStore(state => state.openNotifPanel);
  const [flash, setFlash] = useState(false);
  const previous = usePrevious(unseen);

  // Новое уведомление, когда панель закрыта, — колокольчик вздрагивает.
  useEffect(() => {
    if (previous === undefined || unseen <= previous) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [unseen, previous]);

  return (
    <button
      className={`icon-button notif-bell${flash ? ' flash' : ''}`}
      type="button"
      title="Уведомления"
      aria-label="Уведомления"
      onClick={open}
    >
      <Icon name="bell" />
      {(busy || unseen > 0) && (
        <span className={`notif-badge${busy ? ' pulse' : ''}`}>
          {busy ? '' : Math.min(unseen, 9)}
        </span>
      )}
    </button>
  );
}
