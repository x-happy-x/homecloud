import {api, post, query} from '../api';

export const getRouterSummary = () => api<Record<string, unknown>>('/api/router/summary');
export const getRouterStatus = () => api<{active: boolean} & Record<string, unknown>>('/api/router/status');

export const getRouterReview = (hideAdult: boolean, limit = 24) =>
  api<{queue: Array<Record<string, unknown>>}>(
    `/api/router/review${query({limit, adult: hideAdult ? 'hide' : ''})}`);

export const runRouter = (action: 'bootstrap' | 'train') => post(`/api/router/${action}`);
export const saveRouterLabel = (payload: Record<string, unknown>) => post('/api/router/label', payload);
export const activateRouterModel = (payload: Record<string, unknown>) =>
  post('/api/router/activate', payload);
