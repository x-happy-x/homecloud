/**
 * Токен подставляет сам сервер при отдаче index.html (server.js заменяет в нём
 * __LOCAL_TOKEN__), поэтому читать его можно только из живого документа —
 * на этапе сборки его ещё нет.
 */
const localToken = (): string =>
  document.querySelector<HTMLMetaElement>('meta[name="local-token"]')?.content ?? '';

/** Сессия истекла. Ловится один раз на уровне QueryClient и поднимает вход. */
export class AuthRequiredError extends Error {
  constructor() {
    super('Нужно войти');
    this.name = 'AuthRequiredError';
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.method === 'POST') {
    headers.set('Content-Type', 'application/json');
    // Изменяющие запросы проверяются по X-Local-Token; на GET он не нужен.
    headers.set('X-Local-Token', localToken());
  }

  const response = await fetch(path, {...options, headers});
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;

  if (response.status === 401 && data.auth === 'required') throw new AuthRequiredError();
  if (!response.ok) {
    throw new ApiError(String(data.error || `Ошибка ${response.status}`), response.status);
  }
  return data as T;
}

export const post = <T = unknown>(path: string, payload?: unknown): Promise<T> =>
  api<T>(path, {method: 'POST', body: JSON.stringify(payload ?? {})});

/** Собирает строку запроса, выбрасывая пустые значения. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
