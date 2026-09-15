import {useMutation} from '@tanstack/react-query';
import {assignGroups} from '../../services/endpoints/people';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import {mergeTarget, type SimilarGroup} from './similar';

/**
 * Объединение двух групп с подтверждением: и на «Проверке», и в карточке
 * группы. Сливаем в ту, у которой есть имя.
 */
export function useMergeGroups(onMerged?: () => void) {
  const toast = useStore(state => state.toast);

  const merge = useMutation({
    mutationFn: ({first, second}: {first: SimilarGroup; second: SimilarGroup}) => {
      const target = mergeTarget(first, second)!;
      return assignGroups({
        group_keys: [first.key, second.key],
        name: target.name,
        bigfam_id: target.bigfam_id,
      });
    },
    onSuccess: (_data, {first, second}) => {
      const target = mergeTarget(first, second)!;
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: ['similar-pairs']});
      void queryClient.invalidateQueries({queryKey: ['similar']});
      toast(`Объединено: ${target.title}`, 'success');
      onMerged?.();
    },
  });

  return (first: SimilarGroup, second: SimilarGroup) => {
    const target = mergeTarget(first, second);
    if (!target) {
      toast('Сначала дайте имя одной из групп');
      return;
    }
    const other = target === first ? second : first;
    // Действие обратимо кнопкой отмены, но затрагивает все лица обеих групп.
    const ok = confirm(`Объединить «${other.title}» с «${target.title}»? `
      + 'Все лица станут одним человеком, действие можно отменить.');
    if (ok) merge.mutate({first, second});
  };
}
