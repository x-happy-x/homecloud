import './Notifications.scss';
import type {JobStep, NotifData} from '../../store/slices/notifications';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';

export interface NotifCardProps {
  id: string;
  data: NotifData;
  expanded: boolean;
  /** Без него шаги всегда раскрыты и не сворачиваются — так в панели. */
  onToggle?(id: string): void;
  /** В углу карточку можно закрыть; в панели — нет. */
  onDismiss?(id: string): void;
}

const MARKS: Record<NotifData['level'], string> = {error: '!', success: '✓', info: 'i'};

const clamp = (value: number) => Math.min(100, Math.max(0, value * 100));

/** Путь файла: имя отдельно, папка приглушённо — длинный путь не превращается в кашу. */
function CurrentFile({path}: {path: string}) {
  const cut = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  const name = cut >= 0 ? path.slice(cut + 1) : path;
  const folder = cut >= 0 ? path.slice(0, cut) : '';
  return (
    <span className="notif-step-file" title={path}>
      <span className="notif-step-file-name">{name}</span>
      {folder && <span className="notif-step-file-folder">{folder}</span>}
    </span>
  );
}

function Step({step, index}: {step: JobStep; index: number}) {
  const active = step.state === 'active';
  const lines = step.lines ?? (step.detail ? [step.detail] : []);
  return (
    <li className={`notif-job-step ${step.state}`}>
      <span className="dot" aria-hidden="true">
        {step.state === 'done' ? <Icon name="check" /> : index + 1}
      </span>
      <div className="notif-job-step-body">
        <div className="notif-job-step-row">
          <span className="notif-job-step-title">
            {step.title}
            {step.badge && <span className="notif-step-badge">{step.badge}</span>}
          </span>
          {step.aside && <span className="notif-job-step-aside">{step.aside}</span>}
        </div>
        {active && step.progress !== undefined && (
          <div className={`notif-step-bar${step.progress === null ? ' indeterminate' : ''}`}>
            <span style={step.progress === null ? undefined : {width: `${clamp(step.progress)}%`}} />
          </div>
        )}
        {active && lines.map(line => <span key={line} className="notif-job-step-detail">{line}</span>)}
        {active && step.file && <CurrentFile path={step.file} />}
      </div>
    </li>
  );
}

export function NotifCard({id, data, expanded, onToggle, onDismiss}: NotifCardProps) {
  const steps = data.steps ?? [];
  const expandable = steps.length > 0 && Boolean(onToggle);
  const hasBar = data.progress !== null && data.progress !== undefined || data.spinning;
  const known = typeof data.progress === 'number';

  return (
    <div className={[
      'notif-job',
      `level-${data.level}`,
      data.kind === 'toast' ? 'is-toast' : '',
      steps.length > 0 && (expanded || !onToggle) ? 'expanded' : '',
    ].filter(Boolean).join(' ')}>
      <div
        className={`notif-job-head${expandable ? '' : ' no-expand'}`}
        onClick={expandable ? () => onToggle!(id) : undefined}
        role={expandable ? 'button' : undefined}
        aria-expanded={expandable ? expanded : undefined}
      >
        <span className={`notif-job-icon${data.spinning ? ' spin' : ''}`} aria-hidden="true">
          {data.spinning ? '' : MARKS[data.level]}
        </span>
        <div className="notif-job-body">
          <div className="notif-job-title">{data.title}</div>
          {data.sub && <div className="notif-job-sub">{data.sub}</div>}
        </div>
        {known && <span className="notif-job-percent">{Math.floor(clamp(data.progress!))}%</span>}
        {expandable && <Icon name="chevronDown" className="notif-job-caret" />}
        {onDismiss && (
          <button
            className="notif-job-close"
            type="button"
            title="Скрыть"
            aria-label="Скрыть"
            onClick={event => { event.stopPropagation(); onDismiss(id); }}
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      {hasBar && (
        <div className={`notif-job-bar${!known ? ' indeterminate' : ''}`}>
          <span style={known ? {width: `${clamp(data.progress!)}%`} : undefined} />
        </div>
      )}
      {data.meta && <div className="notif-job-meta">{data.meta}</div>}

      {steps.length > 0 && (
        <div className="notif-job-details">
          <ol className="notif-job-steps">
            {steps.map((step, index) => <Step key={step.title + index} step={step} index={index} />)}
          </ol>
        </div>
      )}

      {data.action && (
        <div className="notif-job-actions">
          <Button variant="primary" small onClick={event => { event.stopPropagation(); data.action!.run(); }}>
            {data.action.label}
          </Button>
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
