import {useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import './ReviewView.scss';
import {assignGroups} from '../../services/endpoints/people';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import {PersonCard, type PersonGroup} from '../../components/people/PersonCard';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Hint} from '../../ui/Hint/Hint';
import {ViewHeader} from '../../ui/ViewHeader/ViewHeader';
import {CompareDialog} from './CompareDialog';
import {SimilarPairs} from './SimilarPairs';
import {mergeTarget, type SimilarPair} from './similar';

export interface ReviewViewProps {
  /** Группы, которые каталог отнёс к шуму или исключениям. */
  groups: PersonGroup[];
  onOpenGroup(key: string): void;
}

export function ReviewView({groups, onOpenGroup}: ReviewViewProps) {
  const toast = useStore(state => state.toast);
  const [comparing, setComparing] = useState<{a: string; b: string} | null>(null);

  const merge = useMutation({
    mutationFn: (pair: SimilarPair) => {
      const target = mergeTarget(pair.a, pair.b)!;
      return assignGroups({
        group_keys: [pair.a.key, pair.b.key],
        name: target.name,
        bigfam_id: target.bigfam_id,
      });
    },
    onSuccess: (_data, pair) => {
      const target = mergeTarget(pair.a, pair.b)!;
      queryClient.invalidateQueries({queryKey: ['state']});
      queryClient.invalidateQueries({queryKey: ['similar-pairs']});
      toast(`Объединено: ${target.title}`, 'success');
    },
  });

  const onMerge = (pair: SimilarPair) => {
    const target = mergeTarget(pair.a, pair.b);
    if (!target) {
      toast('Сначала дайте имя одной из групп');
      return;
    }
    const other = target === pair.a ? pair.b : pair.a;
    // Действие обратимо кнопкой отмены, но затрагивает все лица обеих групп.
    const ok = confirm(`Объединить «${other.title}» с «${target.title}»? `
      + 'Все лица станут одним человеком, действие можно отменить.');
    if (ok) merge.mutate(pair);
  };

  return (
    <section className="view active">
      <ViewHeader eyebrow="Разбор" title="Проверка" />

      <Hint title="Сюда попадает то, в чём модель не уверена">
        Шум — кадры, не похожие ни на одну группу; исключённые — то, что вы убрали
        руками. Ниже — пары групп, которые могут оказаться одним человеком.
      </Hint>

      <SimilarPairs onCompare={(a, b) => setComparing({a, b})} onMerge={onMerge} />

      <div className="people-grid">
        {groups.map(group => (
          <PersonCard
            key={group.key}
            group={group}
            selectable={false}
            onOpen={onOpenGroup}
            onSelect={() => {}}
          />
        ))}
      </div>

      {groups.length === 0 && (
        <EmptyState mark="✓" title="Нечего проверять">
          Непонятных групп не осталось.
        </EmptyState>
      )}

      <CompareDialog pair={comparing} onClose={() => setComparing(null)} />
    </section>
  );
}
