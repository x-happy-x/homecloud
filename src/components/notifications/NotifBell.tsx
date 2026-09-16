import {useEffect, useState, type CSSProperties} from 'react';
import './Notifications.scss';
import {usePrevious} from '../../hooks/usePrevious';
import {useStore} from '../../store';
import {Icon} from '../../ui/Icon/Icon';

const FLASH_MS = 700;

/** Колокольчик: точка пульсирует, пока идёт задача, число — непрочитанное. */
export function NotifBell() {
  const unseen = useStore(state => state.notifications.unseen);
  const busy = useStore(state => state.notifications.jobs.size > 0);
  // Кольцо вокруг колокольчика — готовность самой долгой задачи.
  const progress = useStore(state => {
    const values = [...state.notifications.jobs.values()]
      .map(job => job.progress)
      .filter((value): value is number => typeof value === 'number');
    return values.length ? Math.min(...values) : null;
  });
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
      className={`icon-button notif-bell${flash ? ' flash' : ''}${busy ? ' busy' : ''}`}
      type="button"
      title={progress === null ? 'Уведомления' : `Уведомления · задача готова на ${Math.floor(progress * 100)}%`}
      aria-label="Уведомления"
      onClick={open}
    >
      {progress !== null && (
        <span className="notif-ring" style={{'--p': `${Math.floor(progress * 100)}%`} as CSSProperties} />
      )}
      <Icon name="bell" />
      {(busy || unseen > 0) && (
        <span className={`notif-badge${busy ? ' pulse' : ''}`}>
          {busy ? '' : Math.min(unseen, 9)}
        </span>
      )}
    </button>
  );
}
