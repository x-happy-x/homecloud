const token = document.querySelector('meta[name="local-token"]').content;

const ui = {
  session: null,
  canEdit: false,
  bigfamUrl: '#',
  state: null,
  kin: null,            // люди из картотеки bigfam
  view: 'people',
  selectedGroups: new Set(),
  selectedFaces: new Set(),
  lightboxSelectedFaces: new Set(),
  selectedPeople: new Set(),
  selectedContentType: '',
  selectedKind: '',
  settings: null,
  visualModels: [],
  hidden: false,
  hiddenCount: 0,
  duplicates: [],
  dupTotal: 0,
  dupKeep: {},
  dupSkip: new Set(),
  dupJob: null,
  folder: '',
  folderDeep: true,
  folderTrail: [],
  folderItems: [],
  album: 0,
  albums: [],
  albumPaths: [],
  sidepageTab: localStorage.getItem('homecloud-sidepage-tab') || 'people',
  showBlurry: false,
  showAdult: false,
  adultMode: localStorage.getItem('homecloud-adult-mode') || 'explicit',
  currentGroup: null,
  similar: {group: null, similar: []},
  pairs: [],
  similarNamedOnly: false,
  photos: [],
  photoTotal: 0,
  photosLoading: false,
  selectedPhotos: new Set(),
  processPaths: [],
  photoJobActive: false,
  lightboxIndex: 0,
  viewerIsFaces: false,
  viewerFaces: null,
  savedGallery: null,
  speechCache: new Map(),
  faceViewerCache: null,
  zoom: localStorage.getItem('homecloud-zoom') || 'medium',
  viewerInfo: false,
  viewerChrome: true,
  devices: [],
  scanDeviceId: null,
  browsePath: '',
  browseParent: null,
  selectedRoots: new Set(),
  selectedPaths: [],
  scanHistory: [],
  treeNodes: new Map(),
  treeOpen: new Set(),
  treeBusy: false,
  selectedFeatures: {faces: true, visual: true, ocr: false, caption: false,
    adult: false, speech: false, diarize: false},
  routePhoto: '',
  routeGroup: '',
  applyingRoute: false,
  activeProcessingId: '',
  router: null,
  routerQueue: [],
  routerIndex: 0,
  routerJob: null,
  routerDrafts: new Map(),
  jobTiming: new Map(),
  etaProfiles: {},
  timers: {},
};

try { ui.etaProfiles = JSON.parse(localStorage.getItem('homecloud-eta-profiles') || '{}'); }
catch { ui.etaProfiles = {}; }

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const formatNumber = value => new Intl.NumberFormat('ru-RU').format(Number(value || 0));
const plural = (value, one, few, many) => {
  const n = Math.abs(value) % 100;
  if (n > 10 && n < 20) return many;
  const last = n % 10;
  return last === 1 ? one : last >= 2 && last <= 4 ? few : many;
};

async function api(path, options = {}) {
  const headers = {...(options.headers || {})};
  if (options.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    headers['X-Local-Token'] = token;
  }
  const response = await fetch(path, {...options, headers});
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && data.auth === 'required') {
    showLogin();
    throw new Error('Нужно войти');
  }
  if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
  return data;
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 3000);
}

/* ---------- вход ---------- */

function showLogin() {
  const dialog = $('#loginDialog');
  if (!dialog.open) {
    $('#loginError').textContent = '';
    dialog.showModal();
    setTimeout(() => $('#loginName').focus(), 50);
  }
}

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#loginSubmit');
  button.disabled = true;
  $('#loginError').textContent = '';
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({login: $('#loginName').value, password: $('#loginPassword').value}),
    });
    $('#loginPassword').value = '';
    $('#loginDialog').close();
    await boot();
  } catch (error) {
    $('#loginError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

function renderAccount() {
  const user = ui.session;
  const name = user ? (user.name || user.login) : 'Гость';
  const roles = {admin: 'Администратор', editor: 'Редактор', viewer: 'Наблюдатель'};
  $('#accountName').textContent = name;
  $('#accountRole').textContent = user ? (roles[user.role] || user.role) : 'не выполнен вход';
  $('#accountAvatar').textContent = name.trim().charAt(0).toUpperCase() || '?';
  $('#bigfamLink').href = ui.bigfamUrl;
  // Наблюдателю нечего нажимать — прячем всё, что меняет каталог.
  $$('#assignGroupsButton, #assignWholeGroup, #assignSelectedFaces, #excludeSelectedFaces, ' +
     '#addBackendButton, #processSelectedPhotos, #deleteSelectedPhotos, ' +
     '#processLightboxPhoto, #deleteLightboxPhoto, #undoButton, #peopleHint, #reclusterButton')
    .forEach(element => element.classList.toggle('hidden', !ui.canEdit));
  $('#dialogToolbar').classList.toggle('hidden', !ui.canEdit);
}

$('#accountButton').addEventListener('click', event => {
  const open = $('#accountMenu');
  if (open) return open.remove();
  const user = ui.session;
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.id = 'accountMenu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <div class="menu-head"><strong>${escapeHtml(user ? (user.name || user.login) : 'Гость')}</strong>
      <span>${escapeHtml(user ? user.login : 'вход не выполнен')}</span></div>
    <hr>
    <a href="${escapeHtml(ui.bigfamUrl)}" target="_blank" rel="noopener" role="menuitem">
      <svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7ZM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7Z"/></svg>
      Открыть картотеку</a>
    <button id="logoutButton" role="menuitem">
      <svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5-5-5ZM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5Z"/></svg>
      Выйти</button>`;
  document.body.append(menu);
  const box = event.currentTarget.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(box.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, box.top - menu.offsetHeight - 8)}px`;
  $('#logoutButton').addEventListener('click', async () => {
    menu.remove();
    try { await api('/api/auth/logout', {method: 'POST', body: '{}'}); } catch { /* всё равно выходим */ }
    ui.session = null;
    ui.canEdit = false;
    renderAccount();
    showLogin();
  });
  setTimeout(() => document.addEventListener('click', function close(clickEvent) {
    if (!menu.contains(clickEvent.target)) { menu.remove(); document.removeEventListener('click', close); }
  }), 0);
});

/* ---------- выбор человека: каталог + картотека ---------- */

async function loadKin() {
  if (ui.kin) return ui.kin;
  try {
    const data = await api('/api/bigfam/people');
    ui.kin = data.people || [];
  } catch (error) {
    ui.kin = [];
    console.warn('Картотека недоступна:', error.message);
  }
  // Годы жизни на карточках живут в картотеке — она приезжает позже состояния.
  if (ui.state && ui.kin.length) { renderPeople(); renderReview(); }
  return ui.kin;
}

function avatarMarkup(person) {
  if (person && person.avatar) {
    return `<img class="kin-avatar" src="${escapeHtml(person.avatar)}" alt="" loading="lazy">`;
  }
  const letter = escapeHtml((person && person.name ? person.name : '?').trim().charAt(0).toUpperCase());
  return `<span class="kin-dot" aria-hidden="true">${letter || '?'}</span>`;
}

function createPicker(container, placeholder) {
  container.innerHTML = `
    <div class="picker-field">
      <span class="picker-avatar"></span>
      <input type="text" placeholder="${escapeHtml(placeholder)}" autocomplete="off" aria-label="${escapeHtml(placeholder)}">
      <button class="picker-toggle" type="button" aria-label="Показать список">
        <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7Z"/></svg>
      </button>
    </div>
    <div class="picker-list hidden"></div>`;

  const input = container.querySelector('input');
  const list = container.querySelector('.picker-list');
  const avatar = container.querySelector('.picker-avatar');
  const state = {bigfamId: null, cursor: -1, options: []};

  const setAvatar = person => { avatar.innerHTML = person ? avatarMarkup(person) : ''; };

  function options() {
    const query = input.value.trim().toLocaleLowerCase('ru');
    const known = (ui.state ? ui.state.people : []).map(person => ({
      id: person.bigfam_id || null, name: person.name, source: 'catalog',
      meta: `${person.count} ${plural(person.count, 'лицо', 'лица', 'лиц')} в каталоге`,
      avatar: person.bigfam_id ? `/media/bigfam/${person.bigfam_id}` : '',
    }));
    const kin = (ui.kin || []).map(person => ({
      id: person.id, name: person.name, source: 'kin', avatar: person.avatar,
      meta: [person.birth, person.deceased ? '† ' + (person.death || '') : ''].filter(Boolean).join(' · ')
            || 'из картотеки',
    }));
    const seen = new Set(known.map(person => person.name.toLocaleLowerCase('ru')));
    const merged = [...known, ...kin.filter(person => !seen.has(person.name.toLocaleLowerCase('ru')))];
    return merged.filter(person => !query || person.name.toLocaleLowerCase('ru').includes(query)).slice(0, 60);
  }

  function draw() {
    state.options = options();
    if (!state.options.length) {
      list.innerHTML = `<div class="picker-empty">${ui.kin && ui.kin.length
        ? 'Никто не подошёл — имя будет создано как новое'
        : 'Картотека пуста или недоступна — имя будет создано как новое'}</div>`;
      return;
    }
    let lastSource = '';
    list.innerHTML = state.options.map((person, index) => {
      const head = person.source !== lastSource
        ? `<div class="picker-head">${person.source === 'catalog' ? 'Уже в HomeCloud' : 'Картотека BiGFaM'}</div>`
        : '';
      lastSource = person.source;
      return `${head}<button class="picker-option ${index === state.cursor ? 'cursor' : ''}" type="button" data-index="${index}">
        ${avatarMarkup(person)}
        <span class="body"><span class="name">${escapeHtml(person.name)}</span>
          <span class="meta">${escapeHtml(person.meta || '')}</span></span>
        ${person.id && person.id === state.bigfamId ? '<span class="tick">✓</span>' : ''}
      </button>`;
    }).join('');
    dropBrokenAvatars(list);
    list.querySelectorAll('.picker-option').forEach(button => {
      button.addEventListener('mousedown', event => {
        event.preventDefault();
        pick(state.options[Number(button.dataset.index)]);
      });
    });
  }

  function place() {
    const box = container.getBoundingClientRect();
    list.classList.toggle('below', box.top < innerHeight / 2);
  }

  function open() {
    loadKin().then(() => { draw(); });
    draw();
    place();
    list.classList.remove('hidden');
  }

  const close = () => { list.classList.add('hidden'); state.cursor = -1; };

  function pick(person) {
    if (!person) return;
    input.value = person.name;
    state.bigfamId = person.id || null;
    setAvatar(person);
    close();
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', () => {
    state.bigfamId = null;
    setAvatar(null);
    state.cursor = -1;
    if (list.classList.contains('hidden')) open(); else draw();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.classList.contains('hidden')) return open();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      state.cursor = (state.cursor + step + state.options.length) % (state.options.length || 1);
      draw();
      list.querySelector('.picker-option.cursor')?.scrollIntoView({block: 'nearest'});
    } else if (event.key === 'Enter' && state.cursor >= 0 && !list.classList.contains('hidden')) {
      event.preventDefault();
      pick(state.options[state.cursor]);
    } else if (event.key === 'Escape' && !list.classList.contains('hidden')) {
      event.stopPropagation();
      close();
    }
  });
  container.querySelector('.picker-toggle').addEventListener('click', () => {
    if (list.classList.contains('hidden')) { input.focus(); open(); } else close();
  });

  return {
    get name() { return input.value.trim(); },
    get bigfamId() { return state.bigfamId; },
    set(name, bigfamId) {
      input.value = name || '';
      state.bigfamId = bigfamId || null;
      const person = bigfamId
        ? (ui.kin || []).find(item => item.id === bigfamId) || {name, avatar: `/media/bigfam/${bigfamId}`}
        : null;
      setAvatar(person);
    },
    clear() { this.set('', null); },
    focus() { input.focus(); },
  };
}

const selectionPicker = createPicker($('#selectionPicker'), 'Имя человека');
const dialogPicker = createPicker($('#dialogPicker'), 'Имя человека');
const lightboxPicker = createPicker($('#lightboxPicker'), 'Имя человека');

/* ---------- люди ---------- */

const yearOf = value => (String(value ?? '').match(/\d{4}/) || [''])[0];

const initials = (...parts) => parts.filter(Boolean)
  .map(part => `${String(part).trim().charAt(0).toLocaleUpperCase('ru')}.`).join('');

/** «Магомедшарипова Хамис Магомедовна» → «Хамис М.М.»: имя целиком, остальное инициалами. */
function shortName(name, kin) {
  if (kin && kin.first) return `${kin.first} ${initials(kin.last, kin.middle)}`.trim();
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || 'Без имени';
  const [surname, first, middle] = parts;
  return `${first} ${initials(surname, middle)}`.trim();
}

const kinOf = group => group.bigfam_id
  ? (ui.kin || []).find(person => person.id === group.bigfam_id) || null
  : null;

function lifeYears(kin) {
  if (!kin) return '';
  const birth = yearOf(kin.birth);
  const death = yearOf(kin.death);
  if (birth && death) return `${birth} — ${death}`;
  if (birth) return kin.deceased ? `${birth} — …` : birth;
  return death ? `† ${death}` : '';
}

// Аватарка: закреплённый кадр → портрет из картотеки → первое лицо группы.
function avatarSources(group) {
  const crop = group.avatar || (group.covers || [])[0] || '';
  return !group.avatar_pinned && group.bigfam_id
    ? {source: `/media/bigfam/${group.bigfam_id}`, fallback: crop}
    : {source: crop, fallback: ''};
}

function groupCard(group, selectable = true) {
  const selected = ui.selectedGroups.has(group.key);
  const {source, fallback} = avatarSources(group);
  const letter = escapeHtml((group.title || '?').trim().charAt(0).toLocaleUpperCase('ru') || '?');
  const kin = kinOf(group);
  const years = lifeYears(kin);
  const label = group.kind === 'person' ? shortName(group.title, kin) : group.title;
  const counts = `${formatNumber(group.count)} ${plural(group.count, 'лицо', 'лица', 'лиц')} ` +
    `на ${formatNumber(group.photos)} ${plural(group.photos, 'фотографии', 'фотографиях', 'фотографиях')}`;
  return `<article class="person-card ${selected ? 'selected' : ''}" data-key="${escapeHtml(group.key)}"
      data-selectable="${selectable && ui.canEdit ? '1' : ''}">
    <div class="person-photo">
      <button class="person-avatar" type="button" data-letter="${letter}"
        aria-label="Открыть ${escapeHtml(group.title)}">
        ${source ? `<img src="${escapeHtml(source)}" alt="" loading="lazy" decoding="async"
          data-fallback="${escapeHtml(fallback)}">` : `<span class="person-letter">${letter}</span>`}
      </button>
      <span class="count-badge" title="${escapeHtml(counts)}">
        ${formatNumber(group.count)}<i>/</i>${formatNumber(group.photos)}</span>
      <span class="tick-mark" aria-hidden="true">✓</span>
    </div>
    <button class="person-label" type="button" title="${escapeHtml(group.title)}">
      <span class="person-name">${escapeHtml(label)}</span>
      ${years ? `<span class="person-years">${escapeHtml(years)}</span>`
        : (group.kind === 'auto' ? '<span class="person-years">без имени</span>' : '')}
    </button>
  </article>`;
}

const skeletons = (count, className) =>
  Array.from({length: count}, () => `<div class="skeleton ${className}"></div>`).join('');

function renderStats() {
  const stats = ui.state.stats;
  $('#stats').innerHTML =
    `<span class="stat"><strong>${formatNumber(stats.faces)}</strong> лиц</span>` +
    `<span class="stat"><strong>${formatNumber(stats.photos)}</strong> фото</span>` +
    `<span class="stat"><strong>${formatNumber(stats.people)}</strong> имён</span>` +
    `<span class="stat"><strong>${formatNumber(stats.groups)}</strong> групп</span>`;
  setCount('peopleCount', stats.people || stats.groups);
  setCount('photosCount', stats.photos);
  setCount('reviewCount', stats.review);
  setCount('videoCount', stats.videos || 0);
  ui.hiddenCount = stats.hidden || 0;
}

function setCount(id, value) {
  const text = typeof value === 'number' ? formatNumber(value) : String(value);
  $(`#${id}`).textContent = text;
  $$(`[data-mirror="${id}"]`).forEach(element => {
    element.textContent = text;
    element.classList.toggle('zero', text === '0' || text === '—');
  });
}

function renderPeople() {
  const query = ($('#peopleSearch').value || $('#searchInput').value)
    .trim().toLocaleLowerCase('ru');
  const groups = ui.state.groups
    .filter(group => !['noise', 'excluded'].includes(group.kind))
    .filter(group => !query || `${group.title} ${group.name}`.toLocaleLowerCase('ru').includes(query));
  $('#peopleGrid').innerHTML = groups.map(group => groupCard(group)).join('');
  $('#peopleEmpty').classList.toggle('hidden', groups.length > 0);
  bindGroupCards($('#peopleGrid'));
  updateActionBar();
}

function renderReview() {
  const groups = ui.state.groups.filter(group => ['noise', 'excluded'].includes(group.kind));
  $('#reviewGrid').innerHTML = groups.map(group => groupCard(group, false)).join('');
  $('#reviewEmpty').classList.toggle('hidden', groups.length > 0);
  bindGroupCards($('#reviewGrid'));
}

// Портрет из картотеки мог быть удалён — тогда просто убираем картинку.
const dropBrokenAvatars = container => container.querySelectorAll('img.kin-avatar')
  .forEach(image => image.addEventListener('error', () => image.remove(), {once: true}));

// Нет портрета в картотеке — показываем кадр лица, нет и его — букву.
function bindAvatarFallback(container) {
  container.querySelectorAll('.person-avatar img[data-fallback], .bubble-photo img[data-fallback]')
    .forEach(image => {
    image.addEventListener('error', function swap() {
      const next = image.dataset.fallback;
      image.removeAttribute('data-fallback');
      if (next) {
        image.addEventListener('error', swap, {once: true});
        image.src = next;
        return;
      }
      const host = image.parentElement;
      image.remove();
      if (host && !host.querySelector('.person-letter')) {
        const letter = document.createElement('span');
        letter.className = 'person-letter';
        letter.textContent = host.dataset.letter || '?';
        host.append(letter);
      }
    }, {once: true});
  });
}

let lastPointerType = 'mouse';
addEventListener('pointerdown', event => { lastPointerType = event.pointerType || 'mouse'; }, true);

/** Долгое нажатие (и правая кнопка мыши) — выбор; обычный клик остаётся открытием. */
function bindLongPress(element, action) {
  let timer = null;
  let fired = false;
  let startX = 0;
  let startY = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  element.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    cancel();
    fired = false;
    startX = event.clientX;
    startY = event.clientY;
    timer = setTimeout(() => {
      fired = true;
      if (navigator.vibrate) navigator.vibrate(12);
      action(event);
    }, 460);
  });
  element.addEventListener('pointermove', event => {
    if (timer && Math.hypot(event.clientX - startX, event.clientY - startY) > 10) cancel();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(name =>
    element.addEventListener(name, cancel));
  // Клик после долгого нажатия гасим, иначе откроется карточка.
  element.addEventListener('click', event => {
    if (!fired) return;
    fired = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  element.addEventListener('contextmenu', event => {
    event.preventDefault();
    if (fired) { fired = false; return; }
    if (lastPointerType === 'mouse') { cancel(); action(event); }
  });
}

function bindGroupCards(container) {
  dropBrokenAvatars(container);
  bindAvatarFallback(container);
  container.querySelectorAll('.person-card').forEach(card => {
    const key = card.dataset.key;
    const toggle = () => {
      if (!card.dataset.selectable) return;
      ui.selectedGroups.has(key) ? ui.selectedGroups.delete(key) : ui.selectedGroups.add(key);
      renderPeople();
    };
    bindLongPress(card, toggle);
    card.addEventListener('click', event => {
      // Пока что-то выбрано, обычный клик продолжает выбор — как в галереях телефона.
      if (card.dataset.selectable && (event.ctrlKey || event.metaKey || ui.selectedGroups.size)) {
        return toggle();
      }
      openGroup(key);
    });
  });
}

// Именованные группы в выборе: их лица уедут к новому имени, о таком предупреждаем.
const namedInSelection = (except = '') => ui.state.groups.filter(group =>
  ui.selectedGroups.has(group.key) && group.kind === 'person' && group.name !== except);

function updateActionBar() {
  const count = ui.selectedGroups.size;
  const named = namedInSelection().length;
  $('#actionBar').classList.toggle('show', count > 0 && ui.canEdit);
  $('#selectionText').textContent = `${count} ${plural(count, 'группа', 'группы', 'групп')}`
    + (named ? ` · ${named} ${plural(named, 'с именем', 'с именами', 'с именами')}` : '');
}

/* ---------- карточка группы ---------- */

async function openGroup(key, {updateUrl = true} = {}) {
  try {
    ui.currentGroup = await api(`/api/group?key=${encodeURIComponent(key)}${
      ui.adultMode === 'hide' ? '&adult=hide' : ''}`);
    ui.selectedFaces.clear();
    ui.faceViewerCache = new Map();
    const kinds = {person: 'Сохранённый человек', auto: 'Автоматическая группа',
      noise: 'Не сгруппированные лица', excluded: 'Исключено вручную'};
    $('#dialogKind').textContent = kinds[ui.currentGroup.kind] || 'Группа';
    $('#dialogTitle').textContent = ui.currentGroup.title;
    $('#dialogPhotos').classList.toggle('hidden', ui.currentGroup.kind !== 'person');
    $('#dialogMeta').textContent =
      `${formatNumber(ui.currentGroup.count)} ${plural(ui.currentGroup.count, 'лицо', 'лица', 'лиц')} · ` +
      `${formatNumber(ui.currentGroup.photos)} фото`;
    await loadKin();
    dialogPicker.set(ui.currentGroup.name || '', ui.currentGroup.bigfam_id || null);
    renderFaces();
    loadDialogSimilar(key);
    $('#groupDialog').showModal();
    ui.routeGroup = key;
    document.title = `${ui.currentGroup.title} · HomeCloud`;
    if (updateUrl) syncUrl('push', {groupDialog: true});
  } catch (error) { toast(error.message); }
}

function closeGroup({fromHistory = false} = {}) {
  if ($('#groupDialog').open) $('#groupDialog').close();
  ui.routeGroup = '';
  document.title = `${({people: 'Люди', photos: 'Фотографии', review: 'Проверка',
    scan: 'Сканирование', duplicates: 'Дубликаты', settings: 'Настройки'})[ui.view]} · HomeCloud`;
  if (!fromHistory) syncUrl('replace');
}

function renderFaces() {
  const avatarFace = ui.currentGroup.avatar_face;
  $('#faceGrid').innerHTML = ui.currentGroup.faces.map((face, index) => {
    const percent = Math.round((face.confidence || 0) * 100);
    return `<article class="face-card ${ui.selectedFaces.has(face.id) ? 'selected' : ''}"
        data-id="${face.id}" data-index="${index}" data-selectable="${ui.canEdit ? '1' : ''}"
        title="${escapeHtml(face.path)}">
      ${percent ? `<span class="face-confidence">${percent}%</span>` : ''}
      ${face.id === avatarFace ? '<span class="face-pin" title="Сейчас это аватарка">★</span>' : ''}
      ${face.kind === 'video' ? `<span class="face-moment" title="Кадр из видео">▶ ${
        clock(face.frame_time || 0)}</span>` : ''}
      <span class="tick-mark" aria-hidden="true">✓</span>
      <img src="${escapeHtml(face.thumbnail)}" alt="${escapeHtml(face.filename)}" loading="lazy" decoding="async">
      <span class="face-foot"><span class="face-name">${escapeHtml(face.filename)}</span></span>
    </article>`;
  }).join('');
  $('#faceGrid').querySelectorAll('.face-card').forEach(card => {
    const id = Number(card.dataset.id);
    const toggle = () => {
      if (!card.dataset.selectable) return;
      ui.selectedFaces.has(id) ? ui.selectedFaces.delete(id) : ui.selectedFaces.add(id);
      card.classList.toggle('selected', ui.selectedFaces.has(id));
      updateFaceCount();
    };
    bindLongPress(card, toggle);
    card.addEventListener('click', event => {
      if (card.dataset.selectable && (event.ctrlKey || event.metaKey || ui.selectedFaces.size)) {
        return toggle();
      }
      openFaceViewer(Number(card.dataset.index));
    });
  });
  updateFaceCount();
}

/* ---------- просмотр лица: тот же просмотрщик, что и у галереи ---------- */

// Лицо — это просто ещё один способ попасть в общий просмотрщик: так у него
// сразу все те же возможности (сведения, обработка, скрытие, удаление, лента,
// свайп, видео), а не урезанный отдельный диалог.
async function openFaceViewer(index) {
  const faces = ui.currentGroup ? ui.currentGroup.faces : [];
  if (!faces.length) return;
  const wanted = (index + faces.length) % faces.length;
  ui.faceViewerCache = ui.faceViewerCache || new Map();
  const photos = [];
  for (const face of faces) {
    let photo = ui.faceViewerCache.get(face.path);
    if (!photo) {
      try {
        ({photo} = await api(`/api/photo?path=${encodeURIComponent(face.path)}`));
      } catch (error) {
        // Снимок мог пропасть с диска между сканами — показываем хотя бы кадр лица.
        photo = {path: face.path, filename: face.filename, folder: '', preview: face.original,
          video: face.kind === 'video' ? face.original : '', people: [], faces: [],
          albums: [], kind: face.kind, duration: 0, taken: null, caption: '', ocr_text: ''};
      }
      ui.faceViewerCache.set(face.path, photo);
    }
    photos.push(photo);
  }
  if (!ui.viewerIsFaces) {
    // Запоминаем список обычной галереи — просмотр лиц временно его подменяет.
    ui.savedGallery = {photos: ui.photos, total: ui.photoTotal};
  }
  ui.viewerIsFaces = true;
  ui.viewerFaces = faces;
  ui.photos = photos;
  ui.photoTotal = photos.length;
  openLightbox(wanted, {updateUrl: false});
}

async function changeAvatar(path, payload, message) {
  try {
    const result = await api(path, {method: 'POST', body: JSON.stringify(payload)});
    Object.assign(ui.currentGroup, {
      avatar_face: payload.face_id ?? ui.currentGroup.faces[0]?.id,
      avatar_pinned: Boolean(payload.face_id),
    });
    ui.state = result.state || ui.state;
    renderStats();
    renderPeople();
    renderReview();
    renderPersonFilters();
    renderFaces();
    renderViewerAvatarControls();
    toast(message);
  } catch (error) { toast(error.message); }
}

/** Иконка аватарки есть только в просмотре лиц из первой вкладки «Люди». */
function renderViewerAvatarControls() {
  const face = ui.viewerIsFaces ? (ui.viewerFaces || [])[ui.lightboxIndex] : null;
  const pin = $('#lightboxSetAvatar');
  const visible = Boolean(face && ui.canEdit && ui.view === 'people');
  pin.hidden = !visible;
  if (!visible) return;
  const pinned = face.id === ui.currentGroup?.avatar_face && ui.currentGroup?.avatar_pinned;
  pin.setAttribute('aria-pressed', String(pinned));
  pin.setAttribute('aria-label', pinned ? 'Вернуть аватарку по умолчанию' : 'Сделать аватаркой');
  pin.title = pinned ? 'Вернуть аватарку по умолчанию' : 'Сделать аватаркой';
}

$('#lightboxSetAvatar').addEventListener('click', () => {
  const face = ui.viewerIsFaces ? (ui.viewerFaces || [])[ui.lightboxIndex] : null;
  if (!face || ui.view !== 'people') return;
  const pinned = face.id === ui.currentGroup?.avatar_face && ui.currentGroup?.avatar_pinned;
  changeAvatar(pinned ? '/api/clear-avatar' : '/api/set-avatar',
    pinned ? {key: ui.currentGroup.key} : {key: ui.currentGroup.key, face_id: face.id},
    pinned ? 'Аватарка снова по умолчанию' : 'Аватарка обновлена');
});
$('#dialogPhotos').addEventListener('click', () => {
  const name = ui.currentGroup && ui.currentGroup.name;
  if (!name) return;
  closeGroup();
  showPersonPhotos(name);
});

/* ---------- поиск снимка в интернете ---------- */

// Оригиналы лежат только в домашней сети — у снимка нет постоянного публичного
// адреса, который можно передать поисковику. Поэтому бэкенд на время заливает
// копию на анонимный временный хостинг (Litterbox) и отдаёт прямую ссылку —
// по ней и открывается поиск по URL, без ручного перетаскивания файла.
const yandexImageSearchUrl = link =>
  `https://yandex.ru/images/search?rpt=imageview&url=${encodeURIComponent(link)}`;

async function searchImageOnline() {
  const photo = ui.photos[ui.lightboxIndex];
  if (!photo) return;
  toast('Готовлю снимок для поиска…');
  try {
    const data = await api('/api/photos/search-upload',
      {method: 'POST', body: JSON.stringify({path: photo.path})});
    window.open(yandexImageSearchUrl(data.url), '_blank', 'noopener');
    toast('Открыл поиск в Яндекс.Картинках — временная ссылка на снимок исчезнет примерно через час');
  } catch (error) { toast(error.message); }
}

$('#lightboxSearchImage').addEventListener('click', () => searchImageOnline());

function updateFaceCount() {
  $('#faceSelectionCount').textContent = `${ui.selectedFaces.size} выбрано`;
  const all = ui.currentGroup && ui.selectedFaces.size === ui.currentGroup.faces.length;
  $('#selectAllFaces').textContent = all ? 'Снять выбор' : 'Выбрать все';
}

/* ---------- фотографии ---------- */

// Люди в панели — такие же кружки, как на первой странице.
function personBubble(person, selected) {
  const letter = escapeHtml((person.name || '?').trim().charAt(0).toLocaleUpperCase('ru') || '?');
  const portrait = person.bigfam_id ? `/media/bigfam/${person.bigfam_id}` : person.avatar;
  return `<button class="bubble ${selected ? 'active' : ''}" type="button"
      data-name="${escapeHtml(person.name)}" title="${escapeHtml(person.name)}">
    <span class="bubble-photo" data-letter="${letter}">
      ${portrait ? `<img src="${escapeHtml(portrait)}" alt="" loading="lazy" decoding="async"
        data-fallback="${escapeHtml(person.avatar || '')}">` : `<span class="person-letter">${letter}</span>`}
      <i class="bubble-count">${formatNumber(person.count)}</i>
    </span>
    <span class="bubble-name">${escapeHtml(shortName(person.name, (ui.kin || [])
      .find(kin => kin.id === person.bigfam_id)))}</span>
  </button>`;
}

function renderPersonFilters() {
  const query = $('#sidePeopleSearch').value.trim().toLocaleLowerCase('ru');
  const people = (ui.state.people || [])
    .filter(person => !query || person.name.toLocaleLowerCase('ru').includes(query));
  const host = $('#peopleBubbles');
  host.innerHTML = people.length
    ? people.map(person => personBubble(person, ui.selectedPeople.has(person.name))).join('')
    : `<span class="person-meta">${ui.state.people.length
      ? 'Никто не найден' : 'Сначала назначьте имена в разделе «Люди»'}</span>`;
  bindAvatarFallback(host);
  host.querySelectorAll('.bubble').forEach(button => button.addEventListener('click', () => {
    const name = button.dataset.name;
    ui.selectedPeople.has(name) ? ui.selectedPeople.delete(name) : ui.selectedPeople.add(name);
    renderPersonFilters();
    syncUrl('replace');
    loadPhotos();
  }));
  renderPersonContext();
  renderGalleryContext();
}

function renderPersonContext() {
  const selected = [...ui.selectedPeople];
  const person = selected.length === 1
    ? ui.state.people.find(item => item.name === selected[0]) : null;
  const context = $('#personContext');
  context.classList.toggle('hidden', !person);
  if (!person) { context.innerHTML = ''; return; }
  context.innerHTML = `${person.bigfam_id ? `<img src="/media/bigfam/${escapeHtml(person.bigfam_id)}" alt="">` : ''}
    <div class="body"><strong>${escapeHtml(person.name)}</strong><small>Фотографии с этим человеком</small></div>
    ${person.bigfam_id ? `<a class="button small" href="${escapeHtml(bigfamPersonUrl(person.bigfam_id))}" target="_blank" rel="noopener">Открыть в BiGFaM</a>` : '<span class="photo-unknown">Не связан с BiGFaM</span>'}`;
}

const albumById = id => ui.albums.find(album => album.id === Number(id)) || null;

const folderName = path => (ui.folderTrail.find(item => item.path === path) || {}).name
  || String(path).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

function contextChip(label, kind, value) {
  return `<button class="chip context" type="button" data-drop="${kind}"
    data-value="${escapeHtml(String(value ?? ''))}" title="Убрать фильтр">
    ${escapeHtml(label)}<i aria-hidden="true">×</i></button>`;
}

const typeLabels = {photo: 'Фотографии', screenshot: 'Скриншоты', document: 'Документы',
  graphics: 'Графика'};

/** Что сейчас показывает галерея — одной строкой, каждое можно снять. */
function renderGalleryContext() {
  const chips = [];
  ui.selectedPeople.forEach(name => chips.push(contextChip(name, 'person', name)));
  if (ui.folder) {
    chips.push(contextChip(`Папка: ${folderName(ui.folder)}`, 'folder', ui.folder));
  }
  if (ui.album) {
    const album = albumById(ui.album);
    chips.push(contextChip(`Альбом: ${album ? album.trail : ui.album}`, 'album', ui.album));
  }
  if (ui.selectedContentType) {
    chips.push(contextChip(typeLabels[ui.selectedContentType] || ui.selectedContentType,
      'type', ui.selectedContentType));
  }
  if (ui.hidden) chips.push(contextChip('Скрытый альбом', 'hidden', '1'));
  if (ui.selectedKind === 'video') chips.push(contextChip('Видео', 'kind', 'video'));
  if (ui.showBlurry) chips.push(contextChip('Размытые', 'blurry', '1'));
  if (ui.showAdult) chips.push(contextChip('18+', 'adult', '1'));
  const host = $('#galleryContext');
  host.innerHTML = chips.join('');
  const counter = $('#activeFilterCount');
  counter.hidden = !chips.length;
  counter.textContent = String(chips.length);
  host.querySelectorAll('[data-drop]').forEach(chip => chip.addEventListener('click', () => {
    const {drop, value} = chip.dataset;
    if (drop === 'person') ui.selectedPeople.delete(value);
    if (drop === 'folder') ui.folder = '';
    if (drop === 'album') ui.album = 0;
    if (drop === 'type') setContentType('');
    if (drop === 'kind') ui.selectedKind = '';
    if (drop === 'hidden') ui.hidden = false;
    if (drop === 'blurry') ui.showBlurry = false;
    if (drop === 'adult') ui.showAdult = false;
    syncFilterButtons();
    renderPersonFilters();
    renderAlbums();
    syncUrl('replace');
    loadPhotos();
  }));
}

function syncFilterButtons() {
  $('#contentFilters').querySelectorAll('[data-type]').forEach(item =>
    item.classList.toggle('active', item.dataset.type === ui.selectedContentType));
  $('#contentFilters [data-blurry]').classList.toggle('active', ui.showBlurry);
  $('#contentFilters [data-adult]').classList.toggle('active', ui.showAdult);
  $('#contentFilters [data-kind]').classList.toggle('active', ui.selectedKind === 'video');
}

function setContentType(value) {
  ui.selectedContentType = value;
}

/* ---------- боковая панель ---------- */

function openSidepage(tab = ui.sidepageTab) {
  showSidepageTab(tab);
  $('#sidepage').hidden = false;
  $('#sidepageBackdrop').hidden = false;
  document.body.classList.add('sidepage-open');
}

function closeSidepage() {
  $('#sidepage').hidden = true;
  $('#sidepageBackdrop').hidden = true;
  document.body.classList.remove('sidepage-open');
}

function showSidepageTab(tab) {
  ui.sidepageTab = tab;
  localStorage.setItem('homecloud-sidepage-tab', tab);
  $$('.sidepage-tab').forEach(button =>
    button.classList.toggle('active', button.dataset.panel === tab));
  $$('.sidepage-panel').forEach(panel =>
    panel.classList.toggle('active', panel.dataset.panel === tab));
  if (tab === 'folders' && !ui.folderItems.length) loadFolders(ui.folder);
  if (tab === 'albums' && !ui.albums.length) loadAlbums();
}

/* ---------- папки ---------- */

async function loadFolders(path = '') {
  try {
    const data = await api(`/api/folders?path=${encodeURIComponent(path)}`);
    ui.folderTrail = data.trail || [];
    ui.folderItems = data.folders || [];
    ui.folderCursor = data.path || '';
    renderFolders();
  } catch (error) { toast(error.message); }
}

function renderFolders() {
  const trail = [{path: '', name: 'Все диски'}, ...ui.folderTrail];
  $('#folderTrail').innerHTML = trail.map((item, index) =>
    `<button class="crumb" type="button" data-path="${escapeHtml(item.path)}">${escapeHtml(item.name)}</button>` +
    (index < trail.length - 1 ? '<i aria-hidden="true">/</i>' : '')).join('');
  const here = ui.folderCursor || '';
  const rows = ui.folderItems.map(item => `
    <div class="folder-row ${ui.folder === item.path ? 'active' : ''}">
      <button class="folder-open" type="button" data-open="${escapeHtml(item.path)}"
        ${item.folders ? '' : 'disabled'} aria-label="Открыть вложенные">
        ${item.folders ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6Z"/></svg>' : ''}
      </button>
      <button class="folder-pick" type="button" data-pick="${escapeHtml(item.path)}">
        <span class="folder-name">${escapeHtml(item.name)}</span>
        <span class="folder-count">${formatNumber(item.photos)}</span>
      </button>
      ${ui.canEdit ? `<button class="icon-button tiny" type="button"
        data-block="${escapeHtml(item.path)}"
        title="Исключить папку из сканера и галереи">⊘</button>` : ''}
    </div>`).join('');
  $('#folderTree').innerHTML = (here
    ? `<div class="folder-row here ${ui.folder === here ? 'active' : ''}">
        <button class="folder-pick" type="button" data-pick="${escapeHtml(here)}">
          <span class="folder-name">Показать всё в этой папке</span></button></div>` : '')
    + (rows || '<span class="person-meta">Вложенных папок нет</span>');

  $('#folderTrail').querySelectorAll('[data-path]').forEach(button =>
    button.addEventListener('click', () => loadFolders(button.dataset.path)));
  $('#folderTree').querySelectorAll('[data-open]').forEach(button =>
    button.addEventListener('click', () => loadFolders(button.dataset.open)));
  $('#folderTree').querySelectorAll('[data-pick]').forEach(button =>
    button.addEventListener('click', () => pickFolder(button.dataset.pick)));
  $('#folderTree').querySelectorAll('[data-block]').forEach(button =>
    button.addEventListener('click', () => blockFolder(button.dataset.block)));
}

function pickFolder(path) {
  ui.folder = ui.folder === path ? '' : path;
  ui.album = 0;
  renderGalleryContext();
  renderFolders();
  renderAlbums();
  syncUrl('replace');
  if (ui.view !== 'photos') return switchView('photos');
  loadPhotos();
}

/* ---------- альбомы ---------- */

async function loadAlbums() {
  try {
    ui.albums = (await api('/api/albums')).albums || [];
  } catch (error) { toast(error.message); }
  renderAlbums();
}

const albumCover = album => album.cover
  ? `/media/photo?path=${encodeURIComponent(album.cover)}&size=120` : '';

function albumRow(album) {
  const cover = albumCover(album);
  const nested = album.total - album.photos;
  return `<div class="album-row ${ui.album === album.id ? 'active' : ''}"
      data-id="${album.id}" style="--depth:${album.depth}">
    <button class="album-pick" type="button" data-pick="${album.id}">
      <span class="album-cover">${cover
        ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ''}</span>
      <span class="album-body">
        <b>${escapeHtml(album.title)}</b>
        <small>${formatNumber(album.photos)} ${plural(album.photos, 'снимок', 'снимка', 'снимков')}${
          nested > 0 ? ` · во вложенных ${formatNumber(nested)}` : ''}</small>
      </span>
    </button>
    ${ui.canEdit ? `<span class="album-tools">
      <button class="icon-button tiny" type="button" data-action="rename" data-id="${album.id}"
        title="Переименовать">✎</button>
      <button class="icon-button tiny" type="button" data-action="move" data-id="${album.id}"
        title="Переместить">⇄</button>
      <button class="icon-button tiny danger" type="button" data-action="delete" data-id="${album.id}"
        title="Удалить альбом">🗑</button>
    </span>` : ''}
  </div>`;
}

function renderAlbums() {
  const host = $('#albumTree');
  if (!host) return;
  const secret = `<div class="album-row secret ${ui.hidden ? 'active' : ''}">
    <button class="album-pick" type="button" data-secret="1">
      <span class="album-cover">🔒</span>
      <span class="album-body"><b>Скрытое</b><small>${
        ui.hiddenCount ? `${formatNumber(ui.hiddenCount)} ${plural(ui.hiddenCount,
          'снимок', 'снимка', 'снимков')} · видно только вам`
          : 'файлы уезжают в личную папку'}</small></span>
    </button></div>`;
  host.innerHTML = secret + (ui.albums.length
    ? ui.albums.map(albumRow).join('')
    : '<span class="person-meta">Альбомов пока нет. Создайте первый — например, «2010 год».</span>');
  host.querySelector('[data-secret]').addEventListener('click', () => {
    ui.hidden = !ui.hidden;
    ui.album = 0;
    renderGalleryContext();
    renderAlbums();
    syncUrl('replace');
    if (ui.view !== 'photos') return switchView('photos');
    loadPhotos();
  });
  host.querySelectorAll('[data-pick]').forEach(button =>
    button.addEventListener('click', () => pickAlbum(Number(button.dataset.pick))));
  host.querySelectorAll('[data-action]').forEach(button =>
    button.addEventListener('click', () => albumAction(button.dataset.action, Number(button.dataset.id))));
  $('#createAlbum').hidden = !ui.canEdit;
}

function pickAlbum(id) {
  ui.album = ui.album === id ? 0 : id;
  ui.folder = '';
  ui.hidden = false;
  renderGalleryContext();
  renderAlbums();
  renderFolders();
  syncUrl('replace');
  if (ui.view !== 'photos') return switchView('photos');
  loadPhotos();
}

async function albumCall(path, payload, message) {
  const data = await api(path, {method: 'POST', body: JSON.stringify(payload)});
  ui.albums = data.albums || ui.albums;
  renderAlbums();
  renderGalleryContext();
  if (message) toast(message);
  return data;
}

async function albumAction(action, id) {
  const album = albumById(id);
  if (!album) return;
  try {
    if (action === 'rename') {
      const title = prompt('Название альбома', album.title);
      if (title === null) return;
      await albumCall('/api/albums/rename', {id, title}, 'Альбом переименован');
    }
    if (action === 'delete') {
      const nested = ui.albums.filter(item => item.trail.startsWith(`${album.trail} / `)).length;
      if (!confirm(`Удалить альбом «${album.title}»${nested ? ` и ${nested} вложенных` : ''}?`
        + '\nСами фотографии останутся на месте.')) return;
      if (ui.album === id) ui.album = 0;
      await albumCall('/api/albums/delete', {id}, 'Альбом удалён');
      loadPhotos();
    }
    if (action === 'move') showAlbumMove(id);
  } catch (error) { toast(error.message); }
}

/** Перенос альбома: список возможных родителей прямо в строке. */
function showAlbumMove(id) {
  const row = $(`.album-row[data-id="${id}"]`);
  if (!row || row.querySelector('.album-move')) return;
  const forbidden = new Set([id, ...ui.albums
    .filter(item => item.trail.startsWith(`${albumById(id).trail} / `)).map(item => item.id)]);
  const select = document.createElement('select');
  select.className = 'album-move';
  select.innerHTML = '<option value="0">— верхний уровень —</option>' + ui.albums
    .filter(item => !forbidden.has(item.id))
    .map(item => `<option value="${item.id}">${escapeHtml(item.trail)}</option>`).join('');
  select.value = String(albumById(id).parent_id || 0);
  select.addEventListener('change', async () => {
    try {
      await albumCall('/api/albums/move', {id, parent_id: Number(select.value)}, 'Альбом перемещён');
    } catch (error) { toast(error.message); renderAlbums(); }
  });
  select.addEventListener('blur', () => select.remove());
  row.append(select);
  select.focus();
}

/* ---------- добавление снимков в альбом ---------- */

function openAlbumPick(paths) {
  if (!paths.length) return;
  ui.albumPaths = paths;
  $('#albumPickCount').textContent =
    `${formatNumber(paths.length)} ${plural(paths.length, 'снимок', 'снимка', 'снимков')}`;
  $('#albumPickTitle').value = '';
  $('#albumPickParent').innerHTML = '<option value="0">— верхний уровень —</option>' +
    ui.albums.map(item => `<option value="${item.id}">${escapeHtml(item.trail)}</option>`).join('');
  $('#albumPickList').innerHTML = ui.albums.length
    ? ui.albums.map(album => `<button class="album-pick-item" type="button" data-id="${album.id}"
        style="--depth:${album.depth}">${escapeHtml(album.title)}
        <small>${formatNumber(album.photos)}</small></button>`).join('')
    : '<span class="person-meta">Альбомов пока нет — создайте ниже.</span>';
  $('#albumPickList').querySelectorAll('[data-id]').forEach(button =>
    button.addEventListener('click', async () => {
      try {
        await albumCall('/api/albums/photos', {id: Number(button.dataset.id), add: ui.albumPaths},
          'Добавлено в альбом');
        $('#albumPickDialog').close();
        refreshAlbumsOfPhotos(Number(button.dataset.id));
      } catch (error) { toast(error.message); }
    }));
  $('#albumPickDialog').showModal();
}

/** После добавления карточки снимков должны знать про новый альбом. */
function refreshAlbumsOfPhotos(albumId) {
  const album = albumById(albumId);
  if (!album) return;
  const stamp = {id: album.id, title: album.title, trail: album.trail};
  ui.photos.forEach(photo => {
    if (ui.albumPaths.includes(photo.path)
      && !(photo.albums || []).some(item => item.id === albumId)) {
      photo.albums = [...(photo.albums || []), stamp];
    }
  });
  if ($('#lightbox').open) renderLightboxPlaces(ui.photos[ui.lightboxIndex]);
}

/* ---------- настройки каталога ---------- */

/** Исключение папки прямо из панели: дописываем её в чёрный список. */
async function blockFolder(path) {
  if (!confirm(`Исключить «${path}» из сканера и галереи?\n`
    + 'Файлы останутся на диске, но библиотека их больше не показывает.')) return;
  if (!ui.settings) await loadSettings();
  const rules = (ui.settings.block_paths || '').split('\n').map(item => item.trim())
    .filter(Boolean);
  if (rules.some(rule => rule.toLowerCase() === path.toLowerCase())) {
    return toast('Эта папка уже в списке');
  }
  await saveSettings({block_paths: [...rules, path].join('\n')});
  if (ui.folder && ui.folder.startsWith(path)) ui.folder = '';
  await loadFolders(ui.folderCursor || '');
  await loadState();
  await loadPhotos();
}

async function loadSettings() {
  try {
    const data = await api('/api/settings');
    ui.settings = data.settings;
    ui.visualModels = data.visual_models || [];
    renderSettings();
  } catch (error) { toast(error.message); }
}

function renderSettings() {
  if (!ui.settings) return;
  const visualSelect = $('[data-setting="visual_model"]');
  if (visualSelect && ui.visualModels.length) {
    visualSelect.innerHTML = ui.visualModels.map(model =>
      `<option value="${escapeHtml(model.id)}" ${model.installed ? '' : 'disabled'}>${escapeHtml(model.name)} — ${escapeHtml(model.installed ? model.note : 'загружается')}</option>`).join('');
  }
  $$('[data-setting]').forEach(field => {
    const value = ui.settings[field.dataset.setting];
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
    field.disabled = !ui.canEdit;
  });
  $('#saveSettings').hidden = !ui.canEdit;
  const excluded = ui.state?.stats?.excluded || 0;
  $('#excludedCount').textContent = excluded
    ? `Сейчас правилами исключено ${formatNumber(excluded)} ${plural(excluded,
      'снимок', 'снимка', 'снимков')}.`
    : 'Сейчас правилами ничего не исключено.';
}

async function saveSettings(extra = null) {
  const changes = extra || {};
  if (!extra) {
    $$('[data-setting]').forEach(field => {
      changes[field.dataset.setting] = field.type === 'checkbox' ? field.checked : field.value;
    });
  }
  try {
    const data = await api('/api/settings',
      {method: 'POST', body: JSON.stringify({settings: changes})});
    ui.settings = data.settings;
    renderSettings();
    // Правила путей применяются сразу — галерея должна это увидеть.
    if (data.excluded !== null && data.excluded !== undefined) {
      toast(`Настройки сохранены, исключено снимков: ${formatNumber(data.excluded)}`);
      await loadState();
      if (ui.view === 'photos') await loadPhotos();
    } else {
      toast('Настройки сохранены');
    }
  } catch (error) { toast(error.message); }
}

function showPersonPhotos(name) {
  ui.selectedPeople = new Set([name]);
  ui.routePhoto = '';
  $('#searchInput').value = '';
  $('#searchClear').classList.add('hidden');
  renderPersonFilters();
  switchView('photos', {historyMode: 'push'});
}

const PHOTO_PAGE = 200;

async function loadPhotos({append = false} = {}) {
  if (ui.photosLoading) return;
  if (append && ui.photos.length >= ui.photoTotal) return;
  const params = new URLSearchParams();
  ui.selectedPeople.forEach(name => params.append('person', name));
  const query = $('#searchInput').value.trim();
  if (query) params.set('q', query);
  if (ui.selectedContentType) params.set('type', ui.selectedContentType);
  if (ui.showBlurry) params.set('blurry', '1');
  if (ui.showAdult) params.set('adult', '1');
  if (ui.selectedKind) params.set('kind', ui.selectedKind);
  if (ui.folder) {
    params.set('folder', ui.folder);
    params.set('folder_deep', ui.folderDeep ? '1' : '0');
  }
  if (ui.album) params.set('album', String(ui.album));
  if (ui.hidden) params.set('hidden', '1');
  params.set('limit', String(PHOTO_PAGE));
  params.set('offset', String(append ? ui.photos.length : 0));
  if (!append) {
    $('#photoGrid').innerHTML = skeletons(18, 'photo');
    $('#photosEmpty').classList.add('hidden');
  }
  ui.photosLoading = true;
  $('#photosMore').classList.toggle('loading', append);
  try {
    const data = await api(`/api/photos?${params}`);
    const incoming = ui.adultMode === 'hide'
      ? data.photos.filter(photo => !adultFlag(photo)) : data.photos;
    const from = append ? ui.photos.length : 0;
    ui.photos = append ? [...ui.photos, ...incoming] : incoming;
    ui.photoTotal = data.total ?? ui.photos.length;
    if (!append) {
      const visible = new Set(ui.photos.map(photo => photo.path));
      ui.selectedPhotos = new Set([...ui.selectedPhotos].filter(path => visible.has(path)));
    }
    renderTiles(from);
    $('#photosEmpty').classList.toggle('hidden', ui.photos.length > 0);
    renderPhotoCounter();
  } catch (error) {
    if (!append) $('#photoGrid').innerHTML = '';
    toast(error.message);
  } finally {
    ui.photosLoading = false;
    $('#photosMore').classList.remove('loading');
  }
  // Страница не заполнила экран — наблюдатель второй раз не сработает, тянем сами.
  const edge = $('#photosMore').getBoundingClientRect();
  if (ui.photos.length < ui.photoTotal && edge.top < innerHeight + 400) {
    setTimeout(() => loadPhotos({append: true}), 60);
  }
}

function renderPhotoCounter() {
  const shown = ui.photos.length;
  const total = Math.max(ui.photoTotal, shown);
  $('#photosCounter').textContent = total
    ? (shown < total ? `Показано ${formatNumber(shown)} из ${formatNumber(total)}`
      : `${formatNumber(total)} ${plural(total, 'снимок', 'снимка', 'снимков')}`)
    : 'Галерея';
}

// Дотянули до низа — подгружаем следующую страницу.
new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && ui.view === 'photos' && ui.session) {
    loadPhotos({append: true});
  }
}, {rootMargin: '800px'}).observe($('#photosMore'));

// «sensitive» — это «на грани»: значок и блюр только для явного содержимого.
// Плитка — только кадр: подписи, описания и теги живут в просмотрщике.
function renderTiles(from = 0) {
  const markup = ui.photos.slice(from).map((photo, shift) => {
    const index = from + shift;
    return `
    <article class="tile ${ui.selectedPhotos.has(photo.path) ? 'selected' : ''}"
      data-index="${index}" data-selectable="${ui.canEdit ? '1' : ''}"
      title="${escapeHtml(photo.filename)}">
      <img src="${escapeHtml(photoMediaUrl(photo))}" alt="${escapeHtml(photo.caption_short || photo.caption || photo.filename)}"
        loading="lazy" decoding="async">
      ${adultFlag(photo) ? '<span class="tile-flag">18+</span>' : ''}
      ${photo.kind === 'video' ? `<span class="tile-video">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>
        ${photo.duration ? clock(photo.duration) : ''}</span>` : ''}
      <span class="tile-check" aria-hidden="true"></span>
    </article>`;
  }).join('');
  const grid = $('#photoGrid');
  if (from) grid.insertAdjacentHTML('beforeend', markup); else grid.innerHTML = markup;
  bindTiles(from);
  renderPhotoSelection();
}

/** Секунды в «м:сс» — длительность ролика и метка кадра. */
// Байты → «84 КБ» / «5.1 МБ» / «1.2 ГБ» — в отличие от megabytes() ниже
// (та всегда в мегабайтах, годится для сумм по хранилищу), тут единица
// подбирается по размеру: обычное фото не должно показываться как «0.1 МБ».
function fileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} Б`;
  if (value < 1048576) return `${Math.round(value / 1024)} КБ`;
  if (value < 1073741824) return `${(value / 1048576).toFixed(1)} МБ`;
  return `${(value / 1073741824).toFixed(1)} ГБ`;
}

/** Техническая сводка в подвале инфо-панели: размер, разрешение, длина. */
function renderFileInfo(photo) {
  const rows = [
    ['Размер файла', photo.size ? fileSize(photo.size) : ''],
    ['Разрешение', photo.width && photo.height ? `${photo.width}×${photo.height}` : ''],
    ...(photo.kind === 'video' ? [['Длительность', photo.duration ? clock(photo.duration) : '']] : []),
    ['Тип', photo.kind === 'video' ? 'Видео' : 'Фотография'],
  ].filter(([, value]) => value);
  $('#lightboxFileInfo').innerHTML = rows.map(([label, value]) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
}

function clock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}:${String(total % 60).padStart(2, '0')}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${
    String(total % 60).padStart(2, '0')}`;
}

const adultFlag = photo =>
  photo.adult_rating && !['safe', 'unknown', 'sensitive'].includes(photo.adult_rating);

const unchecked = photo => !photo.adult_rating || photo.adult_rating === 'unknown';

// Сетке не нужен оригинал: просим копию под размер плитки, с запасом на плотный экран.
const density = () => Math.min(window.devicePixelRatio || 1, 2);
const tileSize = () => Math.round(({small: 120, medium: 190, large: 300})[ui.zoom] * density());
const viewerSize = () => Math.round(
  Math.min(2200, Math.max(innerWidth, innerHeight) * density()));

function photoMediaUrl(photo, size = tileSize()) {
  const scaled = size ? `&size=${size}` : '';
  // «Блюр и непроверенных» закрывает всё, что этап 18+ ещё не смотрел.
  if (ui.adultMode === 'strict' && unchecked(photo)) return `${photo.preview}${scaled}&blur=full`;
  if (!adultFlag(photo) || ui.adultMode === 'show' || ui.adultMode === 'hide') {
    return `${photo.preview}${scaled}`;
  }
  const mode = ui.adultMode === 'full' ? 'full'
    : ui.adultMode === 'strict' ? 'explicit' : ui.adultMode;
  return `${photo.preview}${scaled}&blur=${encodeURIComponent(mode)}`;
}

const photoDate = photo => photo.taken
  ? new Date(photo.taken).toLocaleDateString('ru-RU',
    {day: 'numeric', month: 'long', year: 'numeric'}) : '';

function bindTiles(from = 0) {
  $$('#photoGrid .tile').filter(tile => Number(tile.dataset.index) >= from).forEach(tile => {
    const photo = ui.photos[Number(tile.dataset.index)];
    const toggle = () => {
      if (!tile.dataset.selectable || !photo) return;
      ui.selectedPhotos.has(photo.path)
        ? ui.selectedPhotos.delete(photo.path) : ui.selectedPhotos.add(photo.path);
      renderPhotoSelection();
    };
    bindLongPress(tile, toggle);
    tile.addEventListener('click', event => {
      if (tile.dataset.selectable
          && (event.ctrlKey || event.metaKey || ui.selectedPhotos.size)) return toggle();
      openLightbox(Number(tile.dataset.index));
    });
  });
}

function renderPhotoSelection() {
  const count = ui.selectedPhotos.size;
  $('#hideSelectedPhotos').textContent = ui.hidden ? 'Вернуть из скрытого' : 'Скрыть';
  $('#photoActionBar').classList.toggle('hidden', !count || !ui.canEdit);
  $('#photoSelectionCount').textContent = `${formatNumber(count)} выбрано`;
  $('#photoGrid').classList.toggle('selecting', count > 0 && ui.canEdit);
  $$('#photoGrid .tile').forEach(tile => {
    const photo = ui.photos[Number(tile.dataset.index)];
    tile.classList.toggle('selected', ui.selectedPhotos.has(photo?.path));
  });
}

/* ---------- размер плиток ---------- */

function applyZoom(value) {
  ui.zoom = ['small', 'medium', 'large'].includes(value) ? value : 'medium';
  localStorage.setItem('homecloud-zoom', ui.zoom);
  $('#photoGrid').dataset.zoom = ui.zoom;
  $$('#photoZoom .zoom-step').forEach(button =>
    button.classList.toggle('active', button.dataset.zoom === ui.zoom));
  // Под новую плитку нужна своя копия — перерисовываем карточки.
  if (ui.photos.length && $('#photoGrid').children.length) renderTiles();
}

$('#photoZoom').addEventListener('click', event => {
  const step = event.target.closest('[data-zoom]');
  if (step) applyZoom(step.dataset.zoom);
});
applyZoom(ui.zoom);

function renderStrip() {
  const strip = $('#viewerStrip');
  const from = Math.max(0, ui.lightboxIndex - 25);
  const to = Math.min(ui.photos.length, ui.lightboxIndex + 26);
  strip.innerHTML = ui.photos.slice(from, to).map((photo, offset) => {
    const index = from + offset;
    return `<button class="strip-item ${index === ui.lightboxIndex ? 'active' : ''}" type="button"
      data-index="${index}" aria-label="${escapeHtml(photo.filename)}">
      <img src="${escapeHtml(photoMediaUrl(photo, Math.round(120 * density())))}" alt=""
        loading="lazy" decoding="async"></button>`;
  }).join('');
  strip.querySelector('.strip-item.active')?.scrollIntoView(
    {block: 'nearest', inline: 'center', behavior: 'instant'});
}

function setViewerChrome(visible) {
  ui.viewerChrome = visible;
  $('#lightbox').classList.toggle('bare', !visible);
  if (!visible) setViewerInfo(false);
}

function setViewerInfo(visible) {
  ui.viewerInfo = visible;
  $('#viewerInfo').hidden = !visible;
  $('#lightbox').classList.toggle('with-info', visible);
  $('#lightboxInfo').setAttribute('aria-pressed', String(visible));
}

function openLightbox(index, {updateUrl = true, replace = false} = {}) {
  if (!ui.photos.length) return;
  // Листаем к концу загруженного — подтягиваем следующую страницу; при
  // просмотре лиц список временный и не постраничный, подгружать нечего.
  if (!ui.viewerIsFaces && index >= ui.photos.length - 3) loadPhotos({append: true});
  ui.lightboxIndex = (index + ui.photos.length) % ui.photos.length;
  const photo = ui.photos[ui.lightboxIndex];
  const movie = photo.kind === 'video';
  const player = $('#lightboxVideo');
  // Ролик играем прямо в просмотрщике, фотографию показываем картинкой.
  player.hidden = !movie;
  $('#lightboxImage').hidden = movie;
  if (movie) {
    player.poster = photoMediaUrl(photo, viewerSize());
    if (player.dataset.path !== photo.path) {
      player.src = photo.video;
      player.dataset.path = photo.path;
    }
  } else {
    player.pause();
    player.removeAttribute('src');
    player.dataset.path = '';
    $('#lightboxImage').src = photoMediaUrl(photo, viewerSize());
    $('#lightboxImage').alt = photo.caption_short || photo.caption || photo.filename;
  }
  $('#lightboxName').textContent = photoDate(photo) || photo.filename;
  $('#lightboxMeta').textContent = [
    photo.filename, movie && photo.duration ? `видео ${clock(photo.duration)}` : '',
    `${ui.lightboxIndex + 1} из ${formatNumber(ui.photos.length)}`].filter(Boolean).join(' · ');
  renderLightboxPlaces(photo);
  renderFileInfo(photo);
  $('#lightboxCaptionShort').textContent = photo.caption_short || '';
  $('#lightboxCaptionShort').classList.toggle('hidden', !photo.caption_short);
  $('#lightboxDescription').textContent = photo.caption || 'Описание ещё не создано';
  $('#lightboxDescription').classList.toggle('is-empty', !photo.caption);
  const captionTags = photo.caption_tags?.ru || [];
  $('#lightboxCaptionTags').innerHTML = captionTags.slice(0, 30).map(tag =>
    `<span>${escapeHtml(tag)}</span>`).join('');
  $('#lightboxCaptionTags').classList.toggle('hidden', !captionTags.length);
  const routerLabels = (photo.router_labels || []).filter(item => item.verified || item.score >= .55);
  const routerGroups = routerLabels.reduce((result, item) => {
    (result[item.group || 'Другое'] ||= []).push(item);
    return result;
  }, {});
  $('#lightboxRouter').classList.toggle('hidden', !routerLabels.length);
  $('#lightboxRouterLabels').innerHTML = Object.entries(routerGroups).map(([group, labels]) =>
    `<div class="router-detail-group"><b>${escapeHtml(group)}</b><div class="chips">${labels.map(item =>
      `<span class="chip ${item.verified ? 'verified' : ''}">${item.verified ? '✓ ' : ''}${escapeHtml(item.title)}${item.verified ? '' : ` ${Math.round(item.score * 100)}%`}</span>`).join('')}</div></div>`).join('');
  $('#lightboxOcr').classList.toggle('hidden', !photo.ocr_text);
  $('#lightboxOcr div').textContent = photo.ocr_text || '';
  renderSpeech(photo);
  const adult = $('#lightboxAdult');
  adult.classList.toggle('hidden', !photo.adult_description);
  adult.querySelector('.adult-description').textContent = photo.adult_description || '';
  adult.querySelector('.adult-regions').innerHTML = (photo.adult_regions || []).filter(
    item => item.score >= .25 && !item.class.startsWith('FACE_')).map(item =>
      `<span>${escapeHtml(item.class.replaceAll('_', ' ').toLowerCase())} · ${Math.round(item.score * 100)}%</span>`).join('');
  // «Открыть оригинал» у ролика ведёт на сам файл, а не на его обложку.
  $('#lightboxOpen').href = movie ? photo.video : photo.preview;
  $('#processLightboxPhoto').classList.toggle('hidden', !ui.canEdit);
  $('#deleteLightboxPhoto').classList.toggle('hidden', !ui.canEdit);
  renderViewerAvatarControls();
  const many = ui.photos.length > 1;
  $('#lightboxPrev').classList.toggle('hidden', !many);
  $('#lightboxNext').classList.toggle('hidden', !many);
  $('#viewerStrip').parentElement.hidden = !many;
  renderStrip();
  if (!$('#lightbox').open) {
    setViewerChrome(true);
    setViewerInfo(false);
    $('#lightbox').showModal();
    // showModal() не везде надёжно запирает прокрутку страницы за собой —
    // колесо мыши над видео иногда всё равно листало галерею сзади.
    document.body.classList.add('lightbox-open');
  }
  ui.routePhoto = photo.path;
  document.title = `${photo.filename} · HomeCloud`;
  if (updateUrl) syncUrl(replace ? 'replace' : 'push', {photoViewer: true});
}

/** Расшифровка речи ролика: реплики грузятся отдельно, в списке они лишние. */
async function renderSpeech(photo) {
  const box = $('#lightboxSpeech');
  const lines = $('#lightboxSpeechLines');
  if (photo.kind !== 'video' || !photo.speech_text) {
    box.classList.add('hidden');
    lines.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  const wanted = photo.path;
  let data = ui.speechCache.get(wanted);
  if (!data) {
    lines.innerHTML = '<li class="speech-empty">Загружаю…</li>';
    $('#lightboxSpeechNote').textContent = '';
    try {
      data = await api(`/api/speech?path=${encodeURIComponent(wanted)}`);
    } catch (error) {
      data = {segments: [], error: error.message};
    }
    ui.speechCache.set(wanted, data);
  }
  // Пока грузили, зритель мог пролистнуть дальше — тогда реплики уже не его.
  if (ui.photos[ui.lightboxIndex]?.path !== wanted) return;
  $('#lightboxSpeechNote').textContent = data.language || '';
  // Безымянная метка полезна только когда голосов больше одного — иначе это
  // просто «SPEAKER_00» на каждой строке, чистый шум. Настоящее имя, если
  // оно узнано, шумом не бывает и показывается всегда.
  const multi = (data.speakers || 0) > 1;
  lines.innerHTML = data.segments?.length
    ? data.segments.map(item => {
      const voice = speakerTag(item, multi);
      return `<li><button type="button" data-at="${item.start}">${clock(item.start)}</button>`
        + (voice || '') + `<span>${escapeHtml(item.text)}</span></li>`;
    }).join('')
    : `<li class="speech-empty">${escapeHtml(data.error || 'Речь не распознана')}</li>`;
}

// «SPEAKER_00» → «Голос 1» — цифра остаётся якорем для цвета подписи.
const speakerIndex = speaker => (Number(String(speaker).match(/\d+/)?.[0]) || 0) % 6;
const speakerLabel = speaker => `Голос ${speakerIndex(speaker) + 1}`;

// Имя, если узнали (по лицу в кадре — уверенно, по одному голосу —
// с оговоркой «похоже»); иначе просто «Голос N», и то не в одиночку.
function speakerTag(item, multi) {
  const person = item.person;
  if (person) {
    const guess = person.source === 'voice';
    const title = guess ? `Похоже, по голосу (${Math.round(person.confidence * 100)}%)` : '';
    return `<b class="speech-voice${guess ? ' is-guess' : ''}" `
      + `data-voice="${speakerIndex(item.speaker)}" title="${escapeHtml(title)}">`
      + `${escapeHtml(person.name)}${guess ? ' ?' : ''}</b>`;
  }
  if (multi && item.speaker) {
    return `<b class="speech-voice" data-voice="${speakerIndex(item.speaker)}">`
      + `${speakerLabel(item.speaker)}</b>`;
  }
  return '';
}

// Клик по времени реплики перематывает ролик на это место.
// Перемотка ролика на секунду — используется и репликами, и лицами в кадре.
function seekLightboxVideo(seconds) {
  const player = $('#lightboxVideo');
  if (!player.src || seconds == null) return false;
  player.currentTime = Number(seconds) || 0;
  player.play().catch(() => {});
  return true;
}

$('#lightboxSpeechLines').addEventListener('click', event => {
  const button = event.target.closest('button[data-at]');
  if (button) seekLightboxVideo(button.dataset.at);
});

/** Папка, альбомы и люди снимка — кликабельные: ведут в ту же подборку. */
function renderLightboxPlaces(photo) {
  const parts = String(photo.folder || '').split(/[\\/]/).filter(Boolean);
  let walked = '';
  const separator = photo.folder.includes('\\') ? '\\' : '/';
  $('#lightboxFolder').innerHTML = parts.map((part, index) => {
    walked = index ? `${walked}${separator}${part}` : `${part}${separator}`;
    const target = index ? walked : `${part}${separator}`;
    return `<button class="crumb" type="button" data-folder="${escapeHtml(target)}">${escapeHtml(part)}</button>`;
  }).join('<i aria-hidden="true">/</i>') || '<span class="photo-unknown">Путь неизвестен</span>';
  $('#lightboxAlbums').innerHTML = (photo.albums || []).map(album =>
    `<button class="chip" type="button" data-album="${album.id}">${escapeHtml(album.trail)}</button>`)
    .join('') || '<span class="photo-unknown">Снимок пока не в альбомах</span>';
  $('#lightboxAddAlbum').hidden = !ui.canEdit;
  ui.lightboxSelectedFaces = ui.lightboxSelectedFaces || new Set();
  ui.lightboxSelectedGroups = ui.lightboxSelectedGroups || new Set();
  hideLightboxAssign();
  hideFacePopover();
  const movie = photo.kind === 'video';
  $('#lightboxPeopleTitle').textContent = movie ? 'Кто в видео' : 'Кто на фото';
  const faces = photo.faces && photo.faces.length ? photo.faces
    // Старые карточки без поля faces (например, кэш поиска) — показываем как раньше.
    : (photo.people || []).map(person =>
      ({name: person.name, bigfam_id: person.bigfam_id, group: `named:${person.name}`}));
  // Группа — та же самая сущность, что и в разделе «Люди»: по имени, если
  // оно есть, иначе по автокластеру. В видео один человек обычно заходит и
  // выходит из кадра не раз — у каждого раза свой трек, но это один пузырь,
  // а не карточка на каждое появление.
  const groups = new Map();
  for (const face of faces) {
    const key = face.group || (face.id ? `face:${face.id}` : `named:${face.name}`);
    if (!groups.has(key)) groups.set(key, {key, name: face.name, bigfam_id: face.bigfam_id, members: []});
    groups.get(key).members.push(face);
  }
  ui.lightboxGroups = groups;
  $('#lightboxPeople').innerHTML = [...groups.values()].map(group => renderPersonBubble(group, movie))
    .join('') ||
    `<span class="photo-unknown">${photo.face_count ? `${formatNumber(photo.face_count)} лиц без имени` : 'Лица не найдены'}</span>`;
  bindAvatarFallback($('#lightboxPeople'));
}

// «auto:5» → «Группа 6» — та же нумерация, что и в разделе «Люди».
function groupTitle(key) {
  const match = /^auto:(-?\d+)/.exec(key);
  return match ? `Группа ${Number(match[1]) + 1}` : 'Без имени';
}

function renderPersonBubble(group, movie) {
  const members = group.members.slice().sort((a, b) => (a.frame_time ?? 0) - (b.frame_time ?? 0));
  const lead = members[0];
  const named = Boolean(group.name);
  const known = named ? ((ui.state?.people || []).find(item => item.name === group.name) || group) : null;
  const portrait = named ? (group.bigfam_id ? `/media/bigfam/${group.bigfam_id}` : (known.avatar || '')) : '';
  const letter = escapeHtml((group.name || '?').trim().charAt(0).toLocaleUpperCase('ru'));
  const title = named
    ? shortName(group.name, (ui.kin || []).find(kin => kin.id === group.bigfam_id))
    : groupTitle(group.key);
  // На видео клик мотает к моменту первого появления — видно, о ком речь,
  // ещё до того, как решать, что делать с именем.
  const seekAt = movie && lead.frame_time != null ? lead.frame_time : null;
  const picture = named
    ? (portrait
      ? `<img src="${escapeHtml(portrait)}" alt="" loading="lazy" data-fallback="${escapeHtml(known.avatar || '')}">`
      : `<span class="person-letter">${letter}</span>`)
    : `<img src="${escapeHtml(lead.thumbnail || '')}" alt="" loading="lazy" data-fallback="">`;
  const hint = named ? 'Клик — выбрать, ещё раз — открыть галерею' : 'Клик — выбрать для назначения имени';
  return `<button class="bubble ${named ? '' : 'face-unnamed'} ${ui.canEdit ? '' : 'readonly'}" type="button"
      data-group="${escapeHtml(group.key)}"
      ${seekAt != null ? `data-at="${seekAt}"` : ''}
      title="${escapeHtml(movie ? hint + ' · удержать — все появления' : hint)}">
    <span class="bubble-photo" data-letter="${named ? letter : '?'}">${picture}
      ${members.length > 1 ? `<i class="bubble-count">×${members.length}</i>` : ''}
      ${seekAt != null ? `<i class="bubble-time">${clock(seekAt)}</i>` : ''}</span>
    <span class="bubble-name">${escapeHtml(title)}</span></button>`;
}

function hideLightboxAssign() {
  $('#lightboxAssign').classList.add('hidden');
  $$('#lightboxPeople .bubble.selected').forEach(button => button.classList.remove('selected'));
  ui.lightboxSelectedGroups?.clear();
  ui.lightboxSelectedFaces?.clear();
}

function renderLightboxAssign() {
  const count = ui.lightboxSelectedFaces.size;
  $('#lightboxAssign').classList.toggle('hidden', !count);
  $('#lightboxAssignButton').textContent = count > 1 ? `Назначить (${count})` : 'Назначить';
}

// Клик по группе: первый — выбирает (можно назначить/переназначить имя),
// повторный по уже выбранной — открывает личную галерею у названных, а у
// безымянных просто снимает выбор (открывать пока нечего). Удержание —
// отдельный жест ниже, он показывает все появления и клик не считает.
$('#lightboxPeople').addEventListener('click', event => {
  const button = event.target.closest('.bubble[data-group]');
  if (!button) return;
  if (button.dataset.heldJustNow) { delete button.dataset.heldJustNow; return; }
  const group = ui.lightboxGroups?.get(button.dataset.group);
  if (!group) return;
  if (button.dataset.at != null) seekLightboxVideo(button.dataset.at);
  if (!ui.canEdit) {
    // Смотрящему без прав редактировать нечего выбирать — сразу к галерее,
    // как раньше был устроен единственный клик.
    if (group.name) { closeLightbox(); showPersonPhotos(group.name); }
    return;
  }
  if (ui.lightboxSelectedGroups.has(group.key)) {
    ui.lightboxSelectedGroups.delete(group.key);
    for (const face of group.members) if (face.id) ui.lightboxSelectedFaces.delete(face.id);
    if (group.name) { closeLightbox(); showPersonPhotos(group.name); return; }
    button.classList.remove('selected');
    renderLightboxAssign();
    return;
  }
  ui.lightboxSelectedGroups.add(group.key);
  for (const face of group.members) if (face.id) ui.lightboxSelectedFaces.add(face.id);
  button.classList.add('selected');
  renderLightboxAssign();
});

// Удержание пузыря — все его появления в ролике, с перемоткой по клику.
let holdTimer = null;
$('#lightboxPeople').addEventListener('pointerdown', event => {
  const button = event.target.closest('.bubble[data-group]');
  const group = button && ui.lightboxGroups?.get(button.dataset.group);
  if (!group || group.members.length < 2) return;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    button.dataset.heldJustNow = '1';
    showFacePopover(button, group);
  }, 450);
});
const cancelFaceHold = () => clearTimeout(holdTimer);
$('#lightboxPeople').addEventListener('pointerup', cancelFaceHold);
$('#lightboxPeople').addEventListener('pointerleave', cancelFaceHold);
document.addEventListener('pointercancel', cancelFaceHold);

function showFacePopover(anchor, group) {
  const pop = $('#lightboxFacePopover');
  const members = group.members.slice().sort((a, b) => (a.frame_time ?? 0) - (b.frame_time ?? 0));
  pop.innerHTML = members.map(face => `<button type="button" data-at="${face.frame_time ?? 0}">
      <img src="${escapeHtml(face.thumbnail || '')}" alt="" loading="lazy">
      ${face.frame_time != null ? `<i class="bubble-time">${clock(face.frame_time)}</i>` : ''}
    </button>`).join('');
  const rect = anchor.getBoundingClientRect();
  pop.classList.remove('hidden');
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - pop.offsetHeight - 8)}px`;
}

function hideFacePopover() { $('#lightboxFacePopover').classList.add('hidden'); }

$('#lightboxFacePopover').addEventListener('click', event => {
  const button = event.target.closest('button[data-at]');
  if (button) { seekLightboxVideo(button.dataset.at); hideFacePopover(); }
});
document.addEventListener('click', event => {
  if (!$('#lightboxFacePopover').classList.contains('hidden')
      && !event.target.closest('#lightboxFacePopover') && !event.target.closest('.bubble[data-group]')) {
    hideFacePopover();
  }
});

$('#lightboxAssignCancel').addEventListener('click', hideLightboxAssign);
$('#lightboxAssignButton').addEventListener('click', async () => {
  const name = lightboxPicker.name;
  const faceIds = [...ui.lightboxSelectedFaces];
  if (!name) return toast('Введите имя человека');
  if (!faceIds.length) return;
  try {
    await api('/api/assign-faces',
      {method: 'POST', body: JSON.stringify({face_ids: faceIds, name, bigfam_id: lightboxPicker.bigfamId})});
    lightboxPicker.clear();
    hideLightboxAssign();
    toast(faceIds.length > 1 ? `Лица назначены: ${name}` : `Лицо назначено: ${name}`);
    // Обновляем и текущую карточку в просмотрщике, и общее состояние — счётчики
    // людей и панель поиска должны увидеть новое имя сразу.
    const {photo} = await api(`/api/photo?path=${encodeURIComponent(ui.photos[ui.lightboxIndex].path)}`);
    ui.photos[ui.lightboxIndex] = photo;
    if (ui.viewerIsFaces && ui.faceViewerCache) ui.faceViewerCache.set(photo.path, photo);
    renderLightboxPlaces(photo);
    loadState();
  } catch (error) { toast(error.message); }
});

$('#lightboxFolder').addEventListener('click', event => {
  const crumb = event.target.closest('[data-folder]');
  if (!crumb) return;
  closeLightbox();
  ui.folder = crumb.dataset.folder.replace(/(?!^)[\\/]+$/, '');
  ui.album = 0;
  loadFolders(ui.folder);
  renderGalleryContext();
  syncUrl('replace');
  loadPhotos();
});
$('#lightboxAlbums').addEventListener('click', event => {
  const chip = event.target.closest('[data-album]');
  if (!chip) return;
  closeLightbox();
  pickAlbum(Number(chip.dataset.album));
});
$('#lightboxAddAlbum').addEventListener('click', () => {
  const photo = ui.photos[ui.lightboxIndex];
  if (photo) openAlbumPick([photo.path]);
});

function closeLightbox({fromHistory = false} = {}) {
  const player = $('#lightboxVideo');
  player.pause();
  player.removeAttribute('src');
  player.dataset.path = '';
  if ($('#lightbox').open) $('#lightbox').close();
  document.body.classList.remove('lightbox-open');
  ui.routePhoto = '';
  if (ui.viewerIsFaces) {
    // Просмотр лиц временно подменял список галереи — возвращаем как было.
    if (ui.savedGallery) {
      ui.photos = ui.savedGallery.photos;
      ui.photoTotal = ui.savedGallery.total;
      ui.savedGallery = null;
    }
    ui.viewerIsFaces = false;
    ui.viewerFaces = null;
    document.title = ui.currentGroup ? `${ui.currentGroup.title} · HomeCloud`
      : `${({people: 'Люди', photos: 'Фотографии', review: 'Проверка',
        scan: 'Сканирование', duplicates: 'Дубликаты', settings: 'Настройки'})[ui.view]} · HomeCloud`;
    return;
  }
  document.title = `${({people: 'Люди', photos: 'Фотографии', review: 'Проверка',
    scan: 'Сканирование', duplicates: 'Дубликаты', settings: 'Настройки'})[ui.view]} · HomeCloud`;
  if (!fromHistory) syncUrl('replace');
}

$('#lightboxPrev').addEventListener('click', () => openLightbox(ui.lightboxIndex - 1, {replace: true}));
$('#lightboxNext').addEventListener('click', () => openLightbox(ui.lightboxIndex + 1, {replace: true}));
$('#lightboxClose').addEventListener('click', () => closeLightbox());
$('#lightboxInfo').addEventListener('click', () => setViewerInfo(!ui.viewerInfo));
$('#viewerStrip').addEventListener('click', event => {
  const item = event.target.closest('[data-index]');
  if (item) openLightbox(Number(item.dataset.index), {replace: true});
});

// Лента кадров тянется мышью, как в телефоне; колесо листает её вбок.
function bindStripDrag(strip) {
  let drag = null;
  strip.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = {x: event.clientX, left: strip.scrollLeft, moved: false};
    strip.classList.add('dragging');
    strip.setPointerCapture(event.pointerId);
  });
  strip.addEventListener('pointermove', event => {
    if (!drag) return;
    const shift = event.clientX - drag.x;
    if (Math.abs(shift) > 3) drag.moved = true;
    strip.scrollLeft = drag.left - shift;
  });
  const release = event => {
    if (!drag) return;
    // Перетаскивание не должно превращаться в выбор кадра.
    strip.dataset.dragged = drag.moved ? '1' : '';
    drag = null;
    strip.classList.remove('dragging');
    if (strip.hasPointerCapture(event.pointerId)) strip.releasePointerCapture(event.pointerId);
  };
  strip.addEventListener('pointerup', release);
  strip.addEventListener('pointercancel', release);
  strip.addEventListener('click', event => {
    if (!strip.dataset.dragged) return;
    strip.dataset.dragged = '';
    event.stopPropagation();
    event.preventDefault();
  }, true);
  strip.addEventListener('wheel', event => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    strip.scrollLeft += event.deltaY;
  }, {passive: false});
}
bindStripDrag($('#viewerStrip'));

// Кадр по нажатию прячет обвязку, поля вокруг — закрывают, как в галерее телефона.
$('#viewerStage').addEventListener('click', event => {
  if (event.target.closest('.viewer-nav')) return;
  // У проигрывателя свои кнопки: по нему не прячем обвязку и не закрываем окно.
  if (event.target.id === 'lightboxVideo') return;
  if (event.target.id === 'lightboxImage') return setViewerChrome(!ui.viewerChrome);
  closeLightbox();
});

// Прокрутка вверх над кадром — это жест «покажи подробности», как потянуть
// шторку снизу вверх; вниз ничего не делает, чтобы не мешать обычному
// скроллу, если он вдруг где-то нужен над самим кадром.
$('#viewerStage').addEventListener('wheel', event => {
  if (event.deltaY < 0 && !ui.viewerInfo) {
    event.preventDefault();
    setViewerInfo(true);
  }
}, {passive: false});

// Листание пальцем.
let swipeStart = null;
$('#viewerStage').addEventListener('pointerdown', event => {
  swipeStart = event.pointerType === 'touch' ? {x: event.clientX, y: event.clientY} : null;
});
$('#viewerStage').addEventListener('pointerup', event => {
  if (!swipeStart) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
  openLightbox(ui.lightboxIndex + (dx < 0 ? 1 : -1), {replace: true});
});
$('#lightbox').addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') openLightbox(ui.lightboxIndex - 1);
  if (event.key === 'ArrowRight') openLightbox(ui.lightboxIndex + 1);
});
$('#lightbox').addEventListener('cancel', event => {
  event.preventDefault();
  closeLightbox();
});

/* ---------- похожие люди ---------- */

const percent = score => `${Math.max(0, Math.round(score * 100))}%`;

const similarTone = score => score >= .62 ? 'same' : score >= .5 ? 'close'
  : score >= .38 ? 'kin' : 'far';

function groupFace(group) {
  const source = group.avatar || '';
  return source
    ? `<img class="similar-face" src="${escapeHtml(source)}" alt="" loading="lazy">`
    : `<span class="similar-face blank">${escapeHtml((group.title || '?').charAt(0))}</span>`;
}

/** Объединяем в того, у кого уже есть имя; двух безымянных сливать не во что. */
function mergeGroups(first, second) {
  const named = [first, second].filter(item => item.kind === 'person');
  if (!named.length) return toast('Сначала дайте имя одной из групп');
  const target = named.length === 2
    ? (first.count >= second.count ? first : second) : named[0];
  const other = target === first ? second : first;
  if (!confirm(`Объединить «${other.title}» с «${target.title}»? `
    + 'Все лица станут одним человеком, действие можно отменить.')) return;
  return mutate('/api/assign-groups',
    {group_keys: [first.key, second.key], name: target.name, bigfam_id: target.bigfam_id},
    `Объединено: ${target.title}`);
}

function similarRow(group, score, verdict, actions) {
  return `<div class="similar-row" data-key="${escapeHtml(group.key)}">
    ${groupFace(group)}
    <div class="similar-body">
      <span class="similar-name">${escapeHtml(group.title)}</span>
      <span class="similar-meta">${formatNumber(group.count)} ${plural(group.count, 'лицо', 'лица', 'лиц')} · ${escapeHtml(verdict)}</span>
    </div>
    <span class="similar-score ${similarTone(score)}">${percent(score)}</span>
    ${actions}
  </div>`;
}

async function loadDialogSimilar(key) {
  const host = $('#dialogSimilar');
  host.hidden = true;
  host.innerHTML = '';
  try {
    const data = await api(`/api/similar?key=${encodeURIComponent(key)}&limit=8`);
    if (!data.similar.length) return;
    ui.similar = data;
    host.hidden = false;
    host.innerHTML = '<div class="section-label">Похожие группы</div>'
      + data.similar.map((item, index) => similarRow(item, item.score, item.verdict,
        `<button class="button small" data-compare="${index}">Сравнить</button>`
        + (ui.canEdit ? `<button class="button small" data-merge="${index}">Объединить</button>` : '')
      )).join('');
  } catch (error) {
    console.warn('Похожие не получились:', error.message);
  }
}

$('#dialogSimilar').addEventListener('click', event => {
  const compare = event.target.closest('[data-compare]');
  const merge = event.target.closest('[data-merge]');
  if (!compare && !merge) return;
  const item = ui.similar.similar[Number((compare || merge).dataset.compare
    ?? (compare || merge).dataset.merge)];
  if (!item) return;
  if (compare) return openCompare(ui.similar.group.key, item.key);
  mergeGroups(ui.similar.group, item);
});

async function loadSimilarPairs() {
  const host = $('#similarPairs');
  try {
    const data = await api(`/api/similar-pairs?limit=24&named=${ui.similarNamedOnly ? 1 : 0}`);
    ui.pairs = data.pairs || [];
  } catch (error) {
    ui.pairs = [];
    console.warn('Пары не получились:', error.message);
  }
  host.hidden = false;
  host.innerHTML = `<div class="section-label">Похожие люди
      <button class="chip ${ui.similarNamedOnly ? 'active' : ''}" id="similarNamedOnly">только с именами</button></div>
    <p class="hint-line">Пары, которые модель считает одним человеком — обычно это одна и та же персона, разъехавшаяся по группам.</p>`
    + (ui.pairs.length ? ui.pairs.map((pair, index) => `<div class="pair-row">
        ${groupFace(pair.a)}${groupFace(pair.b)}
        <div class="similar-body">
          <span class="similar-name">${escapeHtml(pair.a.title)} ↔ ${escapeHtml(pair.b.title)}</span>
          <span class="similar-meta">${escapeHtml(pair.verdict)} · ${formatNumber(pair.a.count + pair.b.count)} ${plural(pair.a.count + pair.b.count, 'лицо', 'лица', 'лиц')}</span>
        </div>
        <span class="similar-score ${similarTone(pair.score)}">${percent(pair.score)}</span>
        <button class="button small" data-pair-compare="${index}">Сравнить</button>
        ${ui.canEdit ? `<button class="button small" data-pair-merge="${index}">Объединить</button>` : ''}
      </div>`).join('')
      : '<p class="hint-line">Похожих групп не нашлось.</p>');
}

$('#similarPairs').addEventListener('click', event => {
  if (event.target.closest('#similarNamedOnly')) {
    ui.similarNamedOnly = !ui.similarNamedOnly;
    return loadSimilarPairs();
  }
  const compare = event.target.closest('[data-pair-compare]');
  const merge = event.target.closest('[data-pair-merge]');
  if (!compare && !merge) return;
  const pair = ui.pairs[Number((compare || merge).dataset.pairCompare
    ?? (compare || merge).dataset.pairMerge)];
  if (!pair) return;
  if (compare) return openCompare(pair.a.key, pair.b.key);
  mergeGroups(pair.a, pair.b);
});

async function openCompare(first, second) {
  const body = $('#compareBody');
  body.innerHTML = '<p class="hint-line">Считаю…</p>';
  if (!$('#compareDialog').open) $('#compareDialog').showModal();
  try {
    const data = await api(`/api/compare?a=${encodeURIComponent(first)}&b=${encodeURIComponent(second)}`);
    $('#compareTitle').textContent = `${data.a.title} ↔ ${data.b.title}`;
    const rank = data.rank == null ? ''
      : `<li>Ближе, чем ${Math.round(data.rank * 100)}% пар людей в архиве (сравнивали с ${formatNumber(data.among)} парами).</li>`;
    body.innerHTML = `
      <div class="compare-heads">
        <figure>${groupFace(data.a)}<figcaption>${escapeHtml(data.a.title)}</figcaption></figure>
        <div class="compare-score ${similarTone(data.score)}">
          <b>${percent(data.score)}</b><span>${escapeHtml(data.verdict)}</span></div>
        <figure>${groupFace(data.b)}<figcaption>${escapeHtml(data.b.title)}</figcaption></figure>
      </div>
      <ul class="compare-facts">
        <li>Средние лица групп совпадают на ${percent(data.score)}, лучшая пара кадров — ${percent(data.best)}.</li>
        ${rank}
        <li>Сравнивали ${formatNumber(data.compared[0])} и ${formatNumber(data.compared[1])} ${plural(data.compared[1], 'кадр', 'кадра', 'кадров')}.</li>
        <li>Модель отвечает на вопрос «один ли это человек», а не «родственники ли»: у разных людей значения близки к нулю даже при семейном сходстве.</li>
      </ul>
      <div class="section-label">Самые похожие кадры</div>
      <div class="pair-grid">${data.pairs.map(pair => `<div class="pair-item">
        <img src="/media/face-crop/${pair.a}?size=200" alt="" loading="lazy">
        <img src="/media/face-crop/${pair.b}?size=200" alt="" loading="lazy">
        <span>${percent(pair.score)}</span></div>`).join('')}</div>`;
  } catch (error) {
    body.innerHTML = `<p class="hint-line">${escapeHtml(error.message)}</p>`;
  }
}

/* ---------- изменения каталога ---------- */

async function mutate(path, payload, success) {
  try {
    await api(path, {method: 'POST', body: JSON.stringify(payload)});
    ui.selectedGroups.clear();
    ui.selectedFaces.clear();
    selectionPicker.clear();
    await loadState();
    if ($('#groupDialog').open) closeGroup();
    toast(success);
  } catch (error) { toast(error.message); }
}

/** «Скрывать 18+» убирает такие снимки и из раздела «Люди». */
const stateQuery = () => (ui.adultMode === 'hide' ? '?adult=hide' : '');

async function loadState() {
  ui.state = await api(`/api/state${stateQuery()}`);
  renderStats();
  renderPeople();
  renderReview();
  renderPersonFilters();
  if (ui.view === 'photos') await loadPhotos();
}

/* ---------- active learning ---------- */

function renderRouter() {
  const data = ui.router || {};
  setCount('trainingCount', data.pending || 0);
  $('#routerStats').innerHTML = [
    ['Визуальный индекс', data.embedded || 0],
    ['Предсказания', data.predicted || 0],
    ['Проверено вручную', data.human_reviewed ?? data.reviewed ?? 0],
    ['По похожим кадрам', data.propagated || 0],
    ['В очереди', data.pending || 0],
  ].map(([title, value]) => `<div class="router-stat"><b>${formatNumber(value)}</b><small>${title}</small></div>`).join('');
  $('#routerAutoTrain').checked = Boolean(data.auto_train);
  $('#routerAutoEvery').value = String(data.auto_train_every || 50);
  $('#routerAutoTrain').disabled = !ui.canEdit;
  $('#routerAutoEvery').disabled = !ui.canEdit;
  $('#routerModels').innerHTML = (data.models || []).map(model => {
    const f1 = model.metrics?.macro_f1;
    return `<div class="router-version"><div class="router-version-head"><strong>${escapeHtml(model.version)}</strong>${model.status === 'active' ? '<span class="active-pill">активна</span>' : ''}</div>
      <p>${formatNumber(model.dataset_size)} проверок · F1 ${f1 == null ? '—' : Math.round(f1 * 1000) / 1000}<br>${escapeHtml(model.embedding_model)}</p>
      ${model.status === 'active' ? '' : `<button class="button small" data-router-activate="${escapeHtml(model.version)}">Сделать основной</button>`}</div>`;
  }).join('') || '<p class="hint-line">Обученных версий пока нет.</p>';
  renderRouterProgress();
  renderRouterPhoto();
}

function renderRouterProgress() {
  const data = ui.router || {};
  const job = ui.routerJob || {};
  const active = Boolean(job.active);
  $('#routerProgress').classList.toggle('hidden', !active && !['error'].includes(job.status));
  const percent = job.total ? Math.round((job.completed || 0) / job.total * 100) : 0;
  $('#routerPercent').textContent = active && job.total ? `${percent}%` : job.status === 'error' ? 'Ошибка' : '';
  $('#routerBar').style.width = `${percent}%`;
  $('#routerProgressTitle').textContent = job.action === 'train' ? 'Обучение новой версии' : 'Расчёт zero-shot меток';
  $('#routerProgressNote').textContent = job.error || (job.loss != null ? `loss ${job.loss}` : '');
  $('#routerBootstrap').disabled = active || !ui.canEdit;
  $('#routerTrain').disabled = active || !ui.canEdit || (data.reviewed || 0) < 12;
}

function renderRouterPhoto() {
  const item = ui.routerQueue[ui.routerIndex];
  const disabled = !item;
  $('#routerPhoto').hidden = disabled;
  $('#routerSave').disabled = disabled || !ui.canEdit;
  $('#routerSaveSimilar').disabled = disabled || !ui.canEdit;
  $('#routerSkip').disabled = disabled;
  if (!item) {
    $('#routerFilename').textContent = ui.router?.predicted ? 'Очередь разобрана' : 'Сначала создайте zero-shot очередь';
    $('#routerQueueNote').textContent = 'Очередь проверки';
    $('#routerLabels').innerHTML = '';
    return;
  }
  $('#routerPhoto').src = photoMediaUrl(item, Math.min(1600, viewerSize()));
  $('#routerFilename').textContent = item.filename;
  $('#routerQueueNote').textContent = `${ui.routerIndex + 1} из ${ui.routerQueue.length} · ${item.folder}`;
  const draft = ui.routerDrafts.get(item.path);
  const groups = (ui.router.labels || []).reduce((result, label) => {
    (result[label.group || 'Другое'] ||= []).push(label);
    return result;
  }, {});
  $('#routerLabels').innerHTML = Object.entries(groups).map(([group, labels]) =>
    `<div class="router-label-group"><b>${escapeHtml(group)}</b><div>${labels.map(label => {
      const score = Number(item.router_scores?.[label.id] || 0);
      const checked = draft ? Boolean(draft[label.id]) : score >= .6;
      return `<label class="router-label"><input type="checkbox" data-router-label="${escapeHtml(label.id)}" ${checked ? 'checked' : ''}><span>${escapeHtml(label.title)} <em>${Math.round(score * 100)}%</em></span></label>`;
    }).join('')}</div></div>`).join('');
}

async function loadTraining({keepQueue = false} = {}) {
  try {
    const [summary, status] = await Promise.all([api('/api/router/summary'), api('/api/router/status')]);
    ui.router = summary;
    ui.routerJob = status;
    if (!keepQueue || !ui.routerQueue.length) {
      const data = await api(`/api/router/review?limit=24${ui.adultMode === 'hide' ? '&adult=hide' : ''}`);
      ui.routerQueue = data.photos || [];
      ui.routerIndex = 0;
    }
    renderRouter();
  } catch (error) { toast(error.message); }
}

async function startRouter(action) {
  try {
    const data = await api(`/api/router/${action}`, {method: 'POST', body: '{}'});
    ui.routerJob = data.job;
    renderRouter();
    toast(action === 'train' ? 'Обучение запущено' : 'Zero-shot расчёт запущен');
  } catch (error) { toast(error.message); }
}

async function saveRouterReview(propagate = false) {
  const item = ui.routerQueue[ui.routerIndex];
  if (!item) return;
  const labels = {};
  $$('[data-router-label]').forEach(input => { labels[input.dataset.routerLabel] = input.checked; });
  try {
    const result = await api('/api/router/label', {method: 'POST',
      body: JSON.stringify({path: item.path, labels, propagate})});
    ui.routerDrafts.delete(item.path);
    const handled = new Set([item.path, ...(result.similar || [])]);
    ui.routerQueue = ui.routerQueue.filter(photo => !handled.has(photo.path));
    if (ui.routerIndex >= ui.routerQueue.length) ui.routerIndex = 0;
    await loadTraining({keepQueue: true});
    const propagated = (result.similar || []).length;
    if (result.auto_started) toast('Разметка сохранена · автоматическое обучение запущено');
    else if (propagated) toast(`Разметка применена ещё к ${formatNumber(propagated)} похожим кадрам`);
  } catch (error) { toast(error.message); }
}

$('#routerBootstrap').addEventListener('click', () => startRouter('bootstrap'));
$('#routerTrain').addEventListener('click', () => startRouter('train'));
$('#routerSave').addEventListener('click', () => saveRouterReview(false));
$('#routerSaveSimilar').addEventListener('click', () => saveRouterReview(true));
$('#routerLabels').addEventListener('change', () => {
  const item = ui.routerQueue[ui.routerIndex];
  if (!item) return;
  const values = {};
  $$('#routerLabels [data-router-label]').forEach(input => {
    values[input.dataset.routerLabel] = input.checked;
  });
  ui.routerDrafts.set(item.path, values);
});
$('#routerSkip').addEventListener('click', () => {
  if (!ui.routerQueue.length) return;
  ui.routerIndex = (ui.routerIndex + 1) % ui.routerQueue.length;
  renderRouterPhoto();
});
$('#routerModels').addEventListener('click', async event => {
  const button = event.target.closest('[data-router-activate]');
  if (!button) return;
  try {
    await api('/api/router/activate', {method: 'POST',
      body: JSON.stringify({version: button.dataset.routerActivate})});
    await loadTraining();
    toast('Новая версия роутера активирована');
  } catch (error) { toast(error.message); }
});

async function saveRouterAutomation() {
  try {
    const settings = {router_auto_train: $('#routerAutoTrain').checked,
      router_auto_train_every: Number($('#routerAutoEvery').value)};
    await api('/api/settings', {method: 'POST', body: JSON.stringify({settings})});
    Object.assign(ui.router, {auto_train: settings.router_auto_train,
      auto_train_every: settings.router_auto_train_every});
    toast(settings.router_auto_train ? 'Автоматическое обучение включено' : 'Автоматическое обучение выключено');
  } catch (error) { toast(error.message); }
}

$('#routerAutoTrain').addEventListener('change', saveRouterAutomation);
$('#routerAutoEvery').addEventListener('change', saveRouterAutomation);

/* ---------- сканирование ---------- */

const jobLabels = {
  idle: 'Готово к запуску', inventory: 'Поиск фотографий', faces: 'Распознавание лиц',
  visual: 'Визуальный индекс', ocr: 'Распознавание текста', caption: 'Описание изображений',
  adult: 'Анализ 18+ и областей', speech: 'Расшифровка речи',
  diarize: 'Разделение голосов',
  running: 'Обработка', completed: 'Завершено', stopped: 'Остановлено',
  interrupted: 'Прервано', error: 'Ошибка',
};

const validViews = new Set(
  ['people', 'photos', 'review', 'training', 'scan', 'duplicates', 'settings']);

function parsedRoute() {
  const match = /^#\/([^?]*)(?:\?(.*))?$/.exec(location.hash || '');
  const view = validViews.has(match?.[1]) ? match[1] : 'people';
  return {view, params: new URLSearchParams(match?.[2] || '')};
}

function routeHash() {
  const params = new URLSearchParams();
  const query = (ui.view === 'people' && $('#peopleSearch').value.trim())
    || $('#searchInput').value.trim();
  if (query && ['people', 'photos'].includes(ui.view)) params.set('q', query);
  if (ui.view === 'photos') {
    ui.selectedPeople.forEach(name => params.append('person', name));
    if (ui.selectedContentType) params.set('type', ui.selectedContentType);
    if (ui.showBlurry) params.set('blurry', '1');
    if (ui.showAdult) params.set('adult', '1');
    if (ui.selectedKind) params.set('kind', ui.selectedKind);
    if (ui.folder) {
      params.set('folder', ui.folder);
      if (!ui.folderDeep) params.set('folder_deep', '0');
    }
    if (ui.album) params.set('album', String(ui.album));
    if (ui.hidden) params.set('hidden', '1');
    if (ui.routePhoto) params.set('photo', ui.routePhoto);
  }
  if (ui.routeGroup && ['people', 'review'].includes(ui.view)) params.set('group', ui.routeGroup);
  const serialized = params.toString();
  return `#/${ui.view}${serialized ? `?${serialized}` : ''}`;
}

function syncUrl(mode = 'replace', state = {}) {
  if (ui.applyingRoute) return;
  history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', routeHash());
}

function bigfamPersonUrl(id) {
  return `${ui.bigfamUrl.replace(/#.*$/, '').replace(/\/$/, '')}/#/person/${encodeURIComponent(id)}`;
}
const featureInfo = {
  faces: ['Лица', 'InsightFace: поиск и группировка людей'],
  visual: ['Визуальный индекс', 'Тип изображения, качество и смысловой поиск'],
  ocr: ['OCR', 'Текст на изображениях, русский и английский'],
  caption: ['Описания', 'WD-теги → подробное локальное JSON-описание через Qwen3-VL'],
  adult: ['Контент 18+', 'NudeNet: области для блюра · WD-tagger: рейтинг и подробные теги'],
};

function jobPercent(job = {}) {
  const {done, total} = jobWork(job);
  return total ? Math.min(100, Math.round(done / total * 100)) : 0;
}

const videoExtensions = /\.(mp4|mov|m4v|avi|mkv|webm|3gp|mts|m2ts)$/i;
const phaseOrder = ['inventory', 'faces', 'visual', 'ocr', 'adult', 'caption'];
const phaseSeconds = {inventory: .003, faces: .09, visual: .07, ocr: .8, adult: .16, caption: 20};

function videoWeight(phase, job = {}) {
  if (phase !== 'faces') return phase === 'adult' ? 3 : 2;
  // Постоянного числа кадров на ролик больше нет — детектор идёт по всей
  // длине с фиксированным шагом. Точной длины типичного клипа тут не знаем,
  // поэтому берём грубую оценку по шагу: чаще проверяем — дороже ролик.
  const step = Number(job.video_track_step) || 0.5;
  return Math.min(120, Math.max(4, Math.round(20 / step)));
}

function jobWork(job = {}, phase = job.phase) {
  const totalFiles = Number(job.total || 0);
  const doneFiles = Number(job.completed || 0);
  const videoTotal = Number(job.videos_total || 0);
  const videoDone = Number(job.videos_done || 0);
  const extra = Math.max(0, videoWeight(phase, job) - 1);
  return {total: totalFiles + videoTotal * extra, done: doneFiles + videoDone * extra,
    videoTotal, videoDone};
}

function durationText(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  seconds = Math.max(1, Math.round(seconds));
  if (seconds < 60) return `${seconds} сек`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} ч${rest ? ` ${rest} мин` : ''}`;
}

function processingEta(device) {
  const job = device?.job || {};
  if (!job.active || !job.phase || job.phase === 'complete') return '';
  const now = Date.now();
  const signature = `${job.pid || ''}:${job.phase}:${job.phase_started_at || job.started_at || ''}`;
  let timing = ui.jobTiming.get(device.id);
  if (!timing || timing.signature !== signature) {
    timing = {signature, observedAt: now, initialDone: jobWork(job).done, cachedAt: 0, cached: ''};
    ui.jobTiming.set(device.id, timing);
  }
  if (now - timing.cachedAt < 500) return timing.cached;
  const work = jobWork(job);
  const serverStart = Number(job.phase_started_at || job.started_at || 0) * 1000;
  const startedAt = serverStart > 0 ? serverStart : timing.observedAt;
  const initialDone = serverStart > 0 ? 0 : timing.initialDone;
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const measured = Math.max(0, work.done - initialDone);
  const profileKey = `${device.id}:${job.phase}`;
  let rate = Number(ui.etaProfiles[profileKey] || phaseSeconds[job.phase] || .2);
  if (elapsed >= 4 && measured >= 2) {
    const observed = Math.min(3600, elapsed / measured);
    rate = ui.etaProfiles[profileKey] ? rate * .72 + observed * .28 : observed;
    ui.etaProfiles[profileKey] = rate;
    localStorage.setItem('homecloud-eta-profiles', JSON.stringify(ui.etaProfiles));
  }
  let seconds = Math.max(0, work.total - work.done) * rate;
  const currentIndex = phaseOrder.indexOf(job.phase);
  const explicitVideos = (job.paths || []).filter(path => videoExtensions.test(path)).length;
  const scopeTotal = Number(job.inventory?.total || job.paths?.length || job.total || 0);
  const scopeVideos = work.videoTotal || explicitVideos;
  if (currentIndex >= 0 && scopeTotal) {
    for (const phase of phaseOrder.slice(currentIndex + 1)) {
      const needed = phase === 'visual'
        ? (job.features?.visual || job.features?.ocr || job.features?.caption)
        : Boolean(job.features?.[phase]);
      if (!needed) continue;
      const units = scopeTotal + scopeVideos * (videoWeight(phase) - 1);
      seconds += units * Number(ui.etaProfiles[`${device.id}:${phase}`] || phaseSeconds[phase]);
    }
  }
  const videoNote = scopeVideos
    ? ` · учтено видео: ${formatNumber(scopeVideos)} × до ${videoWeight(job.phase, job)} кадров` : '';
  timing.cachedAt = now;
  timing.cached = `Осталось примерно ${durationText(seconds)}${videoNote}`;
  return timing.cached;
}

function renderProcessing(device) {
  const banner = $('#processingBanner');
  const job = device?.job || {};
  const active = Boolean(device?.online && job.active);
  banner.classList.toggle('hidden', !active);
  ui.activeProcessingId = active ? device.id : '';
  if (!active) return;
  const total = Number(job.total || 0);
  const completed = Number(job.completed || 0);
  const percent = jobPercent(job);
  const determinate = total > 0;
  const eta = processingEta(device);
  $('#processingTitle').textContent = jobLabels[job.phase] || 'Обработка фотографий';
  $('#processingDevice').textContent = device.name;
  $('#processingPercent').textContent = determinate ? `${percent}%` : '…';
  $('#processingTrack').classList.toggle('indeterminate', !determinate);
  $('#processingProgress').style.width = `${percent}%`;
  // Пока список файлов не собран, total неизвестен — показываем сам обход, а не «модель».
  const videos = job.phase === 'faces' && job.videos_done
    ? ` · видео: ${formatNumber(job.videos_done)}` : '';
  $('#processingSummary').textContent = (determinate
    ? `${formatNumber(completed)} из ${formatNumber(total)}`
    : job.found ? `Просмотрено файлов: ${formatNumber(job.found)}`
    : job.phase === 'faces' ? 'Собираю список файлов' : 'Готовлюсь') + videos
    + (eta ? ` · ${eta}` : '');
  $('#processingCurrent').textContent = job.current || '';
  $('#stopProcessing').classList.toggle('hidden', !ui.canEdit);
}

function renderDevices() {
  const grid = $('#deviceGrid');
  $('#devicesEmpty').classList.toggle('hidden', ui.devices.length > 0);
  const active = ui.devices.filter(item => item.job?.active).length;
  const online = ui.devices.filter(item => item.online).length;
  setCount('scanCount', active ? `${active} ↻` : String(online));
  $('#scanCount').classList.toggle('running', active > 0);
  grid.innerHTML = ui.devices.map(device => {
    const job = device.job || {};
    const percent = jobPercent(job);
    const eta = processingEta(device);
    const capabilities = device.device?.capabilities || {};
    const catalog = job.catalog || {
      photos: job.catalog_photos, faces: job.catalog_faces, videos: job.catalog_videos,
      indexed: job.catalog_indexed, ocr: job.catalog_ocr, captioned: job.catalog_captioned,
      adult: job.catalog_adult_analyzed,
    };
    const drives = device.device?.drives || [];
    const badges = Object.entries(featureInfo).map(([key, info]) =>
      `<span class="feature-badge ${capabilities[key] ? 'available' : 'unavailable'}">${capabilities[key] ? '✓' : '—'} ${info[0]}</span>`).join('');
    return `<article class="device-card ${device.online ? '' : 'offline'}" data-device-id="${escapeHtml(device.id)}">
      <header class="device-card-head"><div><div class="device-title"><span class="status-dot"></span>${escapeHtml(device.name)}</div>
        <div class="device-address">${escapeHtml(device.url)}</div></div>
        <span class="pill ${job.active ? 'running' : ''} ${device.online ? '' : 'error'}">${device.online ? (jobLabels[job.phase] || jobLabels[job.status] || 'В сети') : 'Не в сети'}</span></header>
      ${device.online ? `<div class="drive-list">${drives.map(d => { const free = d.free_gb ?? (d.free == null ? null : Math.round(d.free / 1073741824)); return `<span title="${escapeHtml(d.path)}">${escapeHtml(d.name || d.path)} · ${free == null ? '—' : `${formatNumber(free)} ГБ свободно`}</span>`; }).join('') || '<span>Диски не найдены</span>'}</div>
      <div class="capability-list">${badges}</div>
      <div class="device-metrics"><span><b>${formatNumber(catalog.photos)}</b> фото</span><span><b>${formatNumber(catalog.videos || 0)}</b> видео</span><span><b>${formatNumber(catalog.faces)}</b> лиц</span><span><b>${formatNumber(catalog.indexed)}</b> в индексе</span><span><b>${formatNumber(catalog.ocr)}</b> OCR</span><span><b>${formatNumber(catalog.captioned)}</b> описаний</span><span><b>${formatNumber(catalog.adult)}</b> 18+ проверено</span></div>
      ${job.active ? `<div class="device-progress"><div><span>${escapeHtml(jobLabels[job.phase] || 'Обработка')}</span><b>${percent}%</b></div><div class="progress-track"><span style="width:${percent}%"></span></div><small>${formatNumber(job.completed)} из ${formatNumber(job.total)}${job.videos_done ? ` · видео: ${formatNumber(job.videos_done)}` : ''}${eta ? ` · ${escapeHtml(eta)}` : ''} · ${escapeHtml(job.current || '')}</small></div>` : ''}`
      : `<p class="device-error">${escapeHtml(device.error || 'Устройство не отвечает')}</p>`}
      <footer class="device-actions ${ui.canEdit ? '' : 'hidden'}">
        <button class="button primary small device-scan" ${device.online ? '' : 'disabled'}>Выбрать папки и запустить</button>
        ${job.active ? '<button class="button danger small device-stop">Остановить</button>' : ''}
        <button class="button small device-edit">Настройки</button><button class="button small device-remove">Удалить</button>
      </footer></article>`;
  }).join('');
  renderProcessing(ui.devices.find(device => device.job?.active));
}

async function loadDevices() {
  if (!ui.session) return;
  const data = await api('/api/backends');
  ui.devices = data.backends || [];
  renderDevices();
}

function openBackendDialog(device = null) {
  $('#backendId').value = device?.id || '';
  $('#backendId').readOnly = Boolean(device);
  $('#backendName').value = device?.name || '';
  $('#backendUrl').value = device?.url || '';
  $('#backendToken').value = '';
  $('#backendToken').required = !device?.hasToken;
  $('#backendPrimary').checked = Boolean(device?.primary);
  $('#backendDialog').showModal();
}

function renderSelectedRoots() {
  const chips = [...ui.selectedRoots].map(path =>
    `<button type="button" class="root-chip" data-root="${escapeHtml(path)}">${escapeHtml(path)} <span>×</span></button>`);
  if (ui.selectedPaths.length) {
    chips.push(`<button type="button" class="root-chip" data-drop-paths="1">${formatNumber(ui.selectedPaths.length)} ${plural(ui.selectedPaths.length, 'выбранная фотография', 'выбранные фотографии', 'выбранных фотографий')} <span>×</span></button>`);
  }
  $('#selectedRoots').innerHTML = chips.join('')
    || '<small>Добавьте диск, папку или возьмите источник из прошлого запуска.</small>';
}

/* ---------- опись и дерево найденного ---------- */

const deviceUrl = tail => `/api/backends/${encodeURIComponent(ui.scanDeviceId)}/${tail}`;

const treeCount = (value, kind, title) => value
  ? `<span class="tree-badge ${kind}" title="${escapeHtml(title)}">${formatNumber(value)}</span>` : '';

function treeCounters(node) {
  return `<span class="tree-counts">
    <span class="tree-total">${formatNumber(node.subtree ?? node.files ?? 0)}</span>
    ${treeCount(node.new, 'new', 'новых с прошлого раза')}
    ${treeCount(node.changed, 'changed', 'изменились')}
    ${treeCount(node.missing, 'missing', 'пропали с диска')}
    ${treeCount(node.excluded, 'off', 'исключено')}</span>`;
}

async function loadTreeNode(path = '') {
  const data = await api(deviceUrl(`tree?path=${encodeURIComponent(path)}`));
  ui.treeNodes.set(path, data);
  return data;
}

const fileStates = {new: 'новый', changed: 'изменился', missing: 'пропал',
  excluded: 'исключён', known: ''};

function treeRows(path, depth) {
  const node = ui.treeNodes.get(path);
  if (!node) return '<div class="tree-row loading" style="--depth:' + depth + '">Загрузка…</div>';
  const folders = (node.directories || []).map(item => `
    <div class="tree-row ${item.off ? 'off' : ''}" style="--depth:${depth}">
      <button class="tree-toggle" type="button" data-open="${escapeHtml(item.path)}"
        aria-label="Раскрыть">${ui.treeOpen.has(item.path) ? '▾' : '▸'}</button>
      <span class="tree-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</span>
      ${treeCounters(item)}
      <button class="button small tree-off" type="button" data-toggle="${escapeHtml(item.path)}"
        >${item.off ? 'вернуть' : 'исключить'}</button>
    </div>${ui.treeOpen.has(item.path) ? treeRows(item.path, depth + 1) : ''}`).join('');
  const files = (node.files || []).map(item => `
    <div class="tree-row file ${item.off ? 'off' : ''}" style="--depth:${depth}">
      <span class="tree-dot"></span>
      <span class="tree-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</span>
      <span class="tree-counts"><span class="tree-state ${escapeHtml(item.state || '')}">${escapeHtml(fileStates[item.state] || '')}</span></span>
      <button class="button small tree-off" type="button" data-toggle="${escapeHtml(item.path)}"
        >${item.off ? 'вернуть' : 'исключить'}</button>
    </div>`).join('');
  return folders + files + (node.truncated
    ? `<div class="tree-row more" style="--depth:${depth}">показаны первые ${formatNumber(node.files.length)} файлов</div>` : '');
}

function renderTree() {
  const host = $('#scanTree');
  const base = ui.treeNodes.get('');
  const roots = base ? base.roots : [];
  $('#treeHint').hidden = roots.length > 0;
  host.innerHTML = roots.map(root => `
    <div class="tree-root">
      <div class="tree-row root ${ui.treeOpen.has(root.path) ? 'open' : ''}" style="--depth:0">
        <button class="tree-toggle" type="button" data-open="${escapeHtml(root.path)}"
          aria-label="Раскрыть">${ui.treeOpen.has(root.path) ? '▾' : '▸'}</button>
        <span class="tree-name" title="${escapeHtml(root.path)}">${escapeHtml(root.path)}</span>
        ${treeCounters({...root, subtree: root.files})}
        <button class="button small" type="button" data-refresh="${escapeHtml(root.path)}"
          >Обновить</button>
      </div>
      ${ui.treeOpen.has(root.path) ? treeRows(root.path, 1) : ''}
    </div>`).join('');
}

async function openTreeNode(path) {
  if (ui.treeOpen.has(path)) {
    ui.treeOpen.delete(path);
    return renderTree();
  }
  ui.treeOpen.add(path);
  renderTree();
  if (!ui.treeNodes.has(path)) {
    try { await loadTreeNode(path); } catch (error) { toast(error.message); }
  }
  renderTree();
}

async function toggleExclusion(path) {
  const excluded = [...ui.treeNodes.values()].some(node =>
    (node.directories || []).concat(node.files || []).some(item => item.path === path && item.off));
  try {
    await api(deviceUrl('exclusions'), {method: 'POST',
      body: JSON.stringify(excluded ? {remove: [path]} : {add: [path]})});
    ui.treeNodes.clear();
    await loadTreeNode('');
    for (const opened of [...ui.treeOpen]) {
      try { await loadTreeNode(opened); } catch { ui.treeOpen.delete(opened); }
    }
    renderTree();
    toast(excluded ? 'Вернули в обработку' : 'Исключено из обработки');
  } catch (error) { toast(error.message); }
}

/** Опись — отдельное задание: обходим папки и сверяем с прошлым разом. */
async function collectInventory(roots) {
  if (!roots.length) return toast('Сначала выберите диск или папку');
  if (ui.treeBusy) return;
  ui.treeBusy = true;
  $('#collectButton').disabled = true;
  try {
    await api(deviceUrl('job/start'), {method: 'POST',
      body: JSON.stringify({roots, features: {inventory: true}})});
    toast('Собираю список файлов…');
    let job = null;
    for (let attempt = 0; attempt < 3600; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await pollStatus();
      job = (ui.devices.find(item => item.id === ui.scanDeviceId) || {}).job || {};
      if (!job.active) break;
    }
    const found = job && job.inventory;
    ui.treeNodes.clear();
    await loadTreeNode('');
    roots.forEach(root => ui.treeOpen.add(root));
    for (const opened of [...ui.treeOpen]) {
      try { await loadTreeNode(opened); } catch { ui.treeOpen.delete(opened); }
    }
    renderTree();
    // Задание могло упасть или всё ещё идти — тогда «Список собран» вводит в
    // заблуждение: то, что нашли, показываем, но статус называем как есть.
    if (job?.status === 'error') {
      console.error('Сбор списка файлов упал:', job.error);
      toast(`Не удалось собрать список: ${(job.error || '').split('\n').pop() || 'ошибка на устройстве'}`);
    } else if (job?.active) {
      toast('Сбор списка файлов ещё не завершился — идёт дальше в фоне, загляните позже.');
    } else if (job?.status === 'stopped') {
      toast(found
        ? `Остановлено. Успели найти ${formatNumber(found.total)} · новых ${formatNumber(found.new)} · изменилось ${formatNumber(found.changed)}`
        : 'Остановлено, ничего не успели найти');
    } else {
      toast(found
        ? `Найдено ${formatNumber(found.total)} · новых ${formatNumber(found.new)} · изменилось ${formatNumber(found.changed)} · пропало ${formatNumber(found.missing)}`
        : 'Список собран');
    }
  } catch (error) {
    toast(error.message);
  } finally {
    ui.treeBusy = false;
    $('#collectButton').disabled = false;
  }
}

$('#collectButton').addEventListener('click', () => collectInventory([...ui.selectedRoots]));

$('#scanTree').addEventListener('click', event => {
  const open = event.target.closest('[data-open]');
  const toggle = event.target.closest('[data-toggle]');
  const refresh = event.target.closest('[data-refresh]');
  if (open) return openTreeNode(open.dataset.open);
  if (toggle) return toggleExclusion(toggle.dataset.toggle);
  if (refresh) return collectInventory([refresh.dataset.refresh]);
});

/* ---------- что уже сканировали ---------- */

const runMoment = value => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('ru-RU',
    {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});
};

const runTitle = run => run.roots.length
  ? run.roots.join(' · ')
  : `${formatNumber(run.paths.length)} ${plural(run.paths.length, 'фотография', 'фотографии', 'фотографий')}`;

async function loadScanHistory() {
  try {
    const data = await api(`/api/backends/${encodeURIComponent(ui.scanDeviceId)}/history`);
    ui.scanHistory = data.runs || [];
  } catch (error) {
    ui.scanHistory = [];
    console.warn('История заданий недоступна:', error.message);
  }
  renderScanHistory();
}

function renderScanHistory() {
  const host = $('#scanHistory');
  host.hidden = !ui.scanHistory.length;
  if (host.hidden) {
    host.innerHTML = '';
    return;
  }
  const names = {stopped: 'остановлено', error: 'ошибка', interrupted: 'прервано', running: 'идёт'};
  host.innerHTML = '<div class="history-head">Уже сканировали — нажмите, чтобы взять те же источники и включить другие этапы</div>' +
    ui.scanHistory.map((run, index) => {
      const done = run.done.map(name => (featureInfo[name] || [name])[0]).join(', ');
      const note = names[run.status] ? ` · ${names[run.status]}` : '';
      return `<div class="history-row">
        <button type="button" class="history-pick" data-index="${index}" title="${escapeHtml(runTitle(run))}">
          <span class="history-title">${escapeHtml(runTitle(run))}</span>
          <span class="history-meta">${formatNumber(run.photos)} фото · ${done
            ? `готово: ${escapeHtml(done)}` : 'ни один этап не завершён'} · ${escapeHtml(runMoment(run.last_run_at))}${note}</span>
        </button>
        <button type="button" class="history-forget" data-index="${index}" aria-label="Забыть источник">×</button>
      </div>`;
    }).join('');
}

$('#scanHistory').addEventListener('click', async event => {
  const pick = event.target.closest('.history-pick');
  const forget = event.target.closest('.history-forget');
  const run = ui.scanHistory[Number((pick || forget || {}).dataset?.index)];
  if (!run) return;
  if (pick) {
    ui.selectedRoots = new Set(run.roots);
    ui.selectedPaths = [...run.paths];
    renderSelectedRoots();
    return toast(`Источник взят: ${runTitle(run)}`);
  }
  try {
    await api(`/api/backends/${encodeURIComponent(ui.scanDeviceId)}/history/forget`,
      {method: 'POST', body: JSON.stringify({id: run.id})});
    ui.scanHistory = ui.scanHistory.filter(item => item.id !== run.id);
    renderScanHistory();
  } catch (error) { toast(error.message); }
});

function renderFeatures(device) {
  const capabilities = device.device?.capabilities || {};
  $('#featureList').innerHTML = Object.entries(featureInfo).map(([key, [title, text]]) =>
    `<label class="feature-option ${capabilities[key] ? '' : 'disabled'}"><input type="checkbox" data-feature="${key}" ${ui.selectedFeatures[key] ? 'checked' : ''} ${capabilities[key] ? '' : 'disabled'}><span><b>${title}</b><small>${capabilities[key] ? text : 'На этом устройстве компонент не установлен'}</small></span></label>`).join('');
  const models = device.device?.visual_models || [];
  $('#scanVisualModel').innerHTML = models.map(model =>
    `<option value="${escapeHtml(model.id)}" ${model.installed ? '' : 'disabled'}>${escapeHtml(model.name)} — ${escapeHtml(model.installed ? model.note : 'загружается')}</option>`).join('');
  $('#scanVisualModel').value = device.device?.visual_model || models.find(model => model.installed)?.id || '';
  $('#scanVisualModelField').hidden = !capabilities.visual;
}

async function loadBrowse(path = '') {
  const data = await api(`/api/backends/${encodeURIComponent(ui.scanDeviceId)}/browse?path=${encodeURIComponent(path)}`);
  ui.browsePath = data.path || '';
  ui.browseParent = data.parent ?? null;
  $('#browsePath').textContent = ui.browsePath || 'Диски';
  $('#browseUp').disabled = ui.browseParent === null;
  $('#selectBrowsePath').disabled = !ui.browsePath;
  $('#folderList').innerHTML = (data.entries || data.directories || []).map(entry =>
    `<div class="folder-row"><button type="button" class="folder-open" data-path="${escapeHtml(entry.path)}"><span>📁</span><span>${escapeHtml(entry.name || entry.path)}</span></button><button type="button" class="button small folder-add" data-path="${escapeHtml(entry.path)}">Добавить</button></div>`).join('') || '<div class="folder-empty">Нет доступных папок</div>';
}

async function openDeviceScan(id) {
  const device = ui.devices.find(item => item.id === id);
  if (!device?.online) return;
  ui.scanDeviceId = id;
  ui.selectedRoots.clear();
  ui.selectedPaths = [];
  ui.scanHistory = [];
  renderScanHistory();
  ui.selectedFeatures = {faces: true, visual: true, ocr: false, caption: false, adult: false};
  for (const key of Object.keys(ui.selectedFeatures)) {
    if (!device.device?.capabilities?.[key]) ui.selectedFeatures[key] = false;
  }
  $('#scanDeviceTitle').textContent = `Сканирование · ${device.name}`;
  renderFeatures(device);
  renderSelectedRoots();
  $('#folderList').innerHTML = '<div class="folder-empty">Загрузка…</div>';
  $('#scanForce').checked = false;
  $('#scanDeviceDialog').showModal();
  loadScanHistory();
  ui.treeNodes.clear();
  ui.treeOpen.clear();
  renderTree();
  loadTreeNode('').then(renderTree).catch(() => {});
  try { await loadBrowse(''); } catch (error) { toast(error.message); }
}

async function pollStatus() {
  if (!ui.session) return;
  if (ui.view === 'duplicates') await pollDuplicates();
  if (ui.view === 'training') {
    const wasActive = Boolean(ui.routerJob?.active);
    try {
      ui.routerJob = await api('/api/router/status');
      if (wasActive && !ui.routerJob.active) await loadTraining();
      else renderRouterProgress();
    } catch { /* сохраняем последнее состояние */ }
  }
  try {
    await loadDevices();
    const active = ui.devices.some(device => device.job?.active);
    if (ui.photoJobActive && !active) {
      ui.photoJobActive = false;
      await loadState();
      toast('Обработка фотографий завершена');
    }
  } catch { /* сохраняем последнее состояние */ }
}

/* ---------- навигация ---------- */

async function switchView(view, {historyMode = 'push'} = {}) {
  if (!validViews.has(view)) view = 'people';
  const changed = ui.view !== view;
  if (view !== 'photos') {
    if ($('#lightbox').open) $('#lightbox').close();
    ui.routePhoto = '';
  }
  if (!['people', 'review'].includes(view)) {
    if ($('#groupDialog').open) closeGroup();
    ui.routeGroup = '';
  }
  ui.view = view;
  document.title = `${({people: 'Люди', photos: 'Фотографии', review: 'Проверка',
    training: 'Обучение', scan: 'Сканирование', duplicates: 'Дубликаты', settings: 'Настройки'})[view]} · HomeCloud`;
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  $$('.view').forEach(element => element.classList.toggle('active', element.id === `${view}View`));
  $('#searchInput').placeholder = view === 'photos'
    ? 'Поиск по содержимому, тексту или имени файла' : 'Поиск людей и групп';
  $('#actionBar').classList.toggle('show', view === 'people' && ui.selectedGroups.size > 0 && ui.canEdit);
  if (view === 'photos') await loadPhotos();
  if (view === 'review') loadSimilarPairs();
  if (view === 'training') await loadTraining();
  if (view === 'scan') await pollStatus();
  if (view === 'settings') await loadSettings();
  if (view === 'duplicates') { await pollDuplicates(); await loadDuplicates(); }
  if (historyMode) syncUrl(historyMode);
  if (changed) scrollTo({top: 0, behavior: 'smooth'});
}

async function applyRouteFromLocation() {
  if (!ui.session || !ui.state) return;
  const {view, params} = parsedRoute();
  ui.applyingRoute = true;
  try {
    ui.selectedPeople = new Set(params.getAll('person').filter(Boolean));
    ui.selectedContentType = params.get('type') || '';
    ui.showBlurry = params.get('blurry') === '1';
    ui.showAdult = params.get('adult') === '1';
    ui.selectedKind = params.get('kind') || '';
    ui.folder = params.get('folder') || '';
    ui.folderDeep = params.get('folder_deep') !== '0';
    ui.album = Number(params.get('album') || 0);
    ui.hidden = params.get('hidden') === '1';
    ui.routePhoto = params.get('photo') || '';
    ui.routeGroup = params.get('group') || '';
    $('#searchInput').value = params.get('q') || '';
    $('#searchClear').classList.toggle('hidden', !$('#searchInput').value);
    syncFilterButtons();
    $('#adultMode').value = ui.adultMode;
    $('#peopleSearch').value = view === 'people' ? (params.get('q') || '') : '';
    renderPersonFilters();
    renderAlbums();
    await switchView(view, {historyMode: null});
    if (view === 'people') renderPeople();
    if (view === 'review') renderReview();
    if (ui.routePhoto && view === 'photos') {
      let index = ui.photos.findIndex(photo => photo.path === ui.routePhoto);
      if (index < 0) {
        try {
          const {photo} = await api(`/api/photo?path=${encodeURIComponent(ui.routePhoto)}`);
          ui.photos.push(photo);
          index = ui.photos.length - 1;
        } catch (error) { toast(error.message); ui.routePhoto = ''; }
      }
      if (index >= 0) openLightbox(index, {updateUrl: false});
    } else if ($('#lightbox').open) closeLightbox({fromHistory: true});
    if (ui.routeGroup && ['people', 'review'].includes(view)) {
      await openGroup(ui.routeGroup, {updateUrl: false});
    } else if ($('#groupDialog').open) closeGroup({fromHistory: true});
  } finally {
    ui.applyingRoute = false;
    history.replaceState(history.state || {}, '', routeHash());
  }
}

/* ---------- панель подборок ---------- */

$('#openSidepage').addEventListener('click', () => openSidepage());
$('#closeSidepage').addEventListener('click', closeSidepage);
$('#sidepageBackdrop').addEventListener('click', closeSidepage);
$('#sidepageTabs').addEventListener('click', event => {
  const tab = event.target.closest('[data-panel]');
  if (tab) showSidepageTab(tab.dataset.panel);
});
$('#sidePeopleSearch').addEventListener('input', () => renderPersonFilters());
$('#peopleSearch').addEventListener('input', () => {
  clearTimeout(ui.timers.people);
  ui.timers.people = setTimeout(() => { syncUrl('replace'); renderPeople(); }, 140);
});
$('#saveSettings').addEventListener('click', () => saveSettings());
$('#hideSelectedPhotos').addEventListener('click', () => (ui.hidden
  ? revealPhotos([...ui.selectedPhotos]) : hidePhotos([...ui.selectedPhotos])));
$('#hideLightboxPhoto').addEventListener('click', () => {
  const photo = ui.photos[ui.lightboxIndex];
  if (!photo) return;
  closeLightbox();
  return ui.hidden ? revealPhotos([photo.path]) : hidePhotos([photo.path]);
});
$('#dupScan').addEventListener('click', async () => {
  try {
    const data = await api('/api/duplicates/scan',
      {method: 'POST', body: JSON.stringify({similar: $('#dupSimilar').checked})});
    renderDupProgress(data.job);
    toast('Поиск дубликатов запущен');
  } catch (error) { toast(error.message); }
});
$('#dupStop').addEventListener('click', async () => {
  try { await api('/api/duplicates/stop', {method: 'POST', body: '{}'}); }
  catch (error) { toast(error.message); }
});
$('#dupSimilar').addEventListener('change', () => loadDuplicates());
$('#dupSelectAll').addEventListener('click', () => { ui.dupSkip.clear(); renderDuplicates(); });
$('#dupDelete').addEventListener('click', deleteDuplicates);
$('#createAlbum').addEventListener('click', async () => {
  const title = prompt('Название альбома, например «2010 год»');
  if (!title) return;
  try {
    await albumCall('/api/albums/create', {title}, 'Альбом создан');
  } catch (error) { toast(error.message); }
});
$('#albumSelectedPhotos').addEventListener('click', () => openAlbumPick([...ui.selectedPhotos]));
$('#cancelAlbumPick').addEventListener('click', () => $('#albumPickDialog').close());
$('#albumPickDialog').querySelector('.dialog-close')
  .addEventListener('click', () => $('#albumPickDialog').close());
$('#albumPickForm').addEventListener('submit', async event => {
  event.preventDefault();
  const title = $('#albumPickTitle').value.trim();
  if (!title) return toast('Введите название альбома');
  try {
    const data = await albumCall('/api/albums/create',
      {title, parent_id: Number($('#albumPickParent').value || 0), paths: ui.albumPaths},
      'Альбом создан');
    $('#albumPickDialog').close();
    refreshAlbumsOfPhotos(data.id);
  } catch (error) { toast(error.message); }
});
$('#resetFilters').addEventListener('click', () => {
  ui.selectedPeople.clear();
  ui.folder = '';
  ui.album = 0;
  ui.selectedKind = '';
  ui.hidden = false;
  setContentType('');
  ui.showBlurry = false;
  ui.showAdult = false;
  syncFilterButtons();
  renderPersonFilters();
  renderAlbums();
  renderFolders();
  syncUrl('replace');
  loadPhotos();
});

$$('.nav-item').forEach(item => item.addEventListener('click', () => {
  if (item.dataset.view !== ui.view) {
    $('#searchInput').value = '';
    $('#searchClear').classList.add('hidden');
  }
  switchView(item.dataset.view, {historyMode: 'push'});
}));
addEventListener('hashchange', () => applyRouteFromLocation().catch(error => toast(error.message)));

$('#searchInput').addEventListener('input', () => {
  $('#searchClear').classList.toggle('hidden', !$('#searchInput').value);
  clearTimeout(ui.timers.search);
  ui.timers.search = setTimeout(
    () => {
      syncUrl('replace');
      return ui.view === 'photos' ? loadPhotos() : renderPeople();
    },
    ui.view === 'photos' ? 450 : 160);
});
$('#searchClear').addEventListener('click', () => {
  $('#searchInput').value = '';
  $('#searchClear').classList.add('hidden');
  syncUrl('replace');
  ui.view === 'photos' ? loadPhotos() : renderPeople();
});

$('#clearSelectionButton').addEventListener('click', () => {
  ui.selectedGroups.clear();
  selectionPicker.clear();
  renderPeople();
});
$('#assignGroupsButton').addEventListener('click', () => {
  const name = selectionPicker.name;
  const conflicts = namedInSelection(name);
  if (conflicts.length && !confirm(
    `В выборе уже названные люди: ${conflicts.map(group =>
      `${group.title} — ${group.count} ${plural(group.count, 'лицо', 'лица', 'лиц')}`).join(', ')}.`
    + `\nИх лица перейдут к «${name}». Продолжить?`)) return;
  mutate('/api/assign-groups',
    {group_keys: [...ui.selectedGroups], name, bigfam_id: selectionPicker.bigfamId},
    'Группы объединены и названы');
});
$('#assignWholeGroup').addEventListener('click', () => mutate('/api/assign-groups',
  {group_keys: [ui.currentGroup.key], name: dialogPicker.name, bigfam_id: dialogPicker.bigfamId},
  'Имя сохранено'));
$('#assignSelectedFaces').addEventListener('click', () => mutate('/api/assign-faces',
  {face_ids: [...ui.selectedFaces], name: dialogPicker.name, bigfam_id: dialogPicker.bigfamId},
  'Выбранные лица назначены'));
$('#excludeSelectedFaces').addEventListener('click', () => mutate('/api/exclude',
  {face_ids: [...ui.selectedFaces]}, 'Лица перемещены в проверку'));
$('#selectAllFaces').addEventListener('click', () => {
  const all = ui.selectedFaces.size === ui.currentGroup.faces.length;
  ui.selectedFaces.clear();
  if (!all) ui.currentGroup.faces.forEach(face => ui.selectedFaces.add(face.id));
  renderFaces();
});
$('#closeDialog').addEventListener('click', () => closeGroup());
$('#groupDialog').addEventListener('click', event => {
  if (event.target === $('#groupDialog')) closeGroup();
});
$('#groupDialog').addEventListener('cancel', event => {
  event.preventDefault();
  closeGroup();
});
$('#lightbox').addEventListener('click', event => {
  if (event.target === $('#lightbox')) closeLightbox();
});

// Метки групп лежат в каталоге: при сканировании считаются только новые лица,
// а полная пересборка — отдельная осознанная команда.
$('#reclusterButton').addEventListener('click', async event => {
  const button = event.currentTarget;
  if (!confirm('Пересобрать автоматические группы заново? Имена и исключения останутся, '
    + 'а безымянные группы соберутся по-новому. Это может занять минуту.')) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Собираю…';
  try {
    const result = await api('/api/recluster', {method: 'POST', body: '{}'});
    ui.state = result.state || ui.state;
    renderStats();
    renderPeople();
    renderReview();
    renderPersonFilters();
    toast('Группы пересобраны');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});

$('#undoButton').addEventListener('click', async () => {
  try {
    const result = await api('/api/undo', {method: 'POST', body: '{}'});
    await loadState();
    toast(result.description ? `Отменено: ${result.description}` : 'Нет действий для отмены');
  } catch (error) { toast(error.message); }
});

$('#themeButton').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('theme', dark ? 'dark' : 'light');
});

$('#addBackendButton').addEventListener('click', () => openBackendDialog());
$('#cancelBackend').addEventListener('click', () => $('#backendDialog').close());
$('#cancelDeviceScan').addEventListener('click', () => $('#scanDeviceDialog').close());
$$('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

$('#backendForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/backends/save', {method: 'POST', body: JSON.stringify({
      id: $('#backendId').value.trim(), name: $('#backendName').value.trim(),
      url: $('#backendUrl').value.trim(), token: $('#backendToken').value,
      primary: $('#backendPrimary').checked,
    })});
    $('#backendDialog').close();
    await loadDevices();
    toast('Устройство сохранено');
  } catch (error) { toast(error.message); }
});

/** Перенос в скрытый альбом: файл уезжает в личную папку на устройстве. */
async function hidePhotos(paths) {
  if (!paths.length) return;
  if (!confirm(`Перенести ${formatNumber(paths.length)} ${plural(paths.length,
    'снимок', 'снимка', 'снимков')} в скрытый альбом?\n`
    + 'Файлы переедут в личную папку и пропадут у остальных.')) return;
  try {
    const data = await api('/api/photos/hide',
      {method: 'POST', body: JSON.stringify({paths})});
    toast(`Скрыто: ${formatNumber(data.hidden)}${data.errors.length
      ? `, не удалось: ${data.errors.length}` : ''}`);
    ui.selectedPhotos.clear();
    await loadState();
    await loadPhotos();
  } catch (error) { toast(error.message); }
}

async function revealPhotos(paths) {
  if (!paths.length) return;
  try {
    const data = await api('/api/photos/reveal',
      {method: 'POST', body: JSON.stringify({paths})});
    toast(`Возвращено: ${formatNumber(data.revealed)}${data.errors.length
      ? `, не удалось: ${data.errors.length}` : ''}`);
    ui.selectedPhotos.clear();
    await loadState();
    await loadPhotos();
  } catch (error) { toast(error.message); }
}

/* ---------- дубликаты ---------- */

const megabytes = value => `${(Number(value || 0) / 1048576).toFixed(1)} МБ`;

const DUP_PAGE = 40;

async function loadDuplicates({append = false} = {}) {
  const offset = append ? ui.duplicates.length : 0;
  try {
    const data = await api(`/api/duplicates?similar=${$('#dupSimilar').checked ? 1 : 0}`
      + `&limit=${DUP_PAGE}&offset=${offset}`);
    ui.duplicates = append ? [...ui.duplicates, ...(data.groups || [])] : (data.groups || []);
    ui.dupTotal = data.total || 0;
    ui.duplicates.forEach(group => {
      if (!ui.dupKeep[group.key]) ui.dupKeep[group.key] = group.keep;
    });
    renderDuplicates();
  } catch (error) { toast(error.message); }
}

/** Лишние в группе — все пути, кроме выбранного; карточек показываем дюжину. */
function dupExtras(group) {
  const keep = ui.dupKeep[group.key] || group.keep;
  return (group.paths || group.photos.map(photo => photo.path))
    .filter(path => path !== keep);
}

function renderDuplicates() {
  const host = $('#dupList');
  host.innerHTML = ui.duplicates.map(group => {
    const keep = ui.dupKeep[group.key] || group.keep;
    const off = ui.dupSkip.has(group.key);
    return `<article class="dup-group ${off ? 'off' : ''}" data-key="${escapeHtml(group.key)}">
      <header>
        <label class="check-row"><input type="checkbox" data-group="${escapeHtml(group.key)}"
          ${off ? '' : 'checked'}> ${group.kind === 'exact' ? 'Точные копии' : 'Похожие кадры'}
          · ${formatNumber(group.count || group.photos.length)}</label>
        <span class="dup-gain">освободится ${megabytes(group.extra)}</span>
      </header>
      <div class="dup-row">${group.photos.map(photo => `
        <figure class="dup-card ${photo.path === keep ? 'keep' : ''}"
          data-path="${escapeHtml(photo.path)}" data-key="${escapeHtml(group.key)}">
          <img src="${escapeHtml(photoMediaUrl(photo, 320))}" alt=""
            loading="lazy" decoding="async">
          <figcaption>
            <b>${photo.width ? `${photo.width}×${photo.height}` : megabytes(photo.size)}</b>
            <span>${photo.width ? megabytes(photo.size) : (photo.kind === 'video'
              ? 'видео' : 'точная копия')}</span>
            <small title="${escapeHtml(photo.path)}">${escapeHtml(photo.folder)}</small>
          </figcaption>
          <span class="dup-mark">${photo.path === keep ? 'оставим' : 'в корзину'}</span>
        </figure>`).join('')}${(group.count || 0) > group.photos.length
          ? `<div class="dup-more">и ещё ${formatNumber(
            group.count - group.photos.length)}</div>` : ''}</div>
    </article>`;
  }).join('') + (ui.duplicates.length < ui.dupTotal
    ? '<button class="button" id="dupMore" type="button">Показать ещё группы</button>' : '');
  $('#dupEmpty').classList.toggle('hidden', ui.duplicates.length > 0);
  host.querySelectorAll('[data-group]').forEach(box => box.addEventListener('change', () => {
    box.checked ? ui.dupSkip.delete(box.dataset.group) : ui.dupSkip.add(box.dataset.group);
    renderDuplicates();
  }));
  host.querySelectorAll('.dup-card').forEach(card => card.addEventListener('click', () => {
    ui.dupKeep[card.dataset.key] = card.dataset.path;
    renderDuplicates();
  }));
  $('#dupMore')?.addEventListener('click', () => loadDuplicates({append: true}));
  renderDupSummary();
}

function renderDupSummary() {
  const active = ui.duplicates.filter(group => !ui.dupSkip.has(group.key));
  const extras = active.flatMap(dupExtras);
  const bytes = active.reduce((sum, group) => sum + group.extra, 0);
  $('#dupSummary').textContent = ui.dupTotal
    ? `${formatNumber(ui.dupTotal)} ${plural(ui.dupTotal, 'группа', 'группы', 'групп')}`
    : 'Каталог';
  setCount('dupCount', ui.dupTotal || '—');
  $('#dupActionBar').classList.toggle('hidden', !extras.length || !ui.canEdit);
  $('#dupSelectionCount').textContent = `${formatNumber(active.length)} ${plural(active.length,
    'группа', 'группы', 'групп')}`;
  $('#dupDelete').textContent = `Удалить лишнее — ${formatNumber(extras.length)} ${plural(
    extras.length, 'снимок', 'снимка', 'снимков')}, ${megabytes(bytes)}`;
}

function renderDupProgress(job) {
  ui.dupJob = job;
  const running = ['counting', 'running'].includes(job.status);
  $('#dupProgress').classList.toggle('hidden', !running);
  $('#dupScan').disabled = running;
  if (!running) return;
  const percent = job.total ? Math.round(job.done / job.total * 100) : 0;
  $('#dupPercent').textContent = `${percent}%`;
  $('#dupBar').style.width = `${percent}%`;
  $('#dupStatus').textContent = job.status === 'counting'
    ? 'Собираем список файлов' : `Считаем хеши: ${formatNumber(job.done)} из ${formatNumber(job.total)}`;
  $('#dupCurrent').textContent = job.current || '';
}

async function pollDuplicates() {
  try {
    const job = await api('/api/duplicates/status');
    const was = ui.dupJob && ['counting', 'running'].includes(ui.dupJob.status);
    renderDupProgress(job);
    if (was && !['counting', 'running'].includes(job.status)) await loadDuplicates();
  } catch (error) { /* раздел мог быть закрыт */ }
}

async function deleteDuplicates() {
  const extras = ui.duplicates.filter(group => !ui.dupSkip.has(group.key)).flatMap(dupExtras);
  if (!extras.length) return;
  const paths = extras;
  if (!confirm(`Удалить ${formatNumber(paths.length)} ${plural(paths.length,
    'снимок', 'снимка', 'снимков')} в корзину?\nВ каждой группе останется отмеченный кадр.`)) return;
  let deleted = 0;
  let failed = 0;
  try {
    // Бэкенд принимает до 500 путей за раз — идём партиями.
    for (let from = 0; from < paths.length; from += 200) {
      const data = await api('/api/photos/delete',
        {method: 'POST', body: JSON.stringify({paths: paths.slice(from, from + 200)})});
      deleted += data.deleted;
      failed += data.errors.length;
      toast(`Удалено ${formatNumber(deleted)} из ${formatNumber(paths.length)}…`);
    }
    toast(`Удалено: ${formatNumber(deleted)}${failed ? `, ошибок: ${failed}` : ''}`);
    ui.dupKeep = {};
    await loadDuplicates();
    await loadState();
  } catch (error) { toast(error.message); }
}

function openPhotoProcess(paths) {
  ui.processPaths = [...new Set(paths)].filter(Boolean);
  if (!ui.processPaths.length) return;
  $('#photoProcessCount').textContent = `${formatNumber(ui.processPaths.length)} ${plural(ui.processPaths.length, 'фотография', 'фотографии', 'фотографий')}`;
  $('#photoProcessForce').checked = false;
  $('#photoProcessDialog').showModal();
}

async function deletePhotos(paths) {
  const unique = [...new Set(paths)].filter(Boolean);
  if (!unique.length) return;
  if (!confirm(`Переместить в корзину ${unique.length} ${plural(unique.length, 'фотографию', 'фотографии', 'фотографий')}?`)) return;
  try {
    const result = await api('/api/photos/delete', {method: 'POST', body: JSON.stringify({paths: unique})});
    closeLightbox();
    ui.selectedPhotos.clear();
    await loadState();
    toast(result.errors?.length ? `Удалено ${result.deleted}, ошибок ${result.errors.length}` : `Перемещено в корзину: ${result.deleted}`);
  } catch (error) { toast(error.message); }
}

$('#selectAllPhotos').addEventListener('click', () => {
  ui.photos.forEach(photo => ui.selectedPhotos.add(photo.path));
  renderPhotoSelection();
});
$('#clearPhotoSelection').addEventListener('click', () => {
  ui.selectedPhotos.clear();
  renderPhotoSelection();
});
$('#processSelectedPhotos').addEventListener('click', () => openPhotoProcess([...ui.selectedPhotos]));
$('#deleteSelectedPhotos').addEventListener('click', () => deletePhotos([...ui.selectedPhotos]));
$('#processLightboxPhoto').addEventListener('click', () =>
  openPhotoProcess([ui.photos[ui.lightboxIndex]?.path]));
$('#deleteLightboxPhoto').addEventListener('click', () =>
  deletePhotos([ui.photos[ui.lightboxIndex]?.path]));
$('#cancelPhotoProcess').addEventListener('click', () => $('#photoProcessDialog').close());
$('#photoFeatureList').addEventListener('change', event => {
  if (!['ocr', 'caption'].includes(event.target.dataset.feature) || !event.target.checked) return;
  $('#photoFeatureList [data-feature="visual"]').checked = true;
  if (event.target.dataset.feature === 'caption') {
    $('#photoFeatureList [data-feature="adult"]').checked = true;
  }
});
$('#photoProcessForm').addEventListener('submit', async event => {
  event.preventDefault();
  const features = Object.fromEntries($$('#photoFeatureList [data-feature]').map(
    input => [input.dataset.feature, input.checked]));
  if (!Object.values(features).some(Boolean)) return toast('Выберите хотя бы одну возможность');
  try {
    await api('/api/photos/process', {method: 'POST', body: JSON.stringify({
      paths: ui.processPaths, features, force: $('#photoProcessForce').checked,
    })});
    ui.photoJobActive = true;
    $('#photoProcessDialog').close();
    toast(`Обработка запущена: ${ui.processPaths.length}`);
    pollStatus();
  } catch (error) { toast(error.message); }
});

$('#deviceGrid').addEventListener('click', async event => {
  const card = event.target.closest('[data-device-id]');
  if (!card) return;
  const id = card.dataset.deviceId;
  if (event.target.closest('.device-scan')) return openDeviceScan(id);
  if (event.target.closest('.device-edit')) return openBackendDialog(ui.devices.find(item => item.id === id));
  if (event.target.closest('.device-stop')) {
    try { await api(`/api/backends/${encodeURIComponent(id)}/job/stop`, {method: 'POST', body: '{}'}); toast('Остановка запрошена'); await loadDevices(); }
    catch (error) { toast(error.message); }
  }
  if (event.target.closest('.device-remove')) {
    try { await api('/api/backends/remove', {method: 'POST', body: JSON.stringify({id})}); toast('Устройство удалено'); await loadDevices(); }
    catch (error) { toast(error.message); }
  }
});

$('#stopProcessing').addEventListener('click', async () => {
  if (!ui.activeProcessingId) return;
  try {
    await api(`/api/backends/${encodeURIComponent(ui.activeProcessingId)}/job/stop`, {
      method: 'POST', body: '{}',
    });
    toast('Безопасная остановка запрошена');
    await loadDevices();
  } catch (error) { toast(error.message); }
});

$('#folderList').addEventListener('click', event => {
  const open = event.target.closest('.folder-open');
  const add = event.target.closest('.folder-add');
  if (open) loadBrowse(open.dataset.path).catch(error => toast(error.message));
  if (add) { ui.selectedRoots.add(add.dataset.path); renderSelectedRoots(); }
});
$('#browseUp').addEventListener('click', () => loadBrowse(ui.browseParent || '').catch(error => toast(error.message)));
$('#selectBrowsePath').addEventListener('click', () => { if (ui.browsePath) ui.selectedRoots.add(ui.browsePath); renderSelectedRoots(); });
$('#selectedRoots').addEventListener('click', event => {
  const chip = event.target.closest('[data-root]');
  if (chip) { ui.selectedRoots.delete(chip.dataset.root); renderSelectedRoots(); }
  if (event.target.closest('[data-drop-paths]')) { ui.selectedPaths = []; renderSelectedRoots(); }
});
$('#featureList').addEventListener('change', event => {
  const key = event.target.dataset.feature;
  if (!key) return;
  ui.selectedFeatures[key] = event.target.checked;
  if ((key === 'ocr' || key === 'caption') && event.target.checked) {
    ui.selectedFeatures.visual = true;
    const visual = $('#featureList [data-feature="visual"]');
    if (visual && !visual.disabled) visual.checked = true;
    if (key === 'caption') {
      ui.selectedFeatures.adult = true;
      const adult = $('#featureList [data-feature="adult"]');
      if (adult && !adult.disabled) adult.checked = true;
    }
  }
});
$('#scanDeviceForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!ui.selectedRoots.size && !ui.selectedPaths.length) {
    return toast('Выберите диск, папку или источник из прошлого запуска');
  }
  if (!Object.values(ui.selectedFeatures).some(Boolean)) return toast('Выберите хотя бы одну возможность');
  try {
    await api(`/api/backends/${encodeURIComponent(ui.scanDeviceId)}/job/start`, {method: 'POST', body: JSON.stringify({
      roots: [...ui.selectedRoots], paths: ui.selectedPaths,
      features: ui.selectedFeatures, force: $('#scanForce').checked,
      visual_model: $('#scanVisualModel').value,
    })});
    $('#scanDeviceDialog').close();
    await loadDevices();
    toast('Задание запущено на устройстве');
  } catch (error) { toast(error.message); }
});

$('#contentFilters').querySelectorAll('.chip').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.kind) {
    ui.selectedKind = ui.selectedKind === button.dataset.kind ? '' : button.dataset.kind;
    button.classList.toggle('active', Boolean(ui.selectedKind));
  } else if (button.dataset.blurry) {
    ui.showBlurry = !ui.showBlurry;
    button.classList.toggle('active', ui.showBlurry);
  } else if (button.dataset.adult) {
    ui.showAdult = !ui.showAdult;
    button.classList.toggle('active', ui.showAdult);
  } else {
    ui.selectedContentType = button.dataset.type || '';
    $('#contentFilters').querySelectorAll('[data-type]')
      .forEach(item => item.classList.toggle('active', item === button));
  }
  renderGalleryContext();
  syncUrl('replace');
  loadPhotos();
}));

$('#adultMode').addEventListener('change', async event => {
  const was = ui.adultMode;
  ui.adultMode = event.target.value;
  localStorage.setItem('homecloud-adult-mode', ui.adultMode);
  // «Скрывать совсем» убирает такие кадры и из лиц — состояние надо перечитать.
  if (was === 'hide' || ui.adultMode === 'hide') await loadState();
  if (ui.view === 'training') loadTraining();
  else loadPhotos();
});

document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('#searchInput').focus();
  }
  if (event.key === 'Escape' && !$('#sidepage').hidden) closeSidepage();
  if (event.key === 'Escape' && ui.selectedGroups.size && !$('#groupDialog').open) {
    ui.selectedGroups.clear();
    renderPeople();
  }
});

addEventListener('scroll', () => $('#topbar').classList.toggle('stuck', scrollY > 4), {passive: true});

/* ---------- запуск ---------- */

async function boot() {
  const session = await (await fetch('/api/session')).json();
  ui.session = session.user;
  ui.canEdit = Boolean(session.canEdit);
  ui.bigfamUrl = session.bigfamUrl || '#';
  ui.kin = null;
  renderAccount();
  if (!ui.session) { showLogin(); return; }
  $('#peopleGrid').innerHTML = skeletons(12, 'tile');
  await loadState().catch(error => toast(error.message));
  await loadAlbums();
  await applyRouteFromLocation();
  loadKin();
  await pollStatus();
  clearInterval(ui.timers.poll);
  ui.timers.poll = setInterval(() => { if (!document.hidden) pollStatus(); }, 1500);
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
boot().catch(error => toast(error.message));
