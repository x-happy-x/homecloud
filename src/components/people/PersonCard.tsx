import {memo, type MouseEvent} from 'react';
import './PersonCard.scss';
import {formatNumber, lifeYears, plural, shortName} from '../../lib/format';
import {useLongPress} from '../../hooks/useLongPress';
import {useStore} from '../../store';
import type {KinPerson} from '../../types/api';
import {Avatar} from '../../ui/Avatar/Avatar';

export interface PersonGroup {
  key: string;
  title: string;
  name?: string | null;
  kind?: 'person' | 'auto' | 'noise' | 'excluded' | string;
  bigfam_id?: string | null;
  count: number;
  photos: number;
  covers?: string[];
  avatar?: string | null;
  avatar_pinned?: boolean;
  hidden?: boolean;
}

export interface PersonCardProps {
  group: PersonGroup;
  kin?: KinPerson | null;
  /** На «Проверке» карточки не выбираются — там другой сценарий. */
  selectable?: boolean;
  onOpen(key: string): void;
  onSelect(key: string): void;
}

/** Аватарка: закреплённый кадр → портрет из картотеки → первое лицо группы. */
function avatarSources(group: PersonGroup): string[] {
  const crop = group.avatar || group.covers?.[0] || '';
  return !group.avatar_pinned && group.bigfam_id
    ? [`/media/bigfam/${group.bigfam_id}`, crop]
    : [crop];
}

export const PersonCard = memo(function PersonCard({
  group, kin, selectable = true, onOpen, onSelect,
}: PersonCardProps) {
  // Подписка на свой бит выделения: иначе щелчок по одной карточке
  // перерисовывал бы всю сетку.
  const selected = useStore(state => state.selection.groups.has(group.key));
  const selecting = useStore(state => state.selection.groups.size > 0);
  const canEdit = useStore(state => state.session.canEdit);
  const canSelect = selectable && canEdit;
  const hold = useLongPress(() => { if (canSelect) onSelect(group.key); });

  // Пока что-то выбрано, обычный щелчок продолжает выбор — как в галерее телефона.
  const click = (event: MouseEvent) => {
    if (canSelect && (event.ctrlKey || event.metaKey || selecting)) onSelect(group.key);
    else onOpen(group.key);
  };

  const years = lifeYears(kin);
  const label = group.kind === 'person' ? shortName(group.title, kin) : group.title;
  const counts = `${formatNumber(group.count)} ${plural(group.count, 'лицо', 'лица', 'лиц')} `
    + `на ${formatNumber(group.photos)} ${plural(group.photos, 'фотографии', 'фотографиях', 'фотографиях')}`;

  return (
    <article className={`person-card${selected ? ' selected' : ''}`} {...hold}>
      <div className="person-photo">
        <button className="person-avatar" type="button" aria-label={`Открыть ${group.title}`} onClick={click}>
          <Avatar srcs={avatarSources(group)} name={group.title} />
        </button>
        {group.hidden && (
          <span className="hidden-badge" title="В скрытом альбоме — видно только админу">🔒</span>
        )}
        <span className="count-badge" title={counts}>
          {formatNumber(group.count)}<i>/</i>{formatNumber(group.photos)}
        </span>
        <span className="tick-mark" aria-hidden="true">✓</span>
      </div>
      <button className="person-label" type="button" title={group.title} onClick={click}>
        <span className="person-name">{label}</span>
        {years
          ? <span className="person-years">{years}</span>
          : group.kind === 'auto' ? <span className="person-years">без имени</span> : null}
      </button>
    </article>
  );
});
