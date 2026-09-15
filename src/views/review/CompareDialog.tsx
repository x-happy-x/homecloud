import {useQuery} from '@tanstack/react-query';
import {formatNumber, percent, plural} from '../../lib/format';
import {compareGroups} from '../../services/endpoints/people';
import {qk} from '../../services/queryKeys';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {HintLine} from '../../ui/Hint/Hint';
import {GroupFace} from './GroupFace';
import {similarTone, type SimilarGroup} from './similar';

interface CompareResult {
  a: SimilarGroup;
  b: SimilarGroup;
  score: number;
  best: number;
  verdict: string;
  /** Доля пар в архиве, которые дальше этой. */
  rank?: number | null;
  among?: number;
  compared: [number, number];
  pairs: Array<{a: number; b: number; score: number}>;
}

export interface CompareDialogProps {
  pair: {a: string; b: string} | null;
  onClose(): void;
}

export function CompareDialog({pair, onClose}: CompareDialogProps) {
  const compare = useQuery({
    queryKey: qk.compare(pair?.a ?? '', pair?.b ?? ''),
    queryFn: () => compareGroups<CompareResult>(pair!.a, pair!.b),
    enabled: Boolean(pair),
  });

  const data = compare.data;

  return (
    <Dialog open={Boolean(pair)} onClose={onClose} className="compare-dialog">
      <Sheet title={data ? `${data.a.title} ↔ ${data.b.title}` : 'Сравнение'} onClose={onClose}>
        <div className="compare-body">
          {compare.isPending && <HintLine>Считаю…</HintLine>}
          {compare.isError && <HintLine>{(compare.error as Error).message}</HintLine>}

          {data && (
            <>
              <div className="compare-heads">
                <figure>
                  <GroupFace group={data.a} />
                  <figcaption>{data.a.title}</figcaption>
                </figure>
                <div className={`compare-score ${similarTone(data.score)}`}>
                  <b>{percent(data.score)}</b>
                  <span>{data.verdict}</span>
                </div>
                <figure>
                  <GroupFace group={data.b} />
                  <figcaption>{data.b.title}</figcaption>
                </figure>
              </div>

              <ul className="compare-facts">
                <li>
                  Средние лица групп совпадают на {percent(data.score)}, лучшая пара
                  кадров — {percent(data.best)}.
                </li>
                {data.rank != null && (
                  <li>
                    Ближе, чем {Math.round(data.rank * 100)}% пар людей в архиве
                    (сравнивали с {formatNumber(data.among ?? 0)} парами).
                  </li>
                )}
                <li>
                  Сравнивали {formatNumber(data.compared[0])} и {formatNumber(data.compared[1])}{' '}
                  {plural(data.compared[1], 'кадр', 'кадра', 'кадров')}.
                </li>
                <li>
                  Модель отвечает на вопрос «один ли это человек», а не «родственники ли»:
                  у разных людей значения близки к нулю даже при семейном сходстве.
                </li>
              </ul>

              <div className="section-label">Самые похожие кадры</div>
              <div className="pair-grid">
                {data.pairs.map(item => (
                  <div key={`${item.a}-${item.b}`} className="pair-item">
                    <img src={`/media/face-crop/${item.a}?size=200`} alt="" loading="lazy" />
                    <img src={`/media/face-crop/${item.b}?size=200`} alt="" loading="lazy" />
                    <span>{percent(item.score)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Sheet>
    </Dialog>
  );
}
