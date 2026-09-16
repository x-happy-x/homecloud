import {useRef, useState} from 'react';
import './AccountMenu.scss';
import {useMutation} from '@tanstack/react-query';
import {logout} from '../../services/endpoints/session';
import {queryClient} from '../../services/queryClient';
import {Icon} from '../../ui/Icon/Icon';
import {Popover} from '../../ui/Popover/Popover';
import {useStore} from '../../store';

const ROLES: Record<string, string> = {
  admin: 'Администратор',
  editor: 'Редактор',
  viewer: 'Наблюдатель',
};

/**
 * Учётная запись стоит рядом с уведомлениями: в шапке от неё нужен только
 * кружок с буквой, а имя, роль и выход живут во всплывашке.
 */
export function AccountMenu() {
  const session = useStore(state => state.session);
  const setSession = useStore(state => state.setSession);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const leave = useMutation({
    mutationFn: logout,
    // Даже если выход не удался, сессию на своей стороне считаем закрытой.
    onSettled: () => {
      setOpen(false);
      setSession(null);
      queryClient.clear();
    },
  });

  const user = session.user;
  const name = user ? (user.name || user.login) : 'Гость';
  const role = user ? (ROLES[user.role] ?? user.role) : 'вход не выполнен';

  return (
    <>
      <button
        ref={button}
        className="account"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${name} · ${role}`}
        aria-label={`Учётная запись: ${name}`}
        onClick={() => setOpen(current => !current)}
      >
        <span className="account-avatar">{name.trim().charAt(0).toUpperCase() || '?'}</span>
      </button>

      <Popover
        open={open}
        anchor={button}
        onClose={() => setOpen(false)}
        className="menu"
      >
        <div className="menu-head">
          <strong>{name}</strong>
          <span>{user ? user.login : 'вход не выполнен'}</span>
          <span className="account-role">{role}</span>
        </div>
        <hr />
        <a href={session.bigfamUrl} target="_blank" rel="noopener" role="menuitem">
          <Icon name="openExternal" />
          Открыть картотеку
        </a>
        <button type="button" role="menuitem" onClick={() => leave.mutate()}>
          <Icon name="logout" />
          Выйти
        </button>
      </Popover>
    </>
  );
}
