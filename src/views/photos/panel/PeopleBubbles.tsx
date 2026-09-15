import {useMemo, useState} from 'react';
import '../../../components/people/Bubbles.scss';
import {useCatalogState} from '../../../hooks/useCatalogState';
import {useKin} from '../../../hooks/useKin';
import {formatNumber, shortName} from '../../../lib/format';
import {useStore} from '../../../store';
import {Avatar} from '../../../ui/Avatar/Avatar';
import {InlineSearch} from '../../../ui/InlineSearch/InlineSearch';

const lower = (value: string) => value.toLocaleLowerCase('ru');

/** Люди в панели — такие же кружки, как на первой странице; выбор фильтрует галерею. */
export function PeopleBubbles() {
  const people = useCatalogState().data?.people;
  const kin = useKin().data;
  const chosen = useStore(state => state.filters.people);
  const togglePerson = useStore(state => state.togglePerson);
  const [search, setSearch] = useState('');

  const kinById = useMemo(() => new Map((kin ?? []).map(person => [person.id, person])), [kin]);
  const all = people ?? [];
  const needle = lower(search.trim());
  const shown = all.filter(person => !needle || lower(person.name).includes(needle));

  return (
    <>
      <InlineSearch value={search} onChange={setSearch} placeholder="Поиск по людям" label="Поиск по людям в панели" />
      <div className="people-bubbles">
        {shown.length
          ? shown.map(person => (
              <button
                key={person.name}
                className={`bubble${chosen.includes(person.name) ? ' active' : ''}`}
                type="button"
                title={person.name}
                onClick={() => togglePerson(person.name)}
              >
                <span className="bubble-photo">
                  {/* Портрет из картотеки → аватарка группы → буква. */}
                  <Avatar
                    srcs={[person.bigfam_id ? `/media/bigfam/${person.bigfam_id}` : '', person.avatar]}
                    name={person.name}
                  />
                  <i className="bubble-count">{formatNumber(person.count)}</i>
                </span>
                <span className="bubble-name">
                  {shortName(person.name, person.bigfam_id ? kinById.get(person.bigfam_id) : null)}
                </span>
              </button>
            ))
          : (
            <span className="person-meta">
              {all.length ? 'Никто не найден' : 'Сначала назначьте имена в разделе «Люди»'}
            </span>
          )}
      </div>
    </>
  );
}
