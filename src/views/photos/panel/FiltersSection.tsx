import {useStore} from '../../../store';
import {Button} from '../../../ui/Button/Button';
import {Chip, Chips} from '../../../ui/Chip/Chip';
import {HintLine} from '../../../ui/Hint/Hint';
import {TYPE_LABELS} from '../gallery';

const TYPES: Array<[string, string]> = [['', 'Все'], ...Object.entries(TYPE_LABELS)];

/** Что показывать: тип содержимого, видео, размытые и 18+. */
export function FiltersSection() {
  const filters = useStore(state => state.filters);
  const setFilters = useStore(state => state.setFilters);
  const clearFilters = useStore(state => state.clearFilters);

  return (
    <>
      <div className="section-label">Что показывать</div>
      <Chips label="Содержимое">
        {TYPES.map(([type, label]) => (
          <Chip key={type || 'all'} active={filters.contentType === type} onClick={() => setFilters({contentType: type})}>
            {label}
          </Chip>
        ))}
        <Chip active={filters.kind === 'video'} onClick={() => setFilters({kind: filters.kind === 'video' ? '' : 'video'})}>
          Видео
        </Chip>
        <Chip active={filters.showBlurry} onClick={() => setFilters({showBlurry: !filters.showBlurry})}>
          Размытые
        </Chip>
        <Chip active={filters.showAdult} onClick={() => setFilters({showAdult: !filters.showAdult})}>
          18+
        </Chip>
      </Chips>
      <HintLine>Показ снимков 18+ настраивается в разделе «Настройки».</HintLine>
      {/* Поиск остаётся: сбрасываются только подборки и фильтры. */}
      <div className="reset-filters">
        <Button small onClick={clearFilters}>Сбросить всё</Button>
      </div>
    </>
  );
}
