import {useState, type CSSProperties} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import '../../../components/albums/AlbumTree.scss';
import {AlbumMoveSelect} from '../../../components/albums/AlbumMoveSelect';
import {useCatalogState} from '../../../hooks/useCatalogState';
import {formatNumber, plural} from '../../../lib/format';
import {createAlbum, deleteAlbum, getAlbums, moveAlbum, renameAlbum} from '../../../services/endpoints/albums';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import type {Album} from '../../../types/api';
import {Button} from '../../../ui/Button/Button';

interface AlbumChange {
  call(): Promise<unknown>;
  message: string;
  /** Удалённый альбом мог быть открыт в галерее. */
  refreshPhotos?: boolean;
}

/** Альбомы снимков и личный скрытый альбом. */
export function AlbumsSection() {
  const current = useStore(state => state.filters.album);
  const hidden = useStore(state => state.filters.hidden);
  const setFilters = useStore(state => state.setFilters);
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const hiddenCount = useCatalogState().data?.stats.hidden ?? 0;
  const albums = useQuery({queryKey: qk.albums(), queryFn: getAlbums}).data ?? [];
  const [moving, setMoving] = useState<number | null>(null);

  const change = useMutation({
    mutationFn: ({call}: AlbumChange) => call(),
    onSuccess: (_data, {message, refreshPhotos}) => {
      void queryClient.invalidateQueries({queryKey: qk.albums()});
      if (refreshPhotos) void queryClient.invalidateQueries({queryKey: ['photos']});
      toast(message);
    },
    onSettled: () => setMoving(null),
  });

  const pick = (id: number) => setFilters({album: current === id ? 0 : id, folder: '', hidden: false});

  const rename = (album: Album) => {
    const title = prompt('Название альбома', album.title);
    if (title === null) return;
    change.mutate({call: () => renameAlbum(album.id, title), message: 'Альбом переименован'});
  };

  const remove = (album: Album) => {
    const nested = albums.filter(item => item.trail.startsWith(`${album.trail} / `)).length;
    if (!confirm(`Удалить альбом «${album.title}»${nested ? ` и ${nested} вложенных` : ''}?`
      + '\nСами фотографии останутся на месте.')) return;
    if (current === album.id) setFilters({album: 0});
    change.mutate({call: () => deleteAlbum(album.id), message: 'Альбом удалён', refreshPhotos: true});
  };

  return (
    <>
      {canEdit && (
        <div className="panel-actions">
          <Button
            small
            onClick={() => {
              const title = prompt('Название альбома, например «2010 год»');
              if (title) change.mutate({call: () => createAlbum(title), message: 'Альбом создан'});
            }}
          >
            Новый альбом
          </Button>
        </div>
      )}

      <div className="album-tree">
        <div className={`album-row secret${hidden ? ' active' : ''}`}>
          <button className="album-pick" type="button" onClick={() => setFilters({hidden: !hidden, album: 0})}>
            <span className="album-cover">🔒</span>
            <span className="album-body">
              <b>Скрытое</b>
              <small>
                {hiddenCount
                  ? `${formatNumber(hiddenCount)} ${plural(hiddenCount, 'снимок', 'снимка', 'снимков')} · видно только вам`
                  : 'файлы уезжают в личную папку'}
              </small>
            </span>
          </button>
        </div>

        {albums.length
          ? albums.map(album => {
              const nested = album.total - album.photos;
              return (
                <div
                  key={album.id}
                  className={`album-row${current === album.id ? ' active' : ''}`}
                  style={{'--depth': album.depth} as CSSProperties}
                >
                  <button className="album-pick" type="button" onClick={() => pick(album.id)}>
                    <span className="album-cover">
                      {album.cover && (
                        <img
                          src={`/media/photo?path=${encodeURIComponent(album.cover)}&size=120`}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                    </span>
                    <span className="album-body">
                      <b>{album.title}</b>
                      <small>
                        {formatNumber(album.photos)} {plural(album.photos, 'снимок', 'снимка', 'снимков')}
                        {nested > 0 ? ` · во вложенных ${formatNumber(nested)}` : ''}
                      </small>
                    </span>
                  </button>
                  {canEdit && (
                    <span className="album-tools">
                      <button className="icon-button tiny" type="button" title="Переименовать" onClick={() => rename(album)}>
                        ✎
                      </button>
                      <button className="icon-button tiny" type="button" title="Переместить" onClick={() => setMoving(album.id)}>
                        ⇄
                      </button>
                      <button className="icon-button tiny danger" type="button" title="Удалить альбом" onClick={() => remove(album)}>
                        🗑
                      </button>
                    </span>
                  )}
                  {moving === album.id && (
                    <AlbumMoveSelect
                      album={album}
                      albums={albums}
                      onPick={parentId => change.mutate({
                        call: () => moveAlbum(album.id, parentId), message: 'Альбом перемещён',
                      })}
                      onCancel={() => setMoving(null)}
                    />
                  )}
                </div>
              );
            })
          : <span className="person-meta">Альбомов пока нет. Создайте первый — например, «2010 год».</span>}
      </div>
    </>
  );
}
