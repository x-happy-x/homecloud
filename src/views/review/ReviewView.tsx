import {useState} from 'react';
import './ReviewView.scss';
import {PersonCard, type PersonGroup} from '../../components/people/PersonCard';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {SectionHead} from '../../ui/ViewHeader/ViewHeader';
import {CompareDialog} from './CompareDialog';
import {SimilarPairs} from './SimilarPairs';
import {useMergeGroups} from './useMergeGroups';

export interface ReviewViewProps {
  /** Группы, которые каталог отнёс к шуму или исключениям. */
  groups: PersonGroup[];
  onOpenGroup(key: string): void;
}

const noop = () => {};

export function ReviewView({groups, onOpenGroup}: ReviewViewProps) {
  const [comparing, setComparing] = useState<{a: string; b: string} | null>(null);
  const merge = useMergeGroups();

  return (
    <section className="analysis-panel">
      <SectionHead
        title="Проверка"
        note="Сюда попадает то, в чём модель не уверена: шум — кадры, не похожие ни на одну
          группу, исключённые — убранные вами вручную. Ниже — пары групп, которые могут
          оказаться одним человеком."
      />

      <SimilarPairs onCompare={(a, b) => setComparing({a, b})} onMerge={pair => merge(pair.a, pair.b)} />

      <div className="people-grid">
        {groups.map(group => (
          <PersonCard
            key={group.key}
            group={group}
            selectable={false}
            onOpen={onOpenGroup}
            onSelect={noop}
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
