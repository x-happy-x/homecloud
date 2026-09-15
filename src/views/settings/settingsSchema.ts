import type {AdultMode, ZoomLevel} from '../../types/domain';
import type {ThemeMode} from '../../store/slices/prefs';

export type SettingField =
  | {kind: 'text'; key: string; label: string; hint?: string; placeholder?: string}
  | {kind: 'textarea'; key: string; label: string; hint?: string; placeholder?: string; rows?: number}
  | {kind: 'number'; key: string; label: string; hint?: string; min?: number; max?: number; step?: number}
  | {kind: 'check'; key: string; label: string; hint?: string}
  | {kind: 'select'; key: string; label: string; hint?: string; options: Array<{value: string; label: string}>}
  /** Модели визуального индекса приходят с бэкенда вместе с настройками. */
  | {kind: 'visualModel'; key: string; label: string; hint?: string};

export interface SettingsSection {
  title: string;
  note: string;
  wide?: boolean;
  fields: SettingField[];
  /** Личные настройки браузера, не уходящие в каталог. */
  local?: 'theme' | 'adult';
  footer?: 'excluded';
}

/**
 * Прежде состоянием формы была сама разметка: одна функция вычитывала
 * значения из DOM, другая соскребала их обратно в запрос.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    title: 'Визуальный поиск',
    note: 'Выберите модель смыслового поиска. Индексы моделей хранятся отдельно, '
      + 'переключение не стирает уже посчитанное.',
    fields: [{
      kind: 'visualModel', key: 'visual_model', label: 'Модель индекса',
      hint: 'После первого выбора новой модели запустите «Визуальный индекс».',
    }],
  },
  {
    title: 'Видео',
    note: 'Лица ищутся по всему ролику, а не в горстке кадров: последовательные '
      + 'появления одного человека собираются в треки.',
    fields: [
      {kind: 'check', key: 'video_enabled', label: 'Разбирать видео'},
      {
        kind: 'number', key: 'video_track_step', label: 'Искать лицо каждые, с',
        min: 0.1, max: 5, step: 0.1,
        hint: 'Чаще — плотнее треки и меньше шанс пропустить лицо, но дольше счёт.',
      },
      {
        kind: 'number', key: 'video_track_gap', label: 'Закрывать трек, если лицо пропало дольше, с',
        min: 0.3, max: 10, step: 0.1,
        hint: 'Лицо на миг отвернулось или заслонилось — трек продолжится.',
      },
      {
        kind: 'number', key: 'video_track_best', label: 'Кадров трека в среднем',
        min: 1, max: 30, step: 1,
        hint: 'Сколько самых чётких кадров трека усредняются в один эмбеддинг.',
      },
      {
        kind: 'number', key: 'video_min_seconds', label: 'Пропускать ролики короче, с',
        min: 0, max: 3600, step: 1, hint: '0 — брать любые.',
      },
      {
        kind: 'number', key: 'video_max_seconds', label: 'Смотреть только первые секунды',
        min: 0, max: 86400, step: 1, hint: '0 — весь ролик целиком.',
      },
      {
        kind: 'number', key: 'adult_video_frames', label: 'Кадров на проверку 18+',
        min: 1, max: 20, step: 1,
        hint: 'Берутся равномерно по всей длине, в счёт идёт худший.',
      },
    ],
  },
  {
    title: 'Описание изображений',
    note: 'Подпись для поиска пишет модель-«зрение»: своя видеокарта или уже '
      + 'запущенный рядом LM Studio.',
    fields: [
      {
        kind: 'select', key: 'caption_backend', label: 'Источник',
        options: [
          {value: 'local', label: 'Своя видеокарта (модель из кэша)'},
          {value: 'lmstudio', label: 'LM Studio (локальный сервер)'},
        ],
      },
      {
        kind: 'text', key: 'caption_model', label: 'Модель',
        hint: 'Для своей видеокарты — модель Hugging Face (должна быть уже загружена).',
      },
      {
        kind: 'text', key: 'caption_lmstudio_url', label: 'Адрес LM Studio',
        hint: 'Используется только при источнике «LM Studio».',
      },
    ],
  },
  {
    title: 'Речь в видео',
    note: 'Сказанное в ролике расшифровывается на своей видеокарте.',
    fields: [
      {
        kind: 'select', key: 'speech_model', label: 'Модель',
        options: [
          {value: 'large-v3', label: 'Whisper large-v3 (точнее всего)'},
          {value: 'medium', label: 'Whisper medium (быстрее, грубее)'},
          {value: 'small', label: 'Whisper small (для слабой видеокарты)'},
        ],
      },
      {
        kind: 'text', key: 'speech_language', label: 'Язык записи', placeholder: 'auto',
        hint: 'auto — определять по самой речи; либо код языка, например ru.',
      },
      {
        kind: 'text', key: 'speech_fallback_language', label: 'Язык архива', placeholder: 'ru',
        hint: 'Берётся, когда определению нельзя верить: на паре секунд шума Whisper '
          + 'уверенно называет случайный язык.',
      },
    ],
  },
  {
    title: 'Оформление',
    note: 'Настройка личная: она хранится в этом браузере, а не в каталоге.',
    local: 'theme',
    fields: [],
  },
  {
    title: 'Содержимое 18+',
    note: 'Как показывать снимки, которые локальный анализ пометил как откровенные.',
    local: 'adult',
    fields: [],
  },
  {
    title: 'Скрытый альбом',
    note: 'Снимок из скрытого альбома переносится в личную папку на устройстве и '
      + 'пропадает у остальных. Свой альбом есть у каждого, администратор видит и чужие.',
    fields: [{
      kind: 'text', key: 'hidden_root', label: 'Куда переносить',
      placeholder: 'Папка hidden внутри каталога',
      hint: 'Оставьте пустым — файлы лягут рядом с каталогом.',
    }],
  },
  {
    title: 'Пути вне библиотеки',
    note: 'Эти пути не сканируются и не показываются в галерее: ни снимков, ни лиц, '
      + 'ни дубликатов. Строка без звёздочек — папка целиком, со звёздочками — маска.',
    wide: true,
    footer: 'excluded',
    fields: [
      {
        kind: 'textarea', key: 'block_paths', label: 'Не брать', rows: 5,
        hint: 'Правила применяются сразу: пересканировать не нужно.',
      },
      {
        kind: 'textarea', key: 'allow_paths', label: 'Кроме этого', rows: 4,
        hint: 'Белый список вырезает исключения из чёрного: папка мимо, а одна вложенная — нужна.',
      },
    ],
  },
  {
    title: 'Что пропускать',
    note: 'Отсев мелочи и баннеров: такие файлы попадают в каталог со статусом '
      + '«пропущен», лица в них не ищутся.',
    fields: [
      {
        kind: 'number', key: 'min_side', label: 'Минимальная сторона, точек',
        min: 0, max: 20000, step: 10, hint: '0 — без ограничения. Отсекает иконки и превью.',
      },
      {
        kind: 'number', key: 'min_kilobytes', label: 'Минимальный размер файла, КБ',
        min: 0, max: 1048576, step: 10, hint: '0 — без ограничения.',
      },
      {
        kind: 'number', key: 'max_ratio', label: 'Максимальное соотношение сторон',
        min: 0, max: 100, step: 0.5,
        hint: '0 — без ограничения. Например 4 отсечёт баннеры и панорамы.',
      },
      {
        kind: 'textarea', key: 'ignore_patterns', label: 'Не брать имена по маскам', rows: 4,
        hint: 'По одной маске в строке, регистр не важен.',
      },
    ],
  },
];

export const THEME_OPTIONS: Array<{value: ThemeMode; label: string}> = [
  {value: 'auto', label: 'Как в системе'},
  {value: 'light', label: 'Светлая'},
  {value: 'dark', label: 'Тёмная'},
];

export const ADULT_OPTIONS: Array<{value: AdultMode; label: string}> = [
  {value: 'explicit', label: 'Замыливать интимное'},
  {value: 'regions', label: 'Замыливать обнажённое'},
  {value: 'full', label: 'Замыливать кадр целиком'},
  {value: 'strict', label: 'Замыливать и непроверенные'},
  {value: 'hide', label: 'Скрывать такие снимки совсем'},
  {value: 'show', label: 'Показывать как есть'},
];

export const ZOOM_LEVELS: ZoomLevel[] = ['small', 'medium', 'large'];
