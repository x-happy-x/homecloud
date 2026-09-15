import {useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import '../../components/albums/AlbumTree.scss';
import {AlbumMoveSelect} from '../../components/albums/AlbumMoveSelect';
import {formatNumber, plural} from '../../lib/format';
import {
  deletePeopleAlbum, movePeopleAlbum, renamePeopleAlbum, setPeopleAlbumHidden,
} from '../../services/endpoints/albums';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import type {PeopleAlbum} from '../../types/api';

interface AlbumChange {
  call(): Promise<unknown>;
  message: string;
}

/**
 * Альбомы людей. Внутри альбома — только его прямые дети, не всё дерево
 * сразу: так же, как папки снимков, а не плоский список на восемь уровней.
 */
export function PeopleAlbumTree({albums}: {albums: PeopleAlbum[]}) {
  const current = useStore(state => state.albums.peopleAlbum);
  const setPeopleAlbum = useStore(state => state.setPeopleAlbum);
  const canEdit = useStore(state => state.session.canEdit);
  const isAdmin = useStore(state => state.session.isAdmin);
  const toast = useStore(state => state.toast);
  const [moving, setMoving] = useState<number | null>(null);

  const change = useMutation({
    mutationFn: ({call}: AlbumChange) => call(),
    onSuccess: (_data, {message}) => {
      void queryClient.invalidateQueries({queryKey: ['state']});
      toast(message);
    },
    onSettled: () => setMoving(null),
  });

  const byId = new Map(albums.map(album => [album.id, album]));
  const level = albums.filter(album => album.parent_id === current);
  if (!level.length && !current) return null;

  const crumbs: PeopleAlbum[] = [];
  for (let album = byId.get(current); album; album = byId.get(album.parent_id)) crumbs.unshift(album);

  const rename = (album: PeopleAlbum) => {
    const title = prompt('Название альбома', album.title);
    if (title === null) return;
    change.mutate({call: () => renamePeopleAlbum(album.id, title), message: 'Альбом переименован'});
  };

  const remove = (album: PeopleAlbum) => {
    const nested = albums.filter(item => item.trail.startsWith(`${album.trail} / `)).length;
    if (!confirm(`Удалить альбом «${album.title}»${nested ? ` и ${nested} вложенных` : ''}?`
      + '\nСами люди и группы останутся на месте.')) return;
    if (current === album.id) setPeopleAlbum(0);
    change.mutate({call: () => deletePeopleAlbum(album.id), message: 'Альбом удалён'});
  };

  return (
    <div className="album-tree people-album-tree">
      <div className="album-row people-album-crumbs">
        <button className={`album-pick${current ? '' : ' active'}`} type="button" onClick={() => setPeopleAlbum(0)}>
          <span className="album-body"><b>Все люди</b></span>
        </button>
        {crumbs.map(album => (
          <button key={album.id} className="album-pick active" type="button" onClick={() => setPeopleAlbum(album.id)}>
            <span className="album-body"><b>{album.title}</b></span>
          </button>
        ))}
      </div>

      {level.map(album => {
        const nested = album.total - album.groups;
        return (
          <div key={album.id} className={`album-row${album.hidden ? ' people-album-hidden' : ''}`}>
            <button className="album-pick" type="button" onClick={() => setPeopleAlbum(album.id)}>
              <span className="album-body">
                <b>{album.title}{album.hidden ? ' 🔒' : ''}</b>
                <small>
                  {formatNumber(album.groups)} {plural(album.groups, 'группа', 'группы', 'групп')}
                  {nested > 0 ? ` · во вложенных ${formatNumber(nested)}` : ''}
                </small>
              </span>
            </button>
            <span className="album-tools">
              {isAdmin && (
                <button
                  className="icon-button tiny"
                  type="button"
                  title={album.hidden ? 'Показать всем' : 'Скрыть от всех, кроме админа'}
                  onClick={() => change.mutate({
                    call: () => setPeopleAlbumHidden(album.id, !album.hidden),
                    message: album.hidden ? 'Альбом снова виден всем' : 'Альбом скрыт ото всех, кроме админа',
                  })}
                >
                  {album.hidden ? '🙈' : '👁'}
                </button>
              )}
              {canEdit && (
                <>
                  <button className="icon-button tiny" type="button" title="Переименовать" onClick={() => rename(album)}>
                    ✎
                  </button>
                  <button className="icon-button tiny" type="button" title="Переместить" onClick={() => setMoving(album.id)}>
                    ⇄
                  </button>
                  <button className="icon-button tiny danger" type="button" title="Удалить альбом" onClick={() => remove(album)}>
                    🗑
                  </button>
                </>
              )}
            </span>
            {moving === album.id && (
              <AlbumMoveSelect
                album={album}
                albums={albums}
                onPick={parentId => change.mutate({
                  call: () => movePeopleAlbum(album.id, parentId), message: 'Альбом перемещён',
                })}
                onCancel={() => setMoving(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
