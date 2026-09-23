import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Avatar} from '../Avatar/Avatar';
import {plural} from '../../lib/format';
import type {BigfamId, KinPerson, KinRelative, NamedPerson} from '../../types/api';

export interface PickerValue {
  name: string;
  bigfamId: BigfamId | null;
}

export interface PickerOption extends PickerValue {
  source: 'catalog' | 'kin';
  meta: string;
  avatar?: string;
  person?: KinPerson;
}

export interface PersonPickerProps {
  value: PickerValue;
  onChange(value: PickerValue): void;
  placeholder: string;
  /** Люди, уже названные в HomeCloud. */
  people?: NamedPerson[];
  /** Люди картотеки bigfam. */
  kin?: KinPerson[];
  autoFocus?: boolean;
}

const MAX_OPTIONS = 60;
const lower = (value: string) => value.toLocaleLowerCase('ru');

function buildOptions(people: NamedPerson[], kin: KinPerson[], search: string): PickerOption[] {
  const kinById = new Map(kin.map(person => [person.id, person]));
  const kinByName = new Map(kin.map(person => [lower(person.name), person]));
  const known: PickerOption[] = people.map(person => {
    const profile = person.bigfam_id ? kinById.get(person.bigfam_id) : kinByName.get(lower(person.name));
    return ({
    bigfamId: person.bigfam_id ?? null,
    name: person.name,
    source: 'catalog',
    meta: [profile?.birth ? formatDate(profile.birth) : '',
      `${person.count} ${plural(person.count, 'лицо', 'лица', 'лиц')} в каталоге`]
      .filter(Boolean).join(' · '),
    avatar: person.bigfam_id ? `/media/bigfam/${person.bigfam_id}` : profile?.avatar,
    person: profile,
  });
  });

  const relatives: PickerOption[] = kin.map(person => ({
    bigfamId: person.id,
    name: person.name,
    source: 'kin',
    meta: [person.birth ? formatDate(person.birth) : '', person.deceased ? 'Умер' : '']
      .filter(Boolean).join(' · ') || 'из картотеки',
    avatar: person.avatar,
    person,
  }));

  // Кто уже есть в HomeCloud, того не показываем второй раз из картотеки.
  const seen = new Set(known.map(person => lower(person.name)));
  const merged = [...known, ...relatives.filter(person => !seen.has(lower(person.name)))];
  const query = lower(search.trim());
  return merged.filter(person => !query || lower(person.name).includes(query)).slice(0, MAX_OPTIONS);
}

/**
 * Имя выбирается из картотеки или пишется руками. Незнакомое имя — это не
 * ошибка: человек просто будет заведён как новый.
 */
export function PersonPicker({
  value, onChange, placeholder, people = [], kin = [], autoFocus,
}: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [relativesFor, setRelativesFor] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  // Поле в верхней половине экрана — список раскрывается вниз, иначе вверх.
  const [below, setBelow] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = useMemo(
    () => buildOptions(people, kin, value.name),
    [people, kin, value.name],
  );

  const pick = (option: PickerOption) => {
    onChange({name: option.name, bigfamId: option.bigfamId});
    setOpen(false);
    setCursor(-1);
    setRelativesFor('');
  };

  const move = (step: number) => {
    if (!options.length) return;
    setCursor(current => (current + step + options.length) % options.length);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const box = fieldRef.current?.getBoundingClientRect();
    if (box) setBelow(box.top < window.innerHeight / 2);
  }, [open]);

  let lastSource = '';

  return (
    <div className="picker" ref={fieldRef}>
      <div className="picker-field">
        <span className="picker-avatar">
          {value.bigfamId
            ? <Avatar srcs={[`/media/bigfam/${value.bigfamId}`]} name={value.name}
                className="kin-avatar" letterClassName="kin-dot" />
            : null}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value.name}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onChange={event => {
            // Ручная правка имени отвязывает его от картотеки.
            onChange({name: event.target.value, bigfamId: null});
            setCursor(-1);
            setOpen(true);
          }}
          onBlur={() => {
            // Задержка, чтобы успел сработать выбор мышью по списку.
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) { setOpen(true); return; }
              move(event.key === 'ArrowDown' ? 1 : -1);
            } else if (event.key === 'Enter' && open && cursor >= 0) {
              event.preventDefault();
              pick(options[cursor]);
            } else if (event.key === 'Escape' && open) {
              // Гасим всплытие: иначе Esc заодно закроет окно, в котором стоит поле.
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
        <button
          className="picker-toggle"
          type="button"
          aria-label="Показать список"
          onClick={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setOpen(current => !current);
            inputRef.current?.focus();
          }}
        >
          <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7Z" /></svg>
        </button>
      </div>

      {open && (
        <div className={`picker-list${below ? ' below' : ''}`}>
          {options.length === 0 && (
            <div className="picker-empty">
              {kin.length
                ? 'Никто не подошёл — имя будет создано как новое'
                : 'Картотека пуста или недоступна — имя будет создано как новое'}
            </div>
          )}
          {options.map((option, index) => {
            const head = option.source !== lastSource
              ? (option.source === 'catalog' ? 'Уже в HomeCloud' : 'Картотека BiGFaM')
              : '';
            lastSource = option.source;
            const relativesOpen = relativesFor === optionKey(option);
            return (
              <div key={`${option.source}-${option.bigfamId ?? option.name}-${index}`}>
                {head && <div className="picker-head">{head}</div>}
                <div className={`picker-card${relativesOpen ? ' expanded' : ''}`}>
                  <button
                    type="button"
                    className={`picker-option${index === cursor ? ' cursor' : ''}`}
                    onMouseDown={event => { event.preventDefault(); pick(option); }}
                  >
                    <Avatar srcs={[option.avatar]} name={option.name}
                      className="kin-avatar" letterClassName="kin-dot" />
                    <span className="body">
                      <span className="name">{option.name}</span>
                      <span className="meta">{option.meta}</span>
                    </span>
                    {option.bigfamId !== null && option.bigfamId === value.bigfamId && (
                      <span className="tick">✓</span>
                    )}
                  </button>
                  {option.person && (
                    <button type="button" className="picker-relatives-toggle" aria-expanded={relativesOpen}
                      onMouseDown={event => {
                        event.preventDefault();
                        setRelativesFor(current => current === optionKey(option) ? '' : optionKey(option));
                      }}>
                      {relativesOpen ? 'Скрыть' : 'Близкие'}
                    </button>
                  )}
                  {option.person && relativesOpen && (
                    <PickerRelatives person={option.person} onPick={relative => pick({
                      bigfamId: relative.id,
                      name: relative.name,
                      source: 'kin',
                      meta: 'из близких',
                      avatar: relative.avatar,
                    })} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const optionKey = (option: PickerOption) => `${option.source}:${option.bigfamId ?? lower(option.name)}`;

function PickerRelatives({person, onPick}: {person: KinPerson; onPick(relative: KinRelative): void}) {
  const groups: Array<[string, KinRelative[]]> = [
    ['Супруги', person.relatives?.spouses ?? []],
    ['Родители', person.relatives?.parents ?? []],
    ['Братья и сёстры', person.relatives?.siblings ?? []],
    ['Дети', person.relatives?.children ?? []],
  ];
  const visible = groups.filter(([, relatives]) => relatives.length > 0);
  return <div className="picker-relatives">
    {visible.length ? visible.map(([label, relatives]) => <section key={label}>
      <small>{label}</small>
      <div>{relatives.map(relative => <button key={relative.id} type="button"
        className="picker-relative" title={`Назначить: ${relative.name}`}
        onMouseDown={event => { event.preventDefault(); onPick(relative); }}>
        <Avatar srcs={[relative.avatar]} name={relative.name}
          className="picker-relative-avatar" letterClassName="picker-relative-letter" />
        <b>{shortRelativeName(relative.name)}</b>
      </button>)}</div>
    </section>) : <small>Ближайшие родственники не указаны</small>}
  </div>;
}

function shortRelativeName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  const [, first, middle] = parts;
  const initials = [parts[0], middle].filter(Boolean).map(part => `${part[0].toUpperCase()}.`).join('');
  return `${first} ${initials}`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}
