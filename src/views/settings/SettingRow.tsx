import {useId, useState, type CSSProperties, type ReactNode} from 'react';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';
import {IconButton} from '../../ui/IconButton/IconButton';
import {Switch} from '../../ui/Switch/Switch';
import {appendLines, isDefault, removeLine, splitLines} from './settingsModel';
import type {ChoiceOption, SettingField, SettingValue} from './settingsSchema';

export interface VisualModel {
  id: string;
  name?: string;
  note?: string;
  installed?: boolean;
}

export interface SettingRowProps {
  field: SettingField;
  value: SettingValue | undefined;
  /** Куда ведёт «по умолчанию»; для каталога приходит с бэкенда. */
  fallback: SettingValue | undefined;
  onChange(value: SettingValue): void;
  disabled: boolean;
  /** Отличается от сохранённого в каталоге. */
  changed: boolean;
  models: VisualModel[];
  onPickFolder(): void;
}

const formatDefault = (field: SettingField, fallback: SettingValue): string => {
  if (field.kind === 'switch') return fallback ? 'включено' : 'выключено';
  if (field.kind === 'choice') {
    return field.options.find(option => option.value === fallback)?.label ?? String(fallback);
  }
  if (field.kind === 'number' && Number(fallback) === 0 && field.zero) return field.zero;
  return String(fallback) || 'пусто';
};

/** Узкие контролы стоят справа от подписи, широкие — под ней. */
const isInline = (field: SettingField) =>
  field.kind === 'switch' || field.kind === 'number'
  || (field.kind === 'choice' && field.look === 'segmented');

export function SettingRow({field, value, fallback, onChange, disabled, changed, models, onPickFolder}: SettingRowProps) {
  const id = useId();
  const labelId = `${id}-label`;
  // Список по умолчанию пуст: «сбросить» его значит одним щелчком стереть все пути.
  const canReset = !disabled && field.kind !== 'list' && fallback !== undefined && !isDefault(fallback, value);

  let control: ReactNode;
  switch (field.kind) {
    case 'switch':
      control = (
        <Switch checked={Boolean(value)} disabled={disabled} label={field.label}
          onChange={next => onChange(next)} />
      );
      break;
    case 'number':
      control = <NumberControl id={id} field={field} value={Number(value ?? 0)} disabled={disabled} onChange={onChange} />;
      break;
    case 'range':
      control = <RangeControl id={id} field={field} value={Number(value ?? field.min)} disabled={disabled} onChange={onChange} />;
      break;
    case 'text':
      control = (
        <input
          id={id}
          type="text"
          className={`setting-input${field.mono ? ' mono' : ''}`}
          value={String(value ?? '')}
          placeholder={field.placeholder}
          disabled={disabled}
          spellCheck={false}
          onChange={event => onChange(event.target.value)}
        />
      );
      break;
    case 'choice':
      control = (
        <ChoiceControl labelId={labelId} name={id} look={field.look} options={field.options}
          value={String(value ?? '')} disabled={disabled} onChange={onChange} />
      );
      break;
    case 'visualModel':
      control = (
        <ChoiceControl
          labelId={labelId}
          name={id}
          look="cards"
          value={String(value ?? '')}
          disabled={disabled}
          onChange={onChange}
          options={models.map(model => ({
            value: model.id,
            label: model.name ?? model.id,
            note: model.installed ? model.note : 'ещё загружается',
            // Нескачанную модель выбрать нельзя — индексировать нечем.
            disabled: !model.installed,
          }))}
        />
      );
      break;
    case 'list':
      control = (
        <ListControl id={id} field={field} value={value} disabled={disabled}
          onChange={onChange} onPickFolder={onPickFolder} />
      );
      break;
  }

  return (
    <div className={`setting-row kind-${field.kind} ${isInline(field) ? 'inline' : 'stacked'}${changed ? ' changed' : ''}`}>
      <div className="setting-label">
        <div className="setting-title">
          {/* Группу вариантов подписывает aria-labelledby: у неё нет одного поля для for. */}
          {field.kind === 'choice' || field.kind === 'visualModel' || field.kind === 'switch'
            ? <span id={labelId}>{field.label}</span>
            : <label id={labelId} htmlFor={id}>{field.label}</label>}
          {changed && <i className="setting-dot" title="Изменено, но не сохранено" />}
          {canReset && fallback !== undefined && (
            <button
              type="button"
              className="setting-reset"
              title={`Вернуть по умолчанию: ${formatDefault(field, fallback)}`}
              onClick={() => onChange(fallback)}
            >
              <Icon name="undo" />
              <span>по умолчанию</span>
            </button>
          )}
        </div>
        {field.hint && <small>{field.hint}</small>}
      </div>
      <div className="setting-control">{control}</div>
    </div>
  );
}

type NumberField = Extract<SettingField, {kind: 'number'}>;
type RangeField = Extract<SettingField, {kind: 'range'}>;
type ListField = Extract<SettingField, {kind: 'list'}>;

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

function NumberControl({id, field, value, disabled, onChange}: {
  id: string; field: NumberField; value: number; disabled: boolean; onChange(value: number): void;
}) {
  return (
    <div className="setting-number">
      {field.zero && value === 0 && <span className="setting-zero">{field.zero}</span>}
      <span className="number-box">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          min={field.min}
          max={field.max}
          step={field.step}
          disabled={disabled}
          onChange={event => onChange(Number(event.target.value))}
          // Бэкенд всё равно подрежет, но человек должен видеть, что сохранится.
          onBlur={() => {
            const next = clamp(value, field.min, field.max);
            if (next !== value) onChange(next);
          }}
        />
        {field.unit && <span className="number-unit">{field.unit}</span>}
      </span>
    </div>
  );
}

function RangeControl({id, field, value, disabled, onChange}: {
  id: string; field: RangeField; value: number; disabled: boolean; onChange(value: number): void;
}) {
  const fill = ((value - field.min) / (field.max - field.min)) * 100;
  return (
    <div className="setting-range">
      <div className="range-line">
        <input
          id={id}
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          disabled={disabled}
          style={{'--fill': `${clamp(fill, 0, 100)}%`} as CSSProperties}
          onChange={event => onChange(Number(event.target.value))}
        />
        <output htmlFor={id}>{value.toFixed(2)}</output>
      </div>
      <div className="range-ends">
        <span>{field.low}</span>
        <span>{field.high}</span>
      </div>
    </div>
  );
}

function ChoiceControl({labelId, name, look, options, value, disabled, onChange}: {
  labelId: string;
  name: string;
  look: 'segmented' | 'cards';
  options: Array<ChoiceOption & {disabled?: boolean}>;
  value: string;
  disabled: boolean;
  onChange(value: string): void;
}) {
  if (!options.length) return <p className="setting-empty">Список пока не пришёл с сервера.</p>;
  // Настоящие радиокнопки под видом плашек: стрелки и чтение с экрана работают сами.
  return (
    <div role="radiogroup" aria-labelledby={labelId} className={`setting-choice ${look}`}>
      {options.map(option => {
        const checked = option.value === value;
        return (
          <label key={option.value} className={`choice${checked ? ' checked' : ''}${option.disabled ? ' unavailable' : ''}`}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled || option.disabled}
              onChange={() => onChange(option.value)}
            />
            {look === 'cards' && <span className="choice-mark" aria-hidden="true"><Icon name="check" /></span>}
            <span className="choice-text">
              <b>{option.label}</b>
              {look === 'cards' && option.note && <small>{option.note}</small>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ListControl({id, field, value, disabled, onChange, onPickFolder}: {
  id: string;
  field: ListField;
  value: SettingValue | undefined;
  disabled: boolean;
  onChange(value: string): void;
  onPickFolder(): void;
}) {
  const [entry, setEntry] = useState('');
  const items = splitLines(value);

  const add = () => {
    if (!entry.trim()) return;
    onChange(appendLines(value, entry));
    setEntry('');
  };

  return (
    <div className="setting-list">
      {items.length
        ? (
          <ul>
            {items.map((item, index) => (
              <li key={`${item}-${index}`}>
                <code title={item}>{item}</code>
                {!disabled && (
                  <IconButton tiny icon="close" label={`Убрать ${item}`}
                    onClick={() => onChange(removeLine(value, index))} />
                )}
              </li>
            ))}
          </ul>
        )
        : <p className="setting-empty">{field.empty}</p>}

      {!disabled && (
        <div className="list-add">
          <input
            id={id}
            type="text"
            className="setting-input mono"
            value={entry}
            placeholder={field.placeholder}
            spellCheck={false}
            onChange={event => setEntry(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
            // Вставленный из буфера список строк сразу раскладывается на пункты.
            onPaste={event => {
              const text = event.clipboardData.getData('text');
              if (!text.includes('\n')) return;
              event.preventDefault();
              onChange(appendLines(value, text));
            }}
          />
          <Button small disabled={!entry.trim()} onClick={add}>
            <Icon name="plus" size={16} />
            Добавить
          </Button>
          {field.pickFolder && (
            <Button small variant="ghost" onClick={onPickFolder}>
              <Icon name="folder" size={16} />
              Выбрать папку…
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
