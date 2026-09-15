import {useEffect, useState, type CSSProperties} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import {useCatalogState} from '../../hooks/useCatalogState';
import {formatNumber, plural} from '../../lib/format';
import {
  addAlbumPhotos, addPeopleAlbumMembers, createAlbum, createPeopleAlbum, getAlbums,
} from '../../services/endpoints/albums';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';

interface PickAlbum {
  id: number;
  title: string;
  trail: string;
  depth: number;
  count: number;
}

/**
 * Раскладка по альбомам: снимки галереи или группы лиц. Раньше это были два
 * почти одинаковых окна с разными id полей.
 */
export function AlbumPickDialog() {
  const target = useStore(state => state.albums.pickTarget);
  const close = useStore(state => state.closeAlbumPick);
  const clear = useStore(state => state.clear);
  const toast = useStore(state => state.toast);
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState(0);
  const people = target?.kind === 'people';

  useEffect(() => {
    if (!target) return;
    setTitle('');
    setParent(0);
  }, [target]);

  const state = useCatalogState();
  const photoAlbums = useQuery({queryKey: qk.albums(), queryFn: getAlbums, enabled: target?.kind === 'photos'});

  const albums: PickAlbum[] = people
    ? (state.data?.people_albums ?? []).map(album => ({
        id: album.id, title: album.title, trail: album.trail, depth: 0, count: album.groups,
      }))
    : (photoAlbums.data ?? []).map(album => ({
        id: album.id, title: album.title, trail: album.trail, depth: album.depth, count: album.photos,
      }));

  const finish = (message: string) => {
    if (target?.kind === 'people') {
      clear('groups');
      void queryClient.invalidateQueries({queryKey: ['state']});
    } else {
      // Карточки снимков должны узнать про новый альбом.
      void queryClient.invalidateQueries({queryKey: qk.albums()});
      void queryClient.invalidateQueries({queryKey: ['photos']});
      void queryClient.invalidateQueries({queryKey: ['photo']});
    }
    close();
    toast(message);
  };

  const add = useMutation({
    mutationFn: (id: number): Promise<unknown> => {
      if (!target) throw new Error('Нечего добавлять');
      return target.kind === 'people'
        ? addPeopleAlbumMembers(id, target.keys)
        : addAlbumPhotos(id, target.paths);
    },
    onSuccess: () => finish('Добавлено в альбом'),
  });

  const create = useMutation({
    mutationFn: (): Promise<unknown> => {
      if (!target) throw new Error('Нечего добавлять');
      return target.kind === 'people'
        ? createPeopleAlbum(title.trim(), parent, target.keys)
        : createAlbum(title.trim(), parent, target.paths);
    },
    onSuccess: () => finish('Альбом создан'),
  });

  const count = !target ? 0 : target.kind === 'people' ? target.keys.length : target.paths.length;
  const note = people
    ? `${formatNumber(count)} ${plural(count, 'группа', 'группы', 'групп')}`
    : `${formatNumber(count)} ${plural(count, 'снимок', 'снимка', 'снимков')}`;

  return (
    <Dialog open={Boolean(target)} onClose={close}>
      <Sheet
        className="album-sheet"
        bodyClassName="album-pick-body"
        eyebrow={people ? 'Альбомы людей' : 'Альбомы'}
        title="Добавить в альбом"
        note={note}
        onClose={close}
        onSubmit={() => {
          if (!title.trim()) {
            toast('Введите название альбома');
            return;
          }
          create.mutate();
        }}
      >
        <div className="album-pick-list">
          {albums.length
            ? albums.map(album => (
                <button
                  key={album.id}
                  className="album-pick-item"
                  type="button"
                  style={{'--depth': album.depth} as CSSProperties}
                  disabled={add.isPending}
                  onClick={() => add.mutate(album.id)}
                >
                  {album.title}
                  <small>{formatNumber(album.count)}</small>
                </button>
              ))
            : <span className="person-meta">Альбомов пока нет — создайте ниже.</span>}
        </div>
        <label className="album-new">
          Новый альбом
          <input
            value={title}
            placeholder={people ? 'Например, Родственники' : 'Например, Отпуск 2010'}
            onChange={event => setTitle(event.target.value)}
          />
        </label>
        <label className="album-new">
          Внутри
          <select value={parent} onChange={event => setParent(Number(event.target.value))}>
            <option value={0}>— верхний уровень —</option>
            {albums.map(album => <option key={album.id} value={album.id}>{album.trail}</option>)}
          </select>
        </label>
        <div className="form-actions">
          <Button onClick={close}>Отмена</Button>
          <Button variant="primary" type="submit" disabled={create.isPending}>Создать и добавить</Button>
        </div>
      </Sheet>
    </Dialog>
  );
}
