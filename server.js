// HomeCloud: статика интерфейса, вход через сервис account и прокси на бэкенд Windows.
import { createServer, request as httpRequest } from 'node:http';
import { createGzip } from 'node:zlib';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { dirname, extname, join, normalize, relative as pathRelative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PUBLIC = join(ROOT, 'dist');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4180);
const BACKEND = new URL(process.env.PHOTO_BACKEND || 'http://192.168.1.10:18311');
const BACKEND_TOKEN = process.env.PHOTO_TOKEN || '';
const BACKENDS_FILE = process.env.BACKENDS_FILE || '/var/lib/homecloud/backends.json';
// Картотека bigfam на этом же хосте: она же выдаёт учётные записи и людей.
const BIGFAM = (process.env.BIGFAM_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '');
// Логин, пароль и роль в HomeCloud (access.homecloud.role) проверяет сервис account.
const ACCOUNT = (process.env.ACCOUNT_URL || 'http://127.0.0.1:4160').replace(/\/+$/, '');
const SERVICE_TOKEN = process.env.ACCOUNT_SERVICE_TOKEN || '';
const STATE_COOKIE = 'homecloud_auth';
const SESSION_COOKIE = 'kartoteka_session';
// Браузер получает собственный токен этого процесса; настоящий токен бэкенда
// подставляется только здесь и наружу не уходит.
const BROWSER_TOKEN = randomBytes(24).toString('base64url');
// Метка версии в ссылках на css/js: после публикации браузер не тянет старое из кэша.
const ASSET_VERSION = Date.now().toString(36);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const CSP = "default-src 'self'; img-src 'self' data:; script-src 'self'; " +
  "style-src 'self'; connect-src 'self'; object-src 'none'; " +
  "frame-ancestors 'none'; base-uri 'none'";

function baseHeaders(type, cache = 'no-store') {
  const headers = {
    'Content-Type': type,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };
  if (type.startsWith('text/html')) headers['Content-Security-Policy'] = CSP;
  return headers;
}

function sendJson(response, status, value, extra = {}) {
  const body = Buffer.from(JSON.stringify(value), 'utf-8');
  response.writeHead(status, {...baseHeaders('application/json; charset=utf-8'),
    'Content-Length': body.length, ...extra});
  response.end(body);
}

function allowedHost(request) {
  const host = String(request.headers.host || '').split(':')[0].toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return true;
  // cloud.<домен> — адрес фототеки по соглашению о префиксах (см. appOrigin)
  if (host.startsWith(`${HOST_PREFIXES.homecloud}.`)) return true;
  const parts = host.split('.');
  if (parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) < 256)) {
    const [a, b] = parts.map(Number);
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  }
  return /^[a-z0-9-]+$/.test(host) || host.endsWith('.lan') || host.endsWith('.local');
}

const cookieOf = request => {
  const found = String(request.headers.cookie || '').split(';')
    .map(part => part.trim().split('='))
    .find(([name]) => name === SESSION_COOKIE);
  return found ? decodeURIComponent(found.slice(1).join('=')) : '';
};

function tokenMatches(supplied) {
  const left = Buffer.from(String(supplied || ''));
  const right = Buffer.from(BROWSER_TOKEN);
  return left.length === right.length && timingSafeEqual(left, right);
}

/* ---------- вход через страницу account ---------- */

/*
 * Адреса соседних приложений выводятся из адреса, по которому пришёл браузер,
 * чтобы вход вёл туда же, откуда начался:
 *   домен  cloud.crubs.crazedns.ru -> account.crubs.crazedns.ru, bigfam.crubs.crazedns.ru
 *          cloud.local             -> account.local
 *   IP     192.168.99.20:4180      -> 192.168.99.20:4161, 192.168.99.20:4173
 * За обратным прокси берутся X-Forwarded-Host / -Proto / -Port.
 */
const envOr = (key, fallback) => String(process.env[key] || '').trim() || fallback;
const HOST_PREFIXES = {
  account: envOr('ACCOUNT_HOST_PREFIX', 'account').toLowerCase(),
  bigfam: envOr('BIGFAM_HOST_PREFIX', 'bigfam').toLowerCase(),
  homecloud: envOr('HOMECLOUD_HOST_PREFIX', 'cloud').toLowerCase(),
};
const APP_PORTS = {
  account: Number(envOr('ACCOUNT_LOCAL_PORT', '4161')),
  bigfam: Number(envOr('BIGFAM_LOCAL_PORT', '4173')),
  homecloud: Number(envOr('HOMECLOUD_LOCAL_PORT', '4180')),
};

const firstHeader = value => String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim();
const byAddress = hostname =>
  hostname.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || !hostname.includes('.');

function browserOf(request) {
  const raw = (firstHeader(request.headers['x-forwarded-host']) || firstHeader(request.headers.host)).toLowerCase();
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(raw);
  const hostname = match?.[1] || '';
  let port = match?.[2] || '';
  const address = byAddress(hostname);
  let proto = firstHeader(request.headers['x-forwarded-proto']).toLowerCase();
  if (proto !== 'http' && proto !== 'https') {
    const direct = address || /\.(local|lan|home\.arpa)$/.test(hostname) || Object.values(APP_PORTS).includes(Number(port));
    proto = direct ? 'http' : 'https';
  }
  const forwardedPort = firstHeader(request.headers['x-forwarded-port']);
  if (!port && request.headers['x-forwarded-host'] && /^\d+$/.test(forwardedPort)) port = forwardedPort;
  if ((proto === 'https' && port === '443') || (proto === 'http' && port === '80')) port = '';
  const host = port ? `${hostname}:${port}` : hostname;
  return {hostname, port, proto, address, host, origin: `${proto}://${host}`};
}

function appOrigin(request, app) {
  const browser = browserOf(request);
  if (browser.address) return `http://${browser.hostname}:${APP_PORTS[app]}`;
  const labels = browser.hostname.split('.');
  const rest = Object.values(HOST_PREFIXES).includes(labels[0]) ? labels.slice(1) : labels;
  const port = !browser.port ? '' : Object.values(APP_PORTS).includes(Number(browser.port)) ? String(APP_PORTS[app]) : browser.port;
  return `${browser.proto}://${[HOST_PREFIXES[app], ...rest].join('.')}${port ? `:${port}` : ''}`;
}

const accountUrl = request => `${appOrigin(request, 'account')}/`;
const selfOrigin = request => browserOf(request).origin;

const authCookie = (request, name, value, extra) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; ${extra}${browserOf(request).proto === 'https' ? '; Secure' : ''}`;
const safeReturn = raw => (/^\/(?![/\\])/.test(String(raw || '')) ? String(raw) : '/');

function authPage(response, status, title, text) {
  const esc = value => String(value).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[ch]);
  const body = Buffer.from(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><body><main><h1>${esc(title)}</h1><p>${esc(text)}</p>
<p><a href="/auth/start">Попробовать ещё раз</a></p></main></body>`, 'utf-8');
  response.writeHead(status, {...baseHeaders('text/html; charset=utf-8'), 'Content-Length': body.length});
  response.end(body);
}

async function authRoute(request, response, pathname) {
  const query = new URLSearchParams(request.url.split('?')[1] || '');
  if (pathname === '/auth/start') {
    const account = accountUrl(request);
    const state = randomBytes(18).toString('base64url');
    const back = Buffer.from(safeReturn(query.get('return'))).toString('base64url');
    const target = new URL('authorize', account);
    target.searchParams.set('app', 'homecloud');
    target.searchParams.set('redirect_uri', `${selfOrigin(request)}/auth/callback`);
    target.searchParams.set('state', state);
    console.log(`вход: ${selfOrigin(request)} -> ${target.origin}`);
    response.writeHead(302, {
      Location: target.href, 'Cache-Control': 'no-store',
      'Set-Cookie': authCookie(request, STATE_COOKIE, `${state}.${back}`, 'Max-Age=600'),
    });
    return response.end();
  }

  const saved = String(request.headers.cookie || '').split(';').map(part => part.trim().split('='))
    .find(([name]) => name === STATE_COOKIE)?.[1] || '';
  const [state, back64] = saved.split('.');
  const code = query.get('code');
  if (!state || state !== query.get('state') || !code) {
    return authPage(response, 400, 'Не получилось войти', 'Ссылка входа устарела или открыта в другом браузере.');
  }
  const back = safeReturn(Buffer.from(back64 || '', 'base64url').toString('utf-8'));
  const clearState = authCookie(request, STATE_COOKIE, '', 'Max-Age=0');
  const redirectUri = `${selfOrigin(request)}/auth/callback`;

  let exchanged;
  try {
    const result = await fetch(`${ACCOUNT}/api/service/exchange`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Service-Token': SERVICE_TOKEN},
      body: JSON.stringify({code, app: 'homecloud', redirectUri}),
      signal: AbortSignal.timeout(10000),
    });
    exchanged = await result.json().catch(() => ({}));
    if (!result.ok) throw Object.assign(new Error(exchanged.error || `account ответил ${result.status}`), {status: result.status});
  } catch (error) {
    if (error.status !== 400) console.error('Вход через account:', error.message);
    response.setHeader('Set-Cookie', clearState);
    return authPage(response, error.status === 400 ? 400 : 503, 'Не получилось войти', error.message);
  }

  const user = appUser(exchanged.user);
  if (!atLeast(user, 'viewer')) {
    await accountJson('/api/auth/logout', {method: 'POST', token: exchanged.token}).catch(() => {});
    response.writeHead(302, {Location: `${accountUrl(request)}denied?app=homecloud`, 'Set-Cookie': clearState, 'Cache-Control': 'no-store'});
    return response.end();
  }
  response.writeHead(302, {
    Location: back, 'Cache-Control': 'no-store',
    'Set-Cookie': [clearState, authCookie(request, SESSION_COOKIE, exchanged.token, `Expires=${new Date(exchanged.expires).toUTCString()}`)],
  });
  return response.end();
}

/* ---------- сессии account ---------- */

const RANK = {none: 0, viewer: 1, editor: 2, admin: 3};
const atLeast = (user, role) => !!user && (RANK[user.role] || 0) >= RANK[role];
// Короткий кэш: сессия проверяется у account, но не на каждую миниатюру.
const sessions = new Map();
const FORBIDDEN = 'Нет доступа к HomeCloud — попросите администратора выдать роль';
const CLEAR_COOKIE = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

async function accountJson(path, {token = '', method = 'GET', body = null} = {}) {
  const response = await fetch(`${ACCOUNT}${path}`, {
    method,
    headers: {
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...(body ? {'Content-Type': 'application/json'} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => ({}));
  return {status: response.status, payload, setCookie: response.headers.getSetCookie?.() || []};
}

/** Учётная запись account в виде, который ждёт интерфейс: role — роль в HomeCloud. */
const appUser = user => user && ({
  id: user.id, login: user.login, name: user.name,
  role: user.access?.homecloud?.role || 'none',
  access: user.access,
});

async function bigfamJson(path, {token = '', method = 'GET', body = null} = {}) {
  const response = await fetch(`${BIGFAM}/api${path}`, {
    method,
    headers: {
      ...(token ? {Cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}`} : {}),
      ...(body ? {'Content-Type': 'application/json'} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => ({}));
  return {status: response.status, payload, setCookie: response.headers.getSetCookie?.() || []};
}

async function userOf(request) {
  const token = cookieOf(request);
  if (!token) return null;
  const cached = sessions.get(token);
  if (cached && cached.until > Date.now()) return cached.user;
  try {
    const {status, payload} = await accountJson('/api/auth/me', {token});
    if (status >= 500) throw new Error(payload.error || `account ответил ${status}`);
    const user = status === 200 ? appUser(payload.user) : null;
    sessions.set(token, {user, until: Date.now() + 15000});
    if (sessions.size > 200) sessions.delete(sessions.keys().next().value);
    return user;
  } catch (error) {
    console.error('account недоступен:', error.message);
    throw error;
  }
}

const dropSession = request => sessions.delete(cookieOf(request));

const backendJson = async path => backendCall(await primaryBackend(), path);

const personName = person =>
  [person.last, person.first, person.middle].filter(Boolean).join(' ') || 'Без имени';

/* ---------- реестр устройств ---------- */

const defaultBackend = () => ({
  id: 'pc-x', name: 'PC-X', url: BACKEND.origin, token: BACKEND_TOKEN, primary: true,
});

function validBackend(value, currentToken = '') {
  const url = new URL(String(value.url || ''));
  if (url.protocol !== 'http:') throw new Error('Backend должен использовать http в домашней сети');
  const host = url.hostname.toLowerCase();
  const parts = host.split('.').map(Number);
  const privateIp = parts.length === 4 && (parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
  if (!(privateIp || host === 'localhost' || host.endsWith('.lan') || host.endsWith('.local'))) {
    throw new Error('Разрешены только адреса домашней сети');
  }
  const id = String(value.id || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(id)) throw new Error('Некорректный ID устройства');
  const name = String(value.name || '').trim();
  if (!name || name.length > 80) throw new Error('Укажите имя устройства');
  const token = String(value.token || '') || currentToken;
  if (!token) throw new Error('Укажите токен backend');
  return {id, name, url: url.origin, token, primary: !!value.primary};
}

async function loadBackends() {
  try {
    const rows = JSON.parse(await readFile(BACKENDS_FILE, 'utf-8'));
    return Array.isArray(rows) && rows.length ? rows : [defaultBackend()];
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Не удалось прочитать реестр backend:', error.message);
    return [defaultBackend()];
  }
}

async function saveBackends(rows) {
  await mkdir(dirname(BACKENDS_FILE), {recursive: true});
  const temporary = `${BACKENDS_FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(rows, null, 2), {mode: 0o600});
  await rename(temporary, BACKENDS_FILE);
}

const publicBackend = backend => ({
  id: backend.id, name: backend.name, url: backend.url,
  primary: !!backend.primary, hasToken: !!backend.token,
});

async function backendCall(backend, path, {method = 'GET', body = null} = {}) {
  const response = await fetch(`${backend.url}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? {'Content-Type': 'application/json'} : {}),
      ...(method === 'POST' ? {'X-Local-Token': backend.token} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(method === 'POST' ? 30000 : 8000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `backend ответил ${response.status}`);
  return payload;
}

async function backendById(id) {
  const found = (await loadBackends()).find(item => item.id === id);
  if (!found) throw new Error('Устройство не найдено');
  return found;
}

async function primaryBackend() {
  const rows = await loadBackends();
  return rows.find(item => item.primary) || rows[0] || defaultBackend();
}

/* ---------- прокси на бэкенд Windows ---------- */

async function proxy(request, response, pathname, user = null) {
  const backend = await primaryBackend();
  const target = new URL(backend.url);
  const isWrite = request.method === 'POST';
  // Кто смотрит, знает только этот процесс: он держит сессии картотеки.
  // Заголовки ставим сами, что бы ни прислал браузер — свои скрытые альбомы
  // иначе открывались бы подделкой заголовка.
  const headers = {
    'Host': target.host,
    'Accept': request.headers.accept || '*/*',
    'X-HomeCloud-User': encodeURIComponent(user?.login || user?.id || ''),
    'X-HomeCloud-Role': user?.role || '',
  };
  if (request.headers['content-type']) headers['Content-Type'] = request.headers['content-type'];
  if (request.headers['content-length']) headers['Content-Length'] = request.headers['content-length'];
  if (request.headers.range) headers['Range'] = request.headers.range;
  if (isWrite && backend.token) headers['X-Local-Token'] = backend.token;

  const query = request.url.includes('?') ? '?' + request.url.split('?').slice(1).join('?') : '';
  const upstream = httpRequest({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: request.method,
    path: pathname + query,
    headers,
  }, backendResponse => {
    const out = {...backendResponse.headers};
    delete out.connection;
    delete out['transfer-encoding'];
    // JSON галереи (страницы снимков, группы папок) сжимается в разы; медиа не трогаем.
    const gzip = /gzip/.test(String(request.headers['accept-encoding'] || ''))
      && String(out['content-type'] || '').startsWith('application/json')
      && !out['content-encoding']
      && Number(out['content-length'] || 0) > 4096;
    if (gzip) {
      delete out['content-length'];
      out['content-encoding'] = 'gzip';
      out.vary = 'Accept-Encoding';
      response.writeHead(backendResponse.statusCode || 502, out);
      backendResponse.pipe(createGzip()).pipe(response);
      return;
    }
    response.writeHead(backendResponse.statusCode || 502, out);
    backendResponse.pipe(response);
  });
  upstream.setTimeout(120000, () => upstream.destroy(new Error('таймаут бэкенда')));
  upstream.on('error', error => {
    if (response.headersSent) return response.destroy();
    sendJson(response, 502, {
      error: `Бэкенд HomeCloud недоступен (${target.host}): ${error.message}`,
    });
  });
  request.pipe(upstream);
}

const readBody = request => new Promise((done, fail) => {
  const chunks = [];
  let size = 0;
  request.on('data', chunk => {
    size += chunk.length;
    if (size > 64 * 1024) { request.destroy(); fail(new Error('Запрос слишком большой')); }
    chunks.push(chunk);
  });
  request.on('end', () => {
    try { done(JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')); }
    catch { fail(new Error('Некорректный JSON')); }
  });
  request.on('error', fail);
});

/* ---------- статика ---------- */

async function sendStatic(response, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const target = resolve(join(PUBLIC, normalize(relative)));
  const insidePublic = pathRelative(PUBLIC, target);
  if (insidePublic.startsWith('..') || insidePublic === '..' || resolve(target) === PUBLIC) {
    return sendJson(response, 404, {error: 'Страница не найдена'});
  }
  let info;
  try {
    info = await stat(target);
  } catch {
    return pathname === '/'
      ? sendJson(response, 404, {error: 'Страница не найдена'})
      : sendStatic(response, '/');
  }
  if (!info.isFile()) return sendJson(response, 404, {error: 'Страница не найдена'});
  const type = TYPES[extname(target).toLowerCase()] || 'application/octet-stream';
  let body = await readFile(target);
  if (target.endsWith('index.html')) {
    body = Buffer.from(body.toString('utf-8')
      .replaceAll('__LOCAL_TOKEN__', BROWSER_TOKEN)
      .replaceAll('__ASSET_VERSION__', ASSET_VERSION), 'utf-8');
  }
  const cache = target.endsWith('index.html') ? 'no-store' : 'private, max-age=300';
  response.writeHead(200, {...baseHeaders(type, cache), 'Content-Length': body.length});
  response.end(body);
}

/* ---------- маршруты ---------- */

async function handle(request, response) {
  if (!allowedHost(request)) return sendJson(response, 403, {error: 'Недопустимый Host'});
  const pathname = (request.url || '/').split('?')[0];
  const method = request.method;
  const isApi = pathname.startsWith('/api/') || pathname.startsWith('/media/');

  if (pathname === '/healthz') {
    return sendJson(response, 200, {ok: true, backend: BACKEND.origin, bigfam: BIGFAM, account: ACCOUNT});
  }

  if (pathname === '/auth/start' || pathname === '/auth/callback') {
    if (method !== 'GET') return sendJson(response, 405, {error: 'Метод не поддерживается'});
    return authRoute(request, response, pathname);
  }

  if (!isApi) {
    if (method !== 'GET') return sendJson(response, 405, {error: 'Метод не поддерживается'});
    return sendStatic(response, pathname);
  }
  if (method !== 'GET' && method !== 'POST') {
    return sendJson(response, 405, {error: 'Метод не поддерживается'});
  }

  // Изменяющие запросы: свой Origin и токен страницы — до любой работы.
  if (method === 'POST') {
    const origin = request.headers.origin;
    if (origin && origin !== `http://${request.headers.host}` && origin !== selfOrigin(request)) {
      return sendJson(response, 403, {error: 'Недопустимый Origin'});
    }
    if (!tokenMatches(request.headers['x-local-token'])) {
      return sendJson(response, 403, {error: 'Неверный локальный токен'});
    }
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(request);
    const {status, payload, setCookie} = await accountJson('/api/auth/login', {
      method: 'POST', body: {login: body.login, password: body.password},
    });
    if (status !== 200) return sendJson(response, status, {error: payload.error || 'Вход не удался'});
    const user = appUser(payload.user);
    if (!atLeast(user, 'viewer')) {
      // Пароль верный, но роли в HomeCloud нет: сессию сразу закрываем.
      const token = /^kartoteka_session=([^;]*)/.exec(setCookie[0] || '')?.[1];
      if (token) await accountJson('/api/auth/logout', {method: 'POST', token}).catch(() => {});
      return sendJson(response, 403, {error: FORBIDDEN, auth: 'forbidden'});
    }
    return sendJson(response, 200, {user}, setCookie.length ? {'Set-Cookie': setCookie} : {});
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = cookieOf(request);
    sessions.delete(token);
    if (token) await accountJson('/api/auth/logout', {method: 'POST', token}).catch(() => {});
    const redirect = `${accountUrl(request)}logout?return=${encodeURIComponent(`${selfOrigin(request)}/`)}`;
    return sendJson(response, 200, {ok: true, redirect}, {'Set-Cookie': CLEAR_COOKIE});
  }

  let user;
  try {
    user = await userOf(request);
  } catch {
    return sendJson(response, 503, {error: 'Сервис учётных записей недоступен — попробуйте чуть позже'});
  }
  const bigfamUrl = `${appOrigin(request, 'bigfam')}/`;

  // Cookie не трогаем: на одном хосте он общий с картотекой, а там роль может быть.
  if (user && !atLeast(user, 'viewer')) {
    return sendJson(response, 403, {error: FORBIDDEN, auth: 'forbidden', user: null, bigfamUrl, accountUrl: accountUrl(request)});
  }

  if (method === 'GET' && pathname === '/api/session') {
    return sendJson(response, 200, {
      user,
      canEdit: atLeast(user, 'editor'),
      bigfamUrl,
      accountUrl: accountUrl(request),
    });
  }

  if (!user) return sendJson(response, 401, {error: 'Нужно войти в картотеку', auth: 'required'});
  if (method === 'POST' && !atLeast(user, 'editor')) {
    return sendJson(response, 403, {error: 'У вас доступ только на просмотр'});
  }

  if (method === 'GET' && pathname === '/api/bigfam/people') {
    try {
      const {status, payload} = await bigfamJson('/graph', {token: cookieOf(request)});
      if (status !== 200) {
        dropSession(request);
        return sendJson(response, status, {error: payload.error || 'Картотека не ответила'});
      }
      const people = (payload.people || []).map(person => ({
        id: person.id,
        name: personName(person),
        // Части имени нужны интерфейсу: он показывает «Имя Ф.О.».
        first: person.first || '',
        last: person.last || '',
        middle: person.middle || '',
        birth: person.birth || '',
        death: person.death || '',
        deceased: !!person.deceased,
        sex: person.sex || '',
        avatar: person.hasPhoto ? `/media/bigfam/${person.id}?rev=${person.photoRev || 0}` : '',
      })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      return sendJson(response, 200, {people});
    } catch (error) {
      return sendJson(response, 502, {error: `Картотека недоступна: ${error.message}`});
    }
  }

  if (method === 'GET' && pathname === '/api/backends') {
    const rows = await loadBackends();
    const devices = await Promise.all(rows.map(async backend => {
      try {
        const [device, job] = await Promise.all([
          backendCall(backend, '/api/device'), backendCall(backend, '/api/device/job'),
        ]);
        return {...publicBackend(backend), online: true, device, job};
      } catch (error) {
        return {...publicBackend(backend), online: false, error: error.message};
      }
    }));
    return sendJson(response, 200, {backends: devices});
  }

  if (method === 'POST' && pathname === '/api/backends/save') {
    const body = await readBody(request);
    const rows = await loadBackends();
    const index = rows.findIndex(item => item.id === String(body.id || '').toLowerCase());
    const backend = validBackend(body, index >= 0 ? rows[index].token : '');
    if (index >= 0) rows[index] = backend; else rows.push(backend);
    if (backend.primary) rows.forEach(item => { item.primary = item.id === backend.id; });
    await saveBackends(rows);
    return sendJson(response, 200, {ok: true, backend: publicBackend(backend)});
  }

  if (method === 'POST' && pathname === '/api/backends/remove') {
    const body = await readBody(request);
    const rows = await loadBackends();
    const next = rows.filter(item => item.id !== body.id);
    if (next.length === rows.length) return sendJson(response, 404, {error: 'Устройство не найдено'});
    if (!next.length) return sendJson(response, 400, {error: 'Нельзя удалить последнее устройство'});
    if (!next.some(item => item.primary)) next[0].primary = true;
    await saveBackends(next);
    return sendJson(response, 200, {ok: true});
  }

  const deviceRoute = /^\/api\/backends\/([a-z0-9_-]+)\/(browse|tree|exclusions|history|history\/forget|job\/start|job\/stop)$/.exec(pathname);
  if (deviceRoute) {
    const backend = await backendById(deviceRoute[1]);
    // Источники прошлых заданий: по ним потом гоняют другие этапы.
    if (method === 'GET' && deviceRoute[2] === 'history') {
      return sendJson(response, 200, await backendCall(backend, '/api/device/history'));
    }
    if (method === 'POST' && deviceRoute[2] === 'history/forget') {
      return sendJson(response, 200, await backendCall(
        backend, '/api/device/history/forget', {method: 'POST', body: await readBody(request)}));
    }
    // Дерево описи и исключения: их правят перед запуском этапов.
    if (method === 'GET' && deviceRoute[2] === 'tree') {
      const path = new URLSearchParams(request.url.split('?')[1] || '').get('path') || '';
      return sendJson(response, 200, await backendCall(
        backend, `/api/device/tree?path=${encodeURIComponent(path)}`));
    }
    if (method === 'POST' && deviceRoute[2] === 'exclusions') {
      return sendJson(response, 200, await backendCall(
        backend, '/api/device/exclusions', {method: 'POST', body: await readBody(request)}));
    }
    if (method === 'GET' && deviceRoute[2] === 'browse') {
      const path = new URLSearchParams(request.url.split('?')[1] || '').get('path') || '';
      return sendJson(response, 200, await backendCall(
        backend, `/api/device/browse?path=${encodeURIComponent(path)}`));
    }
    if (method === 'POST' && deviceRoute[2] === 'job/start') {
      return sendJson(response, 200, await backendCall(
        backend, '/api/device/job/start', {method: 'POST', body: await readBody(request)}));
    }
    if (method === 'POST' && deviceRoute[2] === 'job/stop') {
      return sendJson(response, 200, await backendCall(
        backend, '/api/device/job/stop', {method: 'POST', body: {}}));
    }
    return sendJson(response, 405, {error: 'Метод не поддерживается'});
  }

  // Снимки одного человека для картотеки: она зовёт этот адрес, когда выбирают аватарку.
  if (method === 'GET' && pathname === '/api/link/photos') {
    const wanted = new URLSearchParams(request.url.split('?')[1] || '').get('bigfam_id') || '';
    if (!wanted) return sendJson(response, 400, {error: 'Не указан bigfam_id'});
    try {
      const state = await backendJson('/api/state');
      const group = (state.groups || []).find(
        item => item.kind === 'person' && item.bigfam_id === wanted);
      if (!group) return sendJson(response, 200, {linked: false, name: '', photos: []});
      const full = await backendJson(`/api/group?key=${encodeURIComponent(group.key)}`);
      const photos = (full.faces || []).slice(0, 60).map(face => ({
        faceId: face.id,
        filename: face.filename,
        path: face.path,
        confidence: face.confidence,
        face: `/media/thumb/${face.id}`,
        crop: `/media/face-crop/${face.id}`,
        photo: `/media/original/${face.id}`,
      }));
      return sendJson(response, 200, {linked: true, name: group.name, photos});
    } catch (error) {
      return sendJson(response, 502, {error: `Бэкенд HomeCloud недоступен: ${error.message}`});
    }
  }

  const avatar = /^\/media\/bigfam\/([\w-]+)$/.exec(pathname);
  if (method === 'GET' && avatar) {
    try {
      const upstream = await fetch(`${BIGFAM}/api/people/${avatar[1]}/photo`, {
        headers: {Cookie: `${SESSION_COOKIE}=${encodeURIComponent(cookieOf(request))}`},
        signal: AbortSignal.timeout(10000),
      });
      if (!upstream.ok) return sendJson(response, upstream.status, {error: 'Портрет не найден'});
      const buffer = Buffer.from(await upstream.arrayBuffer());
      response.writeHead(200, {
        ...baseHeaders(upstream.headers.get('content-type') || 'image/jpeg', 'private, max-age=3600'),
        'Content-Length': buffer.length,
      });
      return response.end(buffer);
    } catch (error) {
      return sendJson(response, 502, {error: `Картотека недоступна: ${error.message}`});
    }
  }

  return proxy(request, response, pathname, user);
}

const server = createServer((request, response) => {
  handle(request, response).catch(error => {
    console.error(`${request.method} ${request.url}: ${error.message}`);
    if (!response.headersSent) sendJson(response, 500, {error: error.message});
  });
});

server.listen(PORT, HOST, () => {
  console.log(`HomeCloud: http://${HOST === '0.0.0.0' ? '192.168.99.10' : HOST}:${PORT}/`);
  console.log(`Бэкенд: ${BACKEND.origin}${BACKEND_TOKEN ? '' : ' (PHOTO_TOKEN не задан — изменения будут отклонены)'}`);
  console.log(`Картотека: ${BIGFAM}`);
});
