import type {StateCreator} from 'zustand';
import type {SessionUser} from '../../types/api';
import type {Store} from '../index';

export interface SessionSlice {
  session: {
    user: SessionUser | null;
    /** Роль viewer читает, но ничего не меняет — по этому флагу прячутся действия. */
    canEdit: boolean;
    isAdmin: boolean;
    bigfamUrl: string;
    /** Сессия истекла: поднять окно входа. */
    needsLogin: boolean;
  };
  setSession(user: SessionUser | null, bigfamUrl?: string): void;
  requireLogin(): void;
}

export const createSessionSlice: StateCreator<Store, [], [], SessionSlice> = set => ({
  session: {user: null, canEdit: false, isAdmin: false, bigfamUrl: '#', needsLogin: false},

  setSession: (user, bigfamUrl) => set(state => ({
    session: {
      user,
      canEdit: Boolean(user) && user?.role !== 'viewer',
      isAdmin: user?.role === 'admin',
      bigfamUrl: bigfamUrl ?? state.session.bigfamUrl,
      needsLogin: !user,
    },
  })),

  requireLogin: () => set(state => ({session: {...state.session, needsLogin: true}})),
});
