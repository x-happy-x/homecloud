import './Notifications.scss';
import {useStore} from '../../store';
import {SidePanel} from '../../ui/SidePanel/SidePanel';
import {NotifCard} from './NotifCard';

const MARKS = {error: '⚠', success: '✓', info: '•'} as const;

export function NotifPanel() {
  const open = useStore(state => state.notifications.panelOpen);
  const jobs = useStore(state => state.notifications.jobs);
  const history = useStore(state => state.notifications.history);
  const expanded = useStore(state => state.notifications.expanded);
  const toggle = useStore(state => state.toggleJobExpanded);
  const close = useStore(state => state.closeNotifPanel);

  return (
    <SidePanel open={open} title="Уведомления" onClose={close} className="notif-panel">
      <div className="notif-body">
        {jobs.size > 0 && (
          <div>
            <div className="notif-section-label">Сейчас</div>
            {[...jobs].map(([id, data]) => (
              <NotifCard key={id} id={id} data={data} expanded={expanded.has(id)} onToggle={toggle} />
            ))}
          </div>
        )}
        <div>
          <div className="notif-section-label">История</div>
          {history.length === 0
            ? <p className="task-history-empty">Пока пусто — здесь будут появляться уведомления.</p>
            : [...history].reverse().map((item, index) => (
                <div key={`${item.at}-${index}`} className="task-history-item">
                  <span className="task-history-time">
                    {new Date(item.at).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}
                  </span>
                  <span>
                    {MARKS[item.level]} <strong>{item.title}</strong>
                    {item.message && <><br /><span style={{color: 'var(--muted)'}}>{item.message}</span></>}
                  </span>
                </div>
              ))}
        </div>
      </div>
    </SidePanel>
  );
}
