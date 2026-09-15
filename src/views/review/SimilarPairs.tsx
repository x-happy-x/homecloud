import {useQuery} from '@tanstack/react-query';
import {formatNumber, percent, plural} from '../../lib/format';
import {getSimilarPairs} from '../../services/endpoints/people';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Chip} from '../../ui/Chip/Chip';
import {HintLine} from '../../ui/Hint/Hint';
import {GroupFace} from './GroupFace';
import {similarTone, type SimilarPair} from './similar';

export interface SimilarPairsProps {
  onCompare(a: string, b: string): void;
  onMerge(pair: SimilarPair): void;
}

/** Пары групп, которые модель считает одним человеком. */
export function SimilarPairs({onCompare, onMerge}: SimilarPairsProps) {
  const canEdit = useStore(state => state.session.canEdit);
  const namedOnly = useStore(state => state.prefs.similarNamedOnly);
  const setNamedOnly = useStore(state => state.setSimilarNamedOnly);

  const pairs = useQuery({
    queryKey: qk.similarPairs(namedOnly),
    queryFn: () => getSimilarPairs<{pairs: SimilarPair[]}>(namedOnly),
  });

  const list = pairs.data?.pairs ?? [];

  return (
    <section className="similar-block">
      <div className="section-label">
        Похожие люди
        <Chip active={namedOnly} onClick={() => setNamedOnly(!namedOnly)}>
          только с именами
        </Chip>
      </div>
      <HintLine>
        Пары, которые модель считает одним человеком — обычно это одна и та же
        персона, разъехавшаяся по группам.
      </HintLine>

      {list.length === 0
        ? <HintLine>Похожих групп не нашлось.</HintLine>
        : list.map(pair => {
            const faces = pair.a.count + pair.b.count;
            return (
              <div key={`${pair.a.key}-${pair.b.key}`} className="pair-row">
                <GroupFace group={pair.a} />
                <GroupFace group={pair.b} />
                <div className="similar-body">
                  <span className="similar-name">{pair.a.title} ↔ {pair.b.title}</span>
                  <span className="similar-meta">
                    {pair.verdict} · {formatNumber(faces)}{' '}
                    {plural(faces, 'лицо', 'лица', 'лиц')}
                  </span>
                </div>
                <span className={`similar-score ${similarTone(pair.score)}`}>
                  {percent(pair.score)}
                </span>
                <Button small onClick={() => onCompare(pair.a.key, pair.b.key)}>Сравнить</Button>
                {canEdit && <Button small onClick={() => onMerge(pair)}>Объединить</Button>}
              </div>
            );
          })}
    </section>
  );
}
