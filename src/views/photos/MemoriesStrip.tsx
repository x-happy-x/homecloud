import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import './MemoriesStrip.scss';
import {formatNumber, plural} from '../../lib/format';
import {getHighlights, type Highlight} from '../../services/endpoints/highlights';
import {density, photoMediaUrl} from '../../services/media';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Icon} from '../../ui/Icon/Icon';
import {featuredHighlight, KIND_LABELS, sortHighlights} from '../highlights/highlights';

/** Сколько карточек в ленте, считая главную. */
const SHOWN = 5;

/** Подпись над названием: «2019» у «в этот день», иначе вид подборки. */
const kindText = (group: Highlight) =>
  (group.kind === 'on-this-day' ? group.subtitle || KIND_LABELS[group.kind] : KIND_LABELS[group.kind] ?? group.subtitle);

/**
 * Лента воспоминаний над галереей: «в этот день» или свежее событие крупно,
 * дальше ещё несколько подборок и ссылка на все. Запрос тот же, что у экрана
 * подборок, — кэш общий.
 */
export function MemoriesStrip() {
  const adultMode = useStore(state => state.prefs.adultMode);
  const setView = useStore(state => state.setView);
  const openHighlight = useStore(state => state.setRouteHighlight);
  const hideAdult = adultMode === 'hide';
  const list = useQuery({
    queryKey: qk.highlights('', hideAdult),
    queryFn: () => getHighlights('', hideAdult),
    staleTime: 5 * 60_000,
  });

  const cards = useMemo(() => {
    const groups = sortHighlights(list.data?.groups ?? []);
    const featured = featuredHighlight(groups);
    if (!featured) return [];
    return [featured, ...groups.filter(group => group !== featured)].slice(0, SHOWN);
  }, [list.data]);
  const total = list.data?.groups.length ?? 0;
  if (!cards.length) return null;

  const open = (key: string) => {
    setView('highlights');
    openHighlight(key);
  };
  const size = Math.round(420 * density());

  return (
    <section className="memories" aria-label="Воспоминания">
      <div className="memories-head">
        <h2>Воспоминания</h2>
        <button type="button" className="memories-all" onClick={() => { setView('highlights'); openHighlight(''); }}>
          Все {formatNumber(total)}
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="memories-row">
        {cards.map((group, index) => (
          <button key={group.key} type="button" className={`memory${index === 0 ? ' featured' : ''}`}
            onClick={() => open(group.key)}>
            {group.cover
              ? <img src={photoMediaUrl(group.cover, adultMode, index === 0 ? size * 2 : size)} alt=""
                  loading="lazy" decoding="async" />
              : <span className="memory-blank" aria-hidden="true"><Icon name="highlights" /></span>}
            <span className="memory-text">
              <small>{kindText(group)}</small>
              <strong>{group.title}</strong>
              <span>
                {formatNumber(group.photo_count)} {plural(group.photo_count, 'снимок', 'снимка', 'снимков')}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
