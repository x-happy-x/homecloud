import {api, post} from '../api';
import type {KinPerson, SessionResponse} from '../../types/api';

export const getSession = () => api<SessionResponse>('/api/session');

export const login = (name: string, password: string) =>
  post<SessionResponse>('/api/auth/login', {name, password});

export const logout = () => post('/api/auth/logout');

/** Люди картотеки bigfam — из них выбирается имя для группы лиц. */
export const getKin = () =>
  api<{people: KinPerson[]}>('/api/bigfam/people').then(data => data.people ?? []);
