import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Avatar} from '../Avatar/Avatar';
import {plural} from '../../lib/format';
import type {BigfamId, KinPerson, NamedPerson} from '../../types/api';

export interface PickerValue {
  name: string;
  bigfamId: BigfamId | null;
}

export interface PickerOption extends PickerValue {
  source: 'catalog' | 'kin';
  meta: string;
  avatar?: string;
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
  const known: PickerOption[] = people.map(person => ({
    bigfamId: person.bigfam_id ?? null,
    name: person.name,
    source: 'catalog',
    meta: `${person.count} ${plural(person.count, 'лицо', 'лица', 'лиц')} в каталоге`,
    avatar: person.bigfam_id ? `/media/bigfam/${person.bigfam_id}` : '',
  }));

  const relatives: PickerOption[] = kin.map(person => ({
    bigfamId: person.id,
    name: person.name,
    source: 'kin',
    meta: [person.birth, person.deceased ? `† ${person.death || ''}` : '']
      .filter(Boolean).join(' · ') || 'из картотеки',
    avatar: person.avatar,
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
            return (
              <div key={`${option.source}-${option.bigfamId ?? option.name}-${index}`}>
                {head && <div className="picker-head">{head}</div>}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
