import type {AdultMode, ZoomLevel} from '../../types/domain';
import type {ThemeMode} from '../../store/slices/prefs';
import type {IconName} from '../../ui/Icon/Icon';

export type SettingValue = string | number | boolean;

export interface ChoiceOption {
  value: string;
  label: string;
  /** Вторая строка карточки варианта. */
  note?: string;
}

interface FieldBase {
  key: string;
  label: string;
  /** Одна короткая строка под названием; длинные абзацы здесь не читал никто. */
  hint?: string;
  /**
   * Значение по умолчанию — для кнопки «вернуть как было». Только у личных
   * настроек браузера: для каталога бэкенд сам отдаёт defaults.
   */
  default?: SettingValue;
  /** Спрятано под «Тонкой настройкой»: трогать нужно редко. */
  advanced?: boolean;
  /** Строка видна, только пока другая настройка равна этому значению. */
  showIf?: {key: string; equals: SettingValue};
}

export type SettingField = FieldBase & (
  | {kind: 'switch'}
  | {
      kind: 'number';
      min: number;
      max: number;
      step: number;
      unit?: string;
      /** Что значит ноль, если он особенный: «без ограничения», «весь ролик». */
      zero?: string;
    }
  | {
      kind: 'range';
      min: number;
      max: number;
      step: number;
      /** Подписи краёв шкалы. */
      low: string;
      high: string;
    }
  | {kind: 'text'; placeholder?: string; mono?: boolean}
  | {kind: 'choice'; look: 'segmented' | 'cards'; options: ChoiceOption[]}
  /** Модели визуального индекса приходят с бэкенда вместе с настройками. */
  | {kind: 'visualModel'}
  /** Список строк, в каталоге хранится одной строкой через перевод строки. */
  | {kind: 'list'; placeholder: string; empty: string; pickFolder?: boolean}
);

export type SettingsGroupId = 'recognition' | 'library' | 'view';

export interface SettingsGroup {
  id: SettingsGroupId;
  icon: IconName;
  title: string;
  note: string;
}

/**
 * Девять карточек подряд читались как свалка, и половина из них к тому же
 * относится к разным вещам: к тому, что считают модели, к тому, что вообще
 * попадает в каталог, и к виду на этом устройстве.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {id: 'recognition', icon: 'process', title: 'Распознавание', note: 'Что и как считают модели'},
  {id: 'library', icon: 'folder', title: 'Библиотека', note: 'Что попадает в каталог'},
  {id: 'view', icon: 'palette', title: 'Вид', note: 'Только в этом браузере'},
];

export interface SettingsSection {
  id: string;
  group: SettingsGroupId;
  icon: IconName;
  title: string;
  note: string;
  /**
   * Главный выключатель раздела: стоит в заголовке карточки, и пока он
   * выключен, остальные строки неактивны.
   */
  toggle?: string;
  fields: SettingField[];
  /** Поля живут в этом браузере (prefs), а не в каталоге. */
  browser?: boolean;
  footer?: 'excluded';
}

/**
 * Прежде состоянием формы была сама разметка: одна функция вычитывала
 * значения из DOM, другая соскребала их обратно в запрос. Теперь и форма,
 * и поиск по настройкам строятся из этого описания.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'visual',
    group: 'recognition',
    icon: 'searchImage',
    title: 'Визуальный поиск',
    note: 'Модель, по которой ищется «что на снимке». Индексы разных моделей хранятся '
      + 'отдельно — переключение ничего не стирает.',
    fields: [{
      kind: 'visualModel', key: 'visual_model', label: 'Модель индекса',
      hint: 'После выбора новой модели запустите «Визуальный индекс» в «Анализе».',
    }],
  },
  {
    id: 'faces',
    group: 'recognition',
    icon: 'people',
    title: 'Подсказки по лицам',
    note: 'На карточке безымянной группы появляется догадка «похоже на …». Сама ничего '
      + 'не переименовывает.',
    toggle: 'face_suggest_enabled',
    fields: [
      {kind: 'switch', key: 'face_suggest_enabled', label: 'Показывать догадки'},
      {
        kind: 'range', key: 'face_suggest_threshold', label: 'Порог похожести',
        min: 0.3, max: 0.95, step: 0.01,
        low: 'чаще, но с ошибками', high: 'реже, но вернее',
        hint: 'Чужие люди на реальном каталоге не поднимались выше 0.53 — 0.60 с запасом.',
      },
      {
        kind: 'number', key: 'noise_cluster_size', label: 'Размер группы при разборе остатка',
        min: 2, max: 8, step: 1, unit: 'лиц', advanced: true,
        hint: 'Сколько похожих лиц нужно, чтобы «Разобрать остаток» собрал из них группу.',
      },
    ],
  },
  {
    id: 'video',
    group: 'recognition',
    icon: 'video',
    title: 'Видео',
    note: 'Лица ищутся по всему ролику, появления одного человека собираются в треки.',
    toggle: 'video_enabled',
    fields: [
      {kind: 'switch', key: 'video_enabled', label: 'Разбирать видео'},
      {
        kind: 'number', key: 'video_min_seconds', label: 'Пропускать ролики короче',
        min: 0, max: 3600, step: 1, unit: 'с', zero: 'брать любые',
      },
      {
        kind: 'number', key: 'video_max_seconds', label: 'Смотреть только начало ролика',
        min: 0, max: 86400, step: 1, unit: 'с', zero: 'весь ролик',
      },
      {
        kind: 'number', key: 'video_track_step', label: 'Искать лицо каждые',
        min: 0.1, max: 5, step: 0.1, unit: 'с', advanced: true,
        hint: 'Чаще — плотнее треки и меньше пропусков, но дольше счёт.',
      },
      {
        kind: 'number', key: 'video_track_gap', label: 'Закрывать трек после паузы',
        min: 0.3, max: 10, step: 0.1, unit: 'с', advanced: true,
        hint: 'Лицо на миг отвернулось или заслонилось — трек продолжится.',
      },
      {
        kind: 'number', key: 'video_track_best', label: 'Лучших кадров на трек',
        min: 1, max: 30, step: 1, unit: 'кадр.', advanced: true,
        hint: 'Самые чёткие кадры трека усредняются в один отпечаток лица.',
      },
      {
        kind: 'number', key: 'adult_video_frames', label: 'Кадров на проверку 18+',
        min: 1, max: 20, step: 1, unit: 'кадр.', advanced: true,
        hint: 'Берутся равномерно по всей длине, в счёт идёт худший.',
      },
    ],
  },
  {
    id: 'caption',
    group: 'recognition',
    icon: 'notes',
    title: 'Описание изображений',
    note: 'Подпись для поиска пишет модель-«зрение»: своя видеокарта или запущенный рядом LM Studio.',
    fields: [
      {
        kind: 'choice', look: 'segmented', key: 'caption_backend', label: 'Где считать',
        options: [
          {value: 'local', label: 'Своя видеокарта'},
          {value: 'lmstudio', label: 'LM Studio'},
        ],
      },
      {
        // Нужна обоим источникам: LM Studio тоже получает имя модели.
        kind: 'text', key: 'caption_model', label: 'Модель', mono: true,
        hint: 'Для видеокарты — уже загруженная с Hugging Face, для LM Studio — запущенная в нём.',
      },
      {
        kind: 'text', key: 'caption_lmstudio_url', label: 'Адрес LM Studio', mono: true,
        showIf: {key: 'caption_backend', equals: 'lmstudio'},
      },
    ],
  },
  {
    id: 'speech',
    group: 'recognition',
    icon: 'mic',
    title: 'Речь в видео',
    note: 'Сказанное в ролике расшифровывается Whisper на своей видеокарте.',
    fields: [
      {
        kind: 'choice', look: 'cards', key: 'speech_model', label: 'Модель',
        options: [
          {value: 'large-v3', label: 'large-v3', note: 'Точнее всего'},
          {value: 'medium', label: 'medium', note: 'Быстрее, грубее'},
          {value: 'small', label: 'small', note: 'Для слабой видеокарты'},
        ],
      },
      {
        kind: 'text', key: 'speech_language', label: 'Язык записи', placeholder: 'auto',
        mono: true,
        hint: 'auto — определять по речи, либо код языка, например ru.',
      },
      {
        kind: 'text', key: 'speech_fallback_language', label: 'Язык архива', placeholder: 'ru',
        mono: true, advanced: true,
        hint: 'Когда определению нельзя верить: на паре секунд шума язык угадывается наугад.',
      },
    ],
  },
  {
    id: 'paths',
    group: 'library',
    icon: 'folder',
    title: 'Пути вне библиотеки',
    note: 'Эти папки не сканируются и не показываются: ни снимков, ни лиц, ни дубликатов. '
      + 'Применяется сразу, пересканировать не нужно.',
    footer: 'excluded',
    fields: [
      {
        kind: 'list', key: 'block_paths', label: 'Не брать', pickFolder: true,
        placeholder: 'D:\\Игры  или  *\\cache\\*',
        empty: 'Пусто — в библиотеку попадает всё.',
        hint: 'Строка без звёздочек — папка целиком, со звёздочками — маска.',
      },
      {
        kind: 'list', key: 'allow_paths', label: 'Но всё-таки брать', pickFolder: true,
        placeholder: 'Вложенная папка из исключённой',
        empty: 'Исключений из списка выше нет.',
        hint: 'Папка мимо, а одна вложенная в неё — нужна.',
      },
    ],
  },
  {
    id: 'skip',
    group: 'library',
    icon: 'filters',
    title: 'Что пропускать',
    note: 'Отсев иконок и баннеров: такие файлы попадают в каталог как «пропущенные», '
      + 'лица в них не ищутся.',
    fields: [
      {
        kind: 'number', key: 'min_side', label: 'Меньшая сторона не меньше',
        min: 0, max: 20000, step: 10, unit: 'точек', zero: 'без ограничения',
      },
      {
        kind: 'number', key: 'min_kilobytes', label: 'Файл не меньше',
        min: 0, max: 1048576, step: 10, unit: 'КБ', zero: 'без ограничения',
      },
      {
        kind: 'number', key: 'max_ratio', label: 'Вытянутость не больше',
        min: 0, max: 100, step: 0.5, unit: ': 1', zero: 'без ограничения',
        hint: 'Например 4 отсечёт баннеры и панорамы.',
      },
      {
        kind: 'list', key: 'ignore_patterns', label: 'Имена файлов по маске',
        placeholder: '*thumb*', empty: 'Масок нет.',
        hint: 'Регистр не важен.',
      },
    ],
  },
  {
    id: 'hidden',
    group: 'library',
    icon: 'hide',
    title: 'Скрытый альбом',
    note: 'Снимок из скрытого альбома переносится в личную папку и пропадает у остальных. '
      + 'Свой альбом есть у каждого, администратор видит и чужие.',
    fields: [{
      kind: 'text', key: 'hidden_root', label: 'Куда переносить', mono: true,
      placeholder: 'Папка hidden внутри каталога',
      hint: 'Пусто — рядом с каталогом.',
    }],
  },
  {
    id: 'theme',
    group: 'view',
    icon: 'palette',
    title: 'Оформление',
    note: 'Светлая, тёмная или как в системе.',
    browser: true,
    fields: [{
      kind: 'choice', look: 'segmented', key: 'theme', label: 'Тема', default: 'auto',
      options: [
        {value: 'auto', label: 'Как в системе'},
        {value: 'light', label: 'Светлая'},
        {value: 'dark', label: 'Тёмная'},
      ] satisfies Array<ChoiceOption & {value: ThemeMode}>,
    }],
  },
  {
    id: 'adult',
    group: 'view',
    icon: 'hide',
    title: 'Содержимое 18+',
    note: 'Как показывать снимки, которые локальный анализ пометил как откровенные.',
    browser: true,
    fields: [{
      kind: 'choice', look: 'cards', key: 'adultMode', label: 'Показ в галерее и просмотрщике',
      default: 'explicit',
      options: [
        {value: 'explicit', label: 'Замыливать интимное', note: 'Только откровенные места'},
        {value: 'regions', label: 'Замыливать обнажённое', note: 'Все обнажённые места'},
        {value: 'full', label: 'Замыливать кадр целиком', note: 'Весь кадр, а не часть'},
        {value: 'strict', label: 'Замыливать и непроверенные', note: 'И ещё не проверенные анализом'},
        {value: 'hide', label: 'Скрывать совсем', note: 'Их лица пропадут и из «Людей»'},
        {value: 'show', label: 'Показывать как есть', note: 'Без замыливания'},
      ] satisfies Array<ChoiceOption & {value: AdultMode}>,
    }],
  },
];

export const ZOOM_LEVELS: ZoomLevel[] = ['small', 'medium', 'large'];
