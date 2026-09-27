import {memo, type MouseEvent} from 'react';
import './PersonCard.scss';
import {formatNumber, lifeYears, plural} from '../../lib/format';
import {FitName} from './FitName';
import {useLongPress} from '../../hooks/useLongPress';
import {useStore} from '../../store';
import type {KinPerson} from '../../types/api';
import {Avatar} from '../../ui/Avatar/Avatar';

/** Шум, мыло и исключённые живут на «Проверке», а не среди людей. */
export const REVIEW_KINDS: ReadonlySet<string> = new Set(['noise', 'blurry', 'excluded']);

export interface PersonGroup {
  key: string;
  title: string;
  name?: string | null;
  kind?: 'person' | 'auto' | 'noise' | 'blurry' | 'excluded' | string;
  bigfam_id?: string | null;
  count: number;
  photos: number;
  covers?: string[];
  avatar?: string | null;
  avatar_pinned?: boolean;
  hidden?: boolean;
}

export interface PersonSuggestion {
  name: string;
  score: number;
}

export interface PersonCardProps {
  group: PersonGroup;
  kin?: KinPerson | null;
  /** Человек, к которому привязана текущая учётная запись BiGFaM. */
  isSelf?: boolean;
  /** Безымянные группы мельче: главное на экране — названные люди. */
  compact?: boolean;
  /** На «Проверке» карточки не выбираются — там другой сценарий. */
  selectable?: boolean;
  /** Кого напоминает безымянная группа. Догадка, решает человек. */
  suggestion?: PersonSuggestion | null;
  onOpen(key: string): void;
  onSelect(key: string): void;
  onAccept?(key: string, suggestion: PersonSuggestion): void;
}

/** Аватарка: закреплённый кадр → портрет из картотеки → первое лицо группы. */
export function avatarSources(group: PersonGroup): string[] {
  const crop = group.avatar || group.covers?.[0] || '';
  return !group.avatar_pinned && group.bigfam_id
    ? [`/media/bigfam/${group.bigfam_id}`, crop]
    : [crop];
}

export const PersonCard = memo(function PersonCard({
  group, kin, isSelf = false, compact = false, selectable = true, suggestion, onOpen, onSelect, onAccept,
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
  const named = group.kind === 'person';
  const counts = `${formatNumber(group.count)} ${plural(group.count, 'лицо', 'лица', 'лиц')} `
    + `на ${formatNumber(group.photos)} ${plural(group.photos, 'фотографии', 'фотографиях', 'фотографиях')}`;
  const meta = named
    ? `${formatNumber(group.photos)} ${plural(group.photos, 'снимок', 'снимка', 'снимков')}`
    : `${formatNumber(group.count)} ${plural(group.count, 'лицо', 'лица', 'лиц')}`;
  const classes = ['person-card', `kind-${group.kind ?? 'auto'}`];
  if (compact) classes.push('compact');
  if (selected) classes.push('selected');
  if (suggestion) classes.push('guessed');
  if (isSelf) classes.push('is-self');

  return (
    <article className={classes.join(' ')} {...hold}>
      <div className="person-photo">
        <button className="person-avatar" type="button" aria-label={`Открыть ${group.title}`} title={counts} onClick={click}>
          <Avatar srcs={avatarSources(group)} name={group.title} />
        </button>
        {group.hidden && (
          <span className="hidden-badge" title="В скрытом альбоме — видно только админу">🔒</span>
        )}
        {isSelf && <span className="self-badge" title="Это вы">ВЫ</span>}
        <span className="tick-mark" aria-hidden="true">✓</span>
      </div>
      <button className="person-label" type="button" title={group.title} onClick={click}>
        {named
          ? <FitName name={group.title} kin={kin} className="person-name" />
          : <span className="person-name">{group.title}</span>}
        <span className="person-meta">{years ? `${years} · ${meta}` : meta}</span>
      </button>
      {suggestion && canEdit && onAccept && (
        <button
          className="person-guess"
          type="button"
          title={`Похожесть ${Math.round(suggestion.score * 100)}% — назвать группу этим именем`}
          onClick={event => { event.stopPropagation(); onAccept(group.key, suggestion); }}
        >
          <span className="person-guess-name">это {suggestion.name}?</span>
          <span className="person-guess-score">{Math.round(suggestion.score * 100)}%</span>
        </button>
      )}
    </article>
  );
});
