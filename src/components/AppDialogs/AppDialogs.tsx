import {useEffect, useId, useRef, useState} from 'react';
import {closeAppDialog, useAppDialogs, type AppDialogRequest} from '../../services/dialogs';
import {Button} from '../../ui/Button/Button';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {Progress} from '../../ui/Progress/Progress';
import './AppDialogs.scss';

export function AppDialogs() {
  const request = useAppDialogs(state => state.queue[0]);
  return request ? <AppDialog key={request.id} request={request} /> : null;
}

function AppDialog({request}: {request: AppDialogRequest}) {
  const [value, setValue] = useState(request.initialValue ?? '');
  const labelId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const close = () => closeAppDialog(request.id);
  const submit = () => {
    if (request.kind === 'progress') return;
    if (request.kind === 'prompt' && !value.trim()) return;
    closeAppDialog(request.id, request.kind === 'prompt' ? value.trim() : true);
  };
  return (
    <Dialog open onClose={close} className="app-dialog" closeOnBackdrop={false} aria-label={request.title}
      onKeyDown={event => event.stopPropagation()}>
      <Sheet title={request.title} onClose={close} onSubmit={submit} footer={
        <>
          <Button autoFocus={request.kind !== 'prompt'} onClick={close}>Отмена</Button>
          {request.kind !== 'progress' && (
            <Button type="submit" variant={request.danger ? 'danger' : 'primary'}
              disabled={request.kind === 'prompt' && !value.trim()}>
              {request.confirmLabel ?? 'Подтвердить'}
            </Button>
          )}
        </>
      }>
        {request.kind === 'prompt' ? (
          <label className="app-dialog-field">
            <span>{request.message}</span>
            <input ref={input} autoFocus value={value} onChange={event => setValue(event.target.value)}
              onFocus={event => event.currentTarget.select()} />
          </label>
        ) : <p id={labelId} className="app-dialog-message" role={request.kind === 'progress' ? 'status' : undefined}>
          {request.message}
        </p>}
        {request.kind === 'progress' && (
          <div role="progressbar" aria-labelledby={labelId} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={request.progress == null ? undefined : Math.round(request.progress * 100)}>
            <Progress value={request.progress} />
          </div>
        )}
      </Sheet>
    </Dialog>
  );
}
