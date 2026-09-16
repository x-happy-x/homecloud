import {useEffect, useMemo, useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './SettingsView.scss';
import {FolderPickerDialog} from '../../components/FolderPicker/FolderPickerDialog';
import {formatNumber, plural} from '../../lib/format';
import {getSettings, saveSettings, type SettingsResponse} from '../../services/endpoints/settings';
import {qk} from '../../services/queryKeys';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import type {ThemeMode} from '../../store/slices/prefs';
import type {AdultMode} from '../../types/domain';
import {Button} from '../../ui/Button/Button';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Icon} from '../../ui/Icon/Icon';
import {InlineSearch} from '../../ui/InlineSearch/InlineSearch';
import {SegmentNav} from '../../ui/SegmentNav/SegmentNav';
import {Switch} from '../../ui/Switch/Switch';
import {ViewHeader} from '../../ui/ViewHeader/ViewHeader';
import {SettingRow, type VisualModel} from './SettingRow';
import {appendLines, changedKeys, isVisible, searchSections, type SettingsValues} from './settingsModel';
import {
  SETTINGS_GROUPS, SETTINGS_SECTIONS,
  type SettingValue, type SettingsGroupId, type SettingsSection,
} from './settingsSchema';

const GROUP_TITLE = Object.fromEntries(SETTINGS_GROUPS.map(group => [group.id, group.title]));

const SECTION_BY_KEY = new Map(
  SETTINGS_SECTIONS.flatMap(section => section.fields.map(field => [field.key, section] as const)),
);

export function SettingsView({excluded = 0}: {excluded?: number}) {
  const canEdit = useStore(state => state.session.canEdit);
  const draft = useStore(state => state.settings.draft);
  const loadDraft = useStore(state => state.loadSettingsDraft);
  const setSetting = useStore(state => state.setSetting);
  const toast = useStore(state => state.toast);

  const theme = useStore(state => state.prefs.theme);
  const setTheme = useStore(state => state.setTheme);
  const adultMode = useStore(state => state.prefs.adultMode);
  const setAdultMode = useStore(state => state.setAdultMode);

  const [group, setGroup] = useState<SettingsGroupId>('recognition');
  const [query, setQuery] = useState('');
  const [pickKey, setPickKey] = useState<string | null>(null);

  const settings = useQuery({queryKey: qk.settings(), queryFn: getSettings});
  const saved = settings.data?.settings;

  // Ответ сервера — источник истины для черновика формы.
  useEffect(() => {
    if (saved) loadDraft(saved);
  }, [saved, loadDraft]);

  const changed = useMemo(() => changedKeys(draft, saved), [draft, saved]);
  const changedSet = useMemo(() => new Set(changed), [changed]);

  const save = useMutation({
    // Отправляем объект целиком: бэкенд ждёт полный набор.
    mutationFn: () => saveSettings(draft),
    onSuccess: data => {
      loadDraft(data.settings);
      // Ответ на сохранение без списка моделей и умолчаний — их берём из прежнего.
      queryClient.setQueryData<SettingsResponse>(qk.settings(), old => old && {...old, settings: data.settings});
      // Правила путей применяются сразу — каталог и галерея должны это увидеть.
      queryClient.invalidateQueries({queryKey: ['state']});
      queryClient.invalidateQueries({queryKey: ['photos']});
      // Порог догадок мог измениться — пересчитать их заново.
      queryClient.invalidateQueries({queryKey: qk.faceSuggestions()});
      toast(data.excluded === undefined || data.excluded === null
        ? 'Настройки сохранены'
        : `Настройки сохранены, исключено снимков: ${formatNumber(data.excluded)}`, 'success');
    },
  });

  const canSave = canEdit && changed.length > 0 && !save.isPending;

  // Ctrl+S сохраняет, а не предлагает скачать страницу.
  useEffect(() => {
    if (!canSave) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save.mutate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSave, save]);

  // Личные настройки браузера читаются и пишутся так же, как настройки каталога.
  const values: SettingsValues = {...draft, theme, adultMode};
  const setValue = (key: string, value: SettingValue) => {
    if (key === 'theme') setTheme(value as ThemeMode);
    else if (key === 'adultMode') setAdultMode(value as AdultMode);
    else setSetting(key, value);
  };

  const changedIn = (id: SettingsGroupId) =>
    changed.filter(key => SECTION_BY_KEY.get(key)?.group === id).length;

  const searching = query.trim().length > 0;
  const sections = searching
    ? searchSections(SETTINGS_SECTIONS, query)
    : SETTINGS_SECTIONS.filter(section => section.group === group);

  const models = (settings.data?.visual_models ?? []) as VisualModel[];
  const defaults = settings.data?.defaults ?? {};

  const renderSection = (section: SettingsSection) => {
    // Пока каталог не ответил, в форме пусто — трогать её нечего.
    if (!section.browser && !saved) {
      return settings.isError ? null : <div key={section.id} className="settings-card skeleton" />;
    }
    return (
      <SettingsCard
        key={section.id}
        section={section}
        values={values}
        changed={changedSet}
        disabled={!section.browser && !canEdit}
        models={models}
        defaults={defaults}
        eyebrow={searching ? GROUP_TITLE[section.group] : undefined}
        forceOpen={searching}
        excluded={excluded}
        onChange={setValue}
        onPickFolder={setPickKey}
      />
    );
  };

  return (
    <section className="view active settings-view">
      <ViewHeader
        eyebrow="Каталог"
        title="Настройки"
        actions={(
          <div className="settings-search">
            <InlineSearch value={query} onChange={setQuery} label="Найти настройку" placeholder="Найти настройку" />
          </div>
        )}
      />

      {!canEdit && (
        <p className="settings-notice">
          <Icon name="info" />
          <span>
            Настройки каталога может менять редактор или администратор — вам они доступны
            для просмотра. Раздел «Вид» личный, его можно менять.
          </span>
        </p>
      )}

      {searching
        ? (
          <div className="settings-found">
            <span>
              {sections.length
                ? `Нашлось в ${sections.length} ${plural(sections.length, 'разделе', 'разделах', 'разделах')}`
                : 'Ничего не нашлось'}
            </span>
            <Button small variant="ghost" onClick={() => setQuery('')}>Показать все</Button>
          </div>
        )
        : (
          <SegmentNav
            label="Разделы настроек"
            active={group}
            items={SETTINGS_GROUPS.map(item => ({
              id: item.id,
              icon: item.icon,
              label: item.title,
              note: item.note,
              // Сколько правок ждёт сохранения — чтобы не потерять их на другой вкладке.
              count: changedIn(item.id) || undefined,
            }))}
            onSelect={next => setGroup(next)}
          />
        )}

      {settings.isError && sections.some(section => !section.browser) && (
        <div className="settings-error">
          <EmptyState title="Настройки каталога не загрузились">
            Бэкенд фототеки не ответил. Раздел «Вид» работает и без него.
          </EmptyState>
          <Button onClick={() => settings.refetch()}>Повторить</Button>
        </div>
      )}

      {searching && !sections.length
        ? <EmptyState title="Такой настройки нет">Попробуйте другое слово: «видео», «папка», «тема».</EmptyState>
        : <div className="settings-stack">{sections.map(renderSection)}</div>}

      <FolderPickerDialog
        open={Boolean(pickKey)}
        title="Выбрать папку"
        note="Выберите подключённое устройство и папку — путь добавится в список."
        confirmLabel="Добавить путь"
        onClose={() => setPickKey(null)}
        onPick={target => {
          if (pickKey) setSetting(pickKey, appendLines(draft[pickKey], target.path));
          setPickKey(null);
        }}
      />

      {/* Полоса сохранения появляется только когда есть что сохранять. */}
      {canEdit && (changed.length > 0 || save.isPending) && (
        <div className="settings-bar" role="region" aria-label="Несохранённые изменения">
          <strong>
            {plural(changed.length, 'Изменена', 'Изменены', 'Изменено')} {changed.length}{' '}
            {plural(changed.length, 'настройка', 'настройки', 'настроек')}
            <small>Ctrl+S — сохранить</small>
          </strong>
          <Button disabled={save.isPending || !saved} onClick={() => saved && loadDraft(saved)}>
            Отменить
          </Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      )}
    </section>
  );
}

interface SettingsCardProps {
  section: SettingsSection;
  values: SettingsValues;
  changed: Set<string>;
  disabled: boolean;
  models: VisualModel[];
  defaults: SettingsValues;
  /** Над заголовком — название группы: в результатах поиска разделы из разных групп. */
  eyebrow?: string;
  /** В поиске «тонкая настройка» раскрыта: найденная строка не должна прятаться. */
  forceOpen: boolean;
  excluded: number;
  onChange(key: string, value: SettingValue): void;
  onPickFolder(key: string): void;
}

function SettingsCard({
  section, values, changed, disabled, models, defaults, eyebrow, forceOpen, excluded, onChange, onPickFolder,
}: SettingsCardProps) {
  const [open, setOpen] = useState(false);
  const toggleKey = section.toggle;
  const toggleField = toggleKey ? section.fields.find(field => field.key === toggleKey) : undefined;
  // Выключатель раздела мог не попасть в результаты поиска — тогда он не рисуется.
  const off = toggleKey !== undefined && values[toggleKey] === false;

  const rows = section.fields.filter(field => field.key !== toggleKey && isVisible(field, values));
  const basic = rows.filter(field => !field.advanced);
  const advanced = rows.filter(field => field.advanced);
  const advancedOpen = forceOpen || open;
  const advancedChanged = advanced.some(field => changed.has(field.key));

  const row = (field: SettingsSection['fields'][number]) => (
    <SettingRow
      key={field.key}
      field={field}
      value={values[field.key]}
      fallback={section.browser ? field.default : defaults[field.key]}
      disabled={disabled}
      changed={changed.has(field.key)}
      models={models}
      onChange={value => onChange(field.key, value)}
      onPickFolder={() => onPickFolder(field.key)}
    />
  );

  return (
    <section className={`settings-card${off ? ' off' : ''}`} aria-labelledby={`settings-${section.id}`}>
      <header className="settings-card-head">
        <span className="settings-card-icon"><Icon name={section.icon} /></span>
        <div className="settings-card-title">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={`settings-${section.id}`}>
            {section.title}
            {section.browser && <span className="settings-local">этот браузер</span>}
            {toggleField && changed.has(toggleField.key) && <i className="setting-dot" title="Изменено, но не сохранено" />}
          </h2>
          <p>{off ? 'Выключено — настройки ниже пока не действуют.' : section.note}</p>
        </div>
        {toggleField && (
          <Switch
            checked={Boolean(values[toggleField.key])}
            disabled={disabled}
            label={toggleField.label}
            onChange={next => onChange(toggleField.key, next)}
          />
        )}
      </header>

      {(basic.length > 0 || advanced.length > 0) && (
        <div className="settings-rows">
          {basic.map(row)}

          {advanced.length > 0 && !forceOpen && (
            <button
              type="button"
              className={`settings-more${advancedOpen ? ' open' : ''}`}
              aria-expanded={advancedOpen}
              onClick={() => setOpen(value => !value)}
            >
              <Icon name="chevronDown" />
              <span>Тонкая настройка</span>
              <small>{advanced.length}</small>
              {advancedChanged && !advancedOpen && <i className="setting-dot" title="Здесь есть несохранённые правки" />}
            </button>
          )}
          {advancedOpen && advanced.map(row)}
        </div>
      )}

      {section.footer === 'excluded' && (
        <footer className="settings-card-foot">
          <Icon name="filters" />
          {excluded
            ? <span>Сейчас правилами исключено <b>{formatNumber(excluded)}</b> {plural(excluded, 'снимок', 'снимка', 'снимков')}.</span>
            : <span>Сейчас правилами ничего не исключено.</span>}
        </footer>
      )}
    </section>
  );
}
