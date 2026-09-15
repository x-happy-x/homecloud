import './Notifications.scss';
import type {NotifData} from '../../store/slices/notifications';
import {Button} from '../../ui/Button/Button';

export interface NotifCardProps {
  id: string;
  data: NotifData;
  expanded: boolean;
  onToggle(id: string): void;
  /** В углу карточку можно закрыть; в панели — нет. */
  onDismiss?(id: string): void;
}

const MARKS: Record<NotifData['level'], string> = {error: '!', success: '✓', info: ''};

export function NotifCard({id, data, expanded, onToggle, onDismiss}: NotifCardProps) {
  const steps = data.steps ?? [];
  const expandable = steps.length > 0;
  const hasBar = data.progress !== null && data.progress !== undefined || data.spinning;
  const known = typeof data.progress === 'number';
  const stepIndex = steps.findIndex(step => step.state === 'active') + 1;

  return (
    <div className={[
      'notif-job',
      data.level === 'error' ? 'level-error' : '',
      expandable && expanded ? 'expanded' : '',
    ].filter(Boolean).join(' ')}>
      <div
        className={`notif-job-head${expandable ? '' : ' no-expand'}`}
        onClick={expandable ? () => onToggle(id) : undefined}
      >
        <span className={`notif-job-icon${data.spinning ? ' spin' : ''}`}>{MARKS[data.level]}</span>
        <div className="notif-job-body">
          <div className="notif-job-title">{data.title}</div>
          <div className="notif-job-sub">{data.sub ?? ''}</div>
        </div>
        {expandable && <span className="notif-job-caret">▾</span>}
        {onDismiss && (
          <button
            className="notif-job-close"
            type="button"
            title="Скрыть"
            onClick={event => { event.stopPropagation(); onDismiss(id); }}
          >
            ×
          </button>
        )}
      </div>

      {hasBar && (
        <div className={`notif-job-bar${!known ? ' indeterminate' : ''}`}>
          <span style={known ? {width: `${Math.min(100, Math.max(0, data.progress! * 100))}%`} : undefined} />
        </div>
      )}

      {expandable && (
        <div className="notif-job-details">
          <ol className="notif-job-steps">
            {steps.map((step, index) => (
              <li key={step.title + index} className={`notif-job-step ${step.state === 'waiting' ? '' : step.state}`}>
                <span className="dot">{step.state === 'done' ? '✓' : index + 1}</span>
                <span className="notif-job-step-body">
                  <span>{step.title}</span>
                  {index + 1 === stepIndex && step.detail && (
                    <span className="notif-job-step-detail">{step.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Остановка не должна требовать разворачивания карточки. */}
      {data.canStop && data.onStop && (
        <div className="notif-job-actions">
          <Button variant="danger" small onClick={event => { event.stopPropagation(); data.onStop!(); }}>
            Остановить
          </Button>
        </div>
      )}
    </div>
  );
}
