import type {SimilarGroup} from './similar';

/** Лицо группы в списках похожих: кадр, а если его нет — первая буква имени. */
export function GroupFace({group}: {group: SimilarGroup}) {
  if (!group.avatar) {
    return <span className="similar-face blank">{(group.title || '?').charAt(0)}</span>;
  }
  return <img className="similar-face" src={group.avatar} alt="" loading="lazy" />;
}
