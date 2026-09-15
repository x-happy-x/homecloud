export const localToken =
  document.querySelector<HTMLMetaElement>('meta[name="local-token"]')?.content || '';

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.method === 'POST') {
    headers.set('Content-Type', 'application/json');
    headers.set('X-Local-Token', localToken);
  }

  const response = await fetch(path, {...options, headers});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in data
      ? String((data as {error?: unknown}).error)
      : `Ошибка ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}
