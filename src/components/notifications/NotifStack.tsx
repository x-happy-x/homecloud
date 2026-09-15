import {useStore} from '../../store';
import {NotifCard} from './NotifCard';

/**
 * Всплывающие карточки в углу. Тост гаснет сам через пять секунд, карточка
 * фоновой задачи висит, пока её не закроют руками.
 */
export function NotifStack() {
  const visible = useStore(state => state.notifications.visible);
  const floating = useStore(state => state.notifications.floating);
  const expanded = useStore(state => state.notifications.expanded);
  const toggle = useStore(state => state.toggleJobExpanded);
  const dismiss = useStore(state => state.dismissFloating);

  return (
    <div className="notif-stack">
      {visible.map(id => {
        const data = floating.get(id);
        if (!data) return null;
        return (
          <div key={id} className="notif-float-item show">
            <NotifCard
              id={id}
              data={data}
              expanded={expanded.has(id)}
              onToggle={toggle}
              onDismiss={dismiss}
            />
          </div>
        );
      })}
    </div>
  );
}
