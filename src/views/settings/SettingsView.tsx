import {useEffect, useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './SettingsView.scss';
import {FolderPickerDialog, type PickedFolder} from '../../components/FolderPicker/FolderPickerDialog';
import {formatNumber, plural} from '../../lib/format';
import {getSettings, saveSettings} from '../../services/endpoints/settings';
import {qk} from '../../services/queryKeys';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import type {AdultMode} from '../../types/domain';
import type {ThemeMode} from '../../store/slices/prefs';
import {Button} from '../../ui/Button/Button';
import {CheckRow} from '../../ui/CheckRow/CheckRow';
import {Field, NumberField, SelectField, TextField} from '../../ui/Field/Field';
import {HintLine} from '../../ui/Hint/Hint';
import {SegmentNav} from '../../ui/SegmentNav/SegmentNav';
import {ViewHeader} from '../../ui/ViewHeader/ViewHeader';
import {
  ADULT_OPTIONS, SETTINGS_GROUPS, SETTINGS_SECTIONS, THEME_OPTIONS,
  type SettingField, type SettingsGroupId, type SettingsSection,
} from './settingsSchema';

interface VisualModel {
  id: string;
  name?: string;
  note?: string;
  installed?: boolean;
}

export function SettingsView({excluded = 0}: {excluded?: number}) {
  const canEdit = useStore(state => state.session.canEdit);
  const draft = useStore(state => state.settings.draft);
  const dirty = useStore(state => state.settings.dirty);
  const loadDraft = useStore(state => state.loadSettingsDraft);
  const setSetting = useStore(state => state.setSetting);
  const markSaved = useStore(state => state.markSettingsSaved);
  const toast = useStore(state => state.toast);

  const theme = useStore(state => state.prefs.theme);
  const setTheme = useStore(state => state.setTheme);
  const adultMode = useStore(state => state.prefs.adultMode);
  const setAdultMode = useStore(state => state.setAdultMode);

  const [group, setGroup] = useState<SettingsGroupId>('recognition');
  const [pickSettingKey, setPickSettingKey] = useState<string | null>(null);

  const settings = useQuery({queryKey: qk.settings(), queryFn: getSettings});

  // Ответ сервера — источник истины для черновика формы.
  useEffect(() => {
    if (settings.data) loadDraft(settings.data.settings);
  }, [settings.data, loadDraft]);

  const save = useMutation({
    // Отправляем объект целиком, как и раньше: бэкенд ждёт полный набор.
    mutationFn: () => saveSettings(draft),
    onSuccess: data => {
      markSaved();
      loadDraft(data.settings);
      // Правила путей применяются сразу — каталог и галерея должны это увидеть.
      queryClient.invalidateQueries({queryKey: ['state']});
      queryClient.invalidateQueries({queryKey: ['photos']});
      toast(data.excluded === undefined || data.excluded === null
        ? 'Настройки сохранены'
        : `Настройки сохранены, исключено снимков: ${formatNumber(data.excluded)}`, 'success');
    },
  });

  const models = (settings.data?.visual_models ?? []) as VisualModel[];

  const appendPathSetting = (target: PickedFolder) => {
    const key = pickSettingKey;
    if (!key) return;
    const current = String(draft[key] ?? '');
    const rules = current.split('\n').map(rule => rule.trim()).filter(Boolean);
    if (!rules.some(rule => rule.toLowerCase() === target.path.toLowerCase())) {
      setSetting(key, [...rules, target.path].join('\n'));
    }
    setPickSettingKey(null);
  };

  const renderField = (field: SettingField) => {
    const value = draft[field.key];
    switch (field.kind) {
      case 'check':
        return (
          <CheckRow
            key={field.key}
            checked={Boolean(value)}
            disabled={!canEdit}
            onChange={next => setSetting(field.key, next)}
          >
            {field.label}
          </CheckRow>
        );
      case 'number':
        return (
          <NumberField
            key={field.key}
            label={field.label}
            hint={field.hint}
            value={Number(value ?? 0)}
            min={field.min}
            max={field.max}
            step={field.step}
            disabled={!canEdit}
            onChange={next => setSetting(field.key, next)}
          />
        );
      case 'select':
        return (
          <SelectField
            key={field.key}
            label={field.label}
            hint={field.hint}
            value={String(value ?? '')}
            options={field.options}
            disabled={!canEdit}
            onChange={next => setSetting(field.key, next)}
          />
        );
      case 'visualModel':
        return (
          <Field key={field.key} label={field.label} hint={field.hint}>
            {id => (
              <select
                id={id}
                value={String(value ?? '')}
                disabled={!canEdit}
                onChange={event => setSetting(field.key, event.target.value)}
              >
                {models.map(model => (
                  // Ещё не скачанную модель выбрать нельзя — индексировать нечем.
                  <option key={model.id} value={model.id} disabled={!model.installed}>
                    {model.name ?? model.id} — {model.installed ? model.note : 'загружается'}
                  </option>
                ))}
              </select>
            )}
          </Field>
        );
      case 'textarea':
      case 'text': {
        const input = (
          <TextField
            key={field.key}
            label={field.label}
            hint={field.hint}
            placeholder={field.placeholder}
            multiline={field.kind === 'textarea'}
            value={String(value ?? '')}
            disabled={!canEdit}
            onChange={next => setSetting(field.key, next)}
          />
        );
        if (field.key !== 'block_paths' && field.key !== 'allow_paths') return input;
        return (
          <div key={field.key} className="path-setting-field">
            {input}
            <Button small disabled={!canEdit} onClick={() => setPickSettingKey(field.key)}>
              Выбрать папку…
            </Button>
          </div>
        );
      }
    }
  };

  const renderSection = (section: SettingsSection) => (
    <section key={section.title} className={`settings-card${section.wide ? ' wide' : ''}`}>
      <header>
        <h2>{section.title}</h2>
        <p>{section.note}</p>
      </header>

      {section.local === 'theme' && (
        <SelectField
          label="Тема"
          value={theme}
          options={THEME_OPTIONS}
          onChange={next => setTheme(next as ThemeMode)}
        />
      )}

      {section.local === 'adult' && (
        <SelectField
          label="Показ в галерее и просмотрщике"
          hint="«Скрывать совсем» убирает такие снимки и из раздела «Люди»: лица с них не показываются."
          value={adultMode}
          options={ADULT_OPTIONS}
          onChange={next => setAdultMode(next as AdultMode)}
        />
      )}

      {section.fields.map(renderField)}

      {section.footer === 'excluded' && (
        <HintLine>
          {excluded
            ? `Сейчас правилами исключено ${formatNumber(excluded)} ${
                plural(excluded, 'снимок', 'снимка', 'снимков')}.`
            : 'Сейчас правилами ничего не исключено.'}
        </HintLine>
      )}
    </section>
  );

  return (
    <section className="view active">
      <ViewHeader eyebrow="Каталог" title="Настройки" />
      <p className="settings-lead">
        Настройки каталога действуют на все устройства сразу; правила пропуска применяются
        к тем файлам, которые сканируются заново. Раздел «Вид» остаётся в этом браузере.
      </p>

      <SegmentNav
        label="Разделы настроек"
        active={group}
        items={SETTINGS_GROUPS.map(item => ({
          id: item.id,
          icon: item.icon,
          label: item.title,
          note: item.note,
        }))}
        onSelect={next => setGroup(next)}
      />

      <div className="settings-grid">
        {SETTINGS_SECTIONS.filter(section => section.group === group).map(renderSection)}
      </div>

      {!canEdit && (
        <HintLine>Менять настройки каталога может редактор или администратор.</HintLine>
      )}

      {/* Полоса сохранения появляется только когда есть что сохранять. */}
      <FolderPickerDialog
        open={Boolean(pickSettingKey)}
        title="Выбрать папку для исключений"
        note="Выберите подключенный бэк и папку. Путь будет добавлен в текущее поле настроек."
        confirmLabel="Добавить путь"
        onClose={() => setPickSettingKey(null)}
        onPick={appendPathSetting}
      />

      {canEdit && (dirty || save.isPending) && (
        <div className="settings-bar">
          <strong>Есть несохранённые изменения</strong>
          <Button
            disabled={save.isPending || !settings.data}
            onClick={() => settings.data && loadDraft(settings.data.settings)}
          >
            Отменить правки
          </Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      )}
    </section>
  );
}
