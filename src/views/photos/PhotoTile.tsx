import {memo} from 'react';
import {checkedAt, isOffline, useSourceStatus} from '../../hooks/useSourceStatus';
import {adultFlag} from '../../lib/adult';
import {timecode} from '../../lib/format';
import {photoMediaUrl} from '../../services/media';
import {useStore} from '../../store';
import type {PhotoCard} from '../../types/api';
import type {AdultMode} from '../../types/domain';
import {Icon} from '../../ui/Icon/Icon';

export interface PhotoTileProps {
  photo: PhotoCard;
  index: number;
  /** Размер копии считается один раз на сетку: devicePixelRatio на тысячи плиток заметен. */
  size: number;
  /**
   * Режим 18+ — вход отрисовки, а не чтение из стора внутри: от него зависит
   * адрес копии, а с ним и кэш браузера. Иначе смена режима оставила бы
   * старые, незамыленные картинки.
   */
  adultMode: AdultMode;
  onOpen(index: number): void;
}

/**
 * Плитка — только кадр: подписи, описания и теги живут в просмотрщике.
 * Подписка на свой бит выделения: щелчок по одной плитке не перерисовывает
 * двести остальных.
 */
export const PhotoTile = memo(function PhotoTile({photo, index, size, adultMode, onOpen}: PhotoTileProps) {
  const selected = useStore(state => state.selection.photos.has(photo.path));
  const selecting = useStore(state => state.selection.photos.size > 0);
  const canEdit = useStore(state => state.session.canEdit);
  const toggle = useStore(state => state.toggle);
  // Метка источника — где лежит оригинал; её можно выключить в настройках вида.
  const showSource = useStore(state => state.prefs.showSource);
  // Источник недоступен: превью с хаба видно, но оригинал сейчас не открыть.
  const status = useSourceStatus(photo.source);
  const offline = isOffline(status);
  return (
    <article
      className={`tile${selected ? ' selected' : ''}${offline ? ' offline' : ''}`}
      title={offline
        ? `${photo.filename}
Недоступно: «${status!.name}» не в сети${checkedAt(status) ? ` (проверено ${checkedAt(status)})` : ''}`
        : photo.filename}
      data-photo-path={photo.path}
      onContextMenu={event => {
        event.preventDefault();
        if (canEdit) toggle('photos', photo.path);
      }}
      onDragStart={event => event.preventDefault()}
      onClick={event => {
        // Пока что-то выбрано, обычный щелчок продолжает выбор.
        if (canEdit && (event.ctrlKey || event.metaKey || selecting)) toggle('photos', photo.path);
        else onOpen(index);
      }}
    >
      <img
        src={photoMediaUrl(photo, adultMode, size)}
        alt={photo.caption_short || photo.caption || photo.filename}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      {adultFlag(photo) && <span className="tile-flag">18+</span>}
      {showSource && photo.source_name && <span className="tile-source">{photo.source_name}</span>}
      {photo.kind === 'video' && (
        <span className="tile-video">
          <Icon name="play" />
          {photo.duration ? timecode(photo.duration) : ''}
        </span>
      )}
      {offline && (
        <span className="tile-offline" aria-label="Недоступно">
          <Icon name="hide" size={12} /><span className="tile-offline-text">Недоступно</span>
        </span>
      )}
      <span className="tile-check" aria-hidden="true" />
    </article>
  );
});
