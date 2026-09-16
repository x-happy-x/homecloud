import './Notifications.scss';
import type {HistoryEntry} from '../../store/slices/notifications';
import {useStore} from '../../store';
import {SidePanel} from '../../ui/SidePanel/SidePanel';
import {NotifCard} from './NotifCard';

const MARKS = {error: '!', success: '✓', info: 'i'} as const;

const dayKey = (at: number) => new Date(at).toDateString();

function dayTitle(at: number, now = new Date()): string {
  const date = new Date(at);
  if (date.toDateString() === now.toDateString()) return 'Сегодня';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', ...(date.getFullYear() === now.getFullYear() ? {} : {year: 'numeric'}),
  });
}

/** История по дням, свежее сверху. */
function byDay(history: HistoryEntry[]): Array<[string, HistoryEntry[]]> {
  const days = new Map<string, HistoryEntry[]>();
  for (const item of [...history].reverse()) {
    const key = dayKey(item.at);
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(item);
  }
  return [...days.entries()];
}

export function NotifPanel() {
  const open = useStore(state => state.notifications.panelOpen);
  const jobs = useStore(state => state.notifications.jobs);
  const history = useStore(state => state.notifications.history);
  const close = useStore(state => state.closeNotifPanel);
  const clearHistory = useStore(state => state.clearHistory);

  return (
    <SidePanel open={open} title="Уведомления" onClose={close} className="notif-panel">
      <div className="notif-body">
        {jobs.size > 0 && (
          <section className="notif-section">
            <div className="notif-section-label">Сейчас</div>
            {/* В панели шаги видны сразу: сюда приходят именно за подробностями. */}
            {[...jobs].map(([id, data]) => (
              <NotifCard key={id} id={id} data={data} expanded />
            ))}
          </section>
        )}
        <section className="notif-section">
          <div className="notif-section-head">
            <span className="notif-section-label">История</span>
            {history.length > 0 && (
              <button type="button" className="notif-clear" onClick={clearHistory}>Очистить</button>
            )}
          </div>
          {history.length === 0
            ? <p className="task-history-empty">Пока пусто — здесь будут появляться уведомления.</p>
            : byDay(history).map(([key, items]) => (
                <div key={key} className="task-history-day">
                  <div className="task-history-date">{dayTitle(items[0].at)}</div>
                  {items.map((item, index) => (
                    <div key={`${item.at}-${index}`} className={`task-history-item level-${item.level}`}>
                      <span className="task-history-mark" aria-hidden="true">{MARKS[item.level]}</span>
                      <span className="task-history-text">
                        <strong>{item.title}</strong>
                        {item.message && <span className="task-history-message">{item.message}</span>}
                      </span>
                      <span className="task-history-time">
                        {new Date(item.at).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
        </section>
      </div>
    </SidePanel>
  );
}
