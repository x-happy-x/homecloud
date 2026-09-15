import {api, post} from '../api';
import type {KinPerson, SessionResponse, SessionUser} from '../../types/api';

export const getSession = () => api<SessionResponse>('/api/session');

// Картотека читает поле login: с полем name вход всегда отвечал отказом.
export const login = (loginName: string, password: string) =>
  post<{user: SessionUser}>('/api/auth/login', {login: loginName, password});

export const logout = () => post('/api/auth/logout');

/** Люди картотеки bigfam — из них выбирается имя для группы лиц. */
export const getKin = () =>
  api<{people: KinPerson[]}>('/api/bigfam/people').then(data => data.people ?? []);
