import type {StateCreator} from 'zustand';
import type {SessionResponse, SessionUser} from '../../types/api';
import type {Store} from '../index';

export interface SessionSlice {
  session: {
    user: SessionUser | null;
    /** Роль viewer читает, но ничего не меняет — по этому флагу прячутся действия. */
    canEdit: boolean;
    isAdmin: boolean;
    bigfamUrl: string;
    /** Страница учётной записи в account. */
    accountUrl: string;
    /** Сессия истекла: поднять окно входа. */
    needsLogin: boolean;
  };
  /** Ответ /api/session целиком; null — выход. */
  setSession(response: SessionResponse | null): void;
  requireLogin(): void;
}

export const createSessionSlice: StateCreator<Store, [], [], SessionSlice> = set => ({
  session: {user: null, canEdit: false, isAdmin: false, bigfamUrl: '#', accountUrl: '', needsLogin: false},

  setSession: response => set(state => {
    const user = response?.user ?? null;
    return {
      session: {
        user,
        // Права решает server.js; по роли — только если он промолчал.
        canEdit: Boolean(user) && (response?.canEdit ?? user?.role !== 'viewer'),
        isAdmin: user?.role === 'admin',
        bigfamUrl: response?.bigfamUrl ?? state.session.bigfamUrl,
        accountUrl: response?.accountUrl ?? state.session.accountUrl,
        needsLogin: !user,
      },
    };
  }),

  requireLogin: () => set(state => ({session: {...state.session, needsLogin: true}})),
});
