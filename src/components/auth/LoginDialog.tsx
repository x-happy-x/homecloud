import {useRef, useState} from 'react';
import './LoginDialog.scss';
import {useMutation} from '@tanstack/react-query';
import {getSession, login} from '../../services/endpoints/session';
import {queryClient} from '../../services/queryClient';
import {useNativeDialog} from '../../hooks/useNativeDialog';
import {useStore} from '../../store';

export function LoginDialog() {
  const open = useStore(state => state.session.needsLogin);
  const bigfamUrl = useStore(state => state.session.bigfamUrl);
  const setSession = useStore(state => state.setSession);
  const dialog = useRef<HTMLDialogElement>(null);
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');

  // Окно входа само не закрывается: без сессии смотреть всё равно нечего.
  useNativeDialog(dialog, open, {onClose: () => {}});

  const submit = useMutation({
    // Ответ входа не знает прав и адреса картотеки — их отдаёт /api/session.
    mutationFn: async () => {
      await login(loginName.trim(), password);
      return getSession();
    },
    onSuccess: session => {
      setPassword('');
      setSession(session);
      queryClient.invalidateQueries();
    },
  });

  return (
    <dialog ref={dialog} className="login-dialog">
      <form
        className="sheet"
        method="dialog"
        onSubmit={event => { event.preventDefault(); submit.mutate(); }}
      >
        <header className="sheet-head">
          <div>
            <p className="eyebrow">Общий вход с картотекой</p>
            <h2>Вход в HomeCloud</h2>
            <p>Логин и пароль — те же, что в BiGFaM.</p>
          </div>
        </header>
        <div className="login-body">
          <label>
            Логин
            <input
              name="login"
              autoComplete="username"
              required
              autoFocus
              value={loginName}
              onChange={event => setLoginName(event.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </label>
          <div className="login-error">
            {submit.isError ? (submit.error as Error).message : ''}
          </div>
          <button className="button primary" type="submit" disabled={submit.isPending}>
            {submit.isPending ? 'Проверяем…' : 'Войти'}
          </button>
          <p className="login-note">
            Учётные записи заводит администратор в{' '}
            <a href={bigfamUrl} target="_blank" rel="noopener">картотеке BiGFaM</a>.
          </p>
        </div>
      </form>
    </dialog>
  );
}
