export interface MovableAlbum {
  id: number;
  parent_id: number;
  trail: string;
}

export interface AlbumMoveSelectProps {
  album: MovableAlbum;
  albums: MovableAlbum[];
  onPick(parentId: number): void;
  onCancel(): void;
}

/** Перенос альбома прямо в строке: список возможных родителей без самого альбома и его потомков. */
export function AlbumMoveSelect({album, albums, onPick, onCancel}: AlbumMoveSelectProps) {
  const inside = `${album.trail} / `;
  const allowed = albums.filter(item => item.id !== album.id && !item.trail.startsWith(inside));
  return (
    <select
      className="album-move"
      autoFocus
      defaultValue={String(album.parent_id || 0)}
      onChange={event => onPick(Number(event.target.value))}
      onBlur={onCancel}
    >
      <option value="0">— верхний уровень —</option>
      {allowed.map(item => <option key={item.id} value={item.id}>{item.trail}</option>)}
    </select>
  );
}
