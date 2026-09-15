import {useEffect} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './SettingsView.scss';
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
import {Hint, HintLine} from '../../ui/Hint/Hint';
import {ViewHeader} from '../../ui/ViewHeader/ViewHeader';
import {
  ADULT_OPTIONS, SETTINGS_SECTIONS, THEME_OPTIONS, type SettingField,
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
  const loadDraft = useStore(state => state.loadSettingsDraft);
  const setSetting = useStore(state => state.setSetting);
  const markSaved = useStore(state => state.markSettingsSaved);
  const toast = useStore(state => state.toast);

  const theme = useStore(state => state.prefs.theme);
  const setTheme = useStore(state => state.setTheme);
  const adultMode = useStore(state => state.prefs.adultMode);
  const setAdultMode = useStore(state => state.setAdultMode);

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
      case 'text':
        return (
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
    }
  };

  return (
    <section className="view active">
      <ViewHeader
        eyebrow="Каталог"
        title="Настройки"
        actions={canEdit && (
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        )}
      />
      <Hint>
        Настройки хранятся в каталоге и действуют на все устройства. Правила пропуска
        применяются к тем файлам, которые сканируются заново.
      </Hint>

      <div className="settings-grid">
        {SETTINGS_SECTIONS.map(section => (
          <section
            key={section.title}
            className={`settings-card${section.wide ? ' wide' : ''}`}
          >
            <h2>{section.title}</h2>
            <p>{section.note}</p>

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
        ))}
      </div>
    </section>
  );
}
