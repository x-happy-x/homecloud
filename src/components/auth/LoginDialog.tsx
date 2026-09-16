import {useEffect} from 'react';
import {useStore} from '../../store';

/**
 * Окна входа у фототеки больше нет: вход — на странице account. Когда сессии
 * нет (или роли в HomeCloud нет), сервер отправляет туда и возвращает обратно
 * на ту же страницу.
 */
export function LoginDialog() {
  const needsLogin = useStore(state => state.session.needsLogin);

  useEffect(() => {
    if (!needsLogin) return;
    const back = window.location.pathname + window.location.search + window.location.hash;
    window.location.replace(`/auth/start?return=${encodeURIComponent(back)}`);
  }, [needsLogin]);

  return null;
}
