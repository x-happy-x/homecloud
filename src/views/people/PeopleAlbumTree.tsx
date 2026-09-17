import {confirmAction, promptText} from '../../services/dialogs';
import {useRef, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import './PeopleAlbumTree.scss';
import {AlbumMoveSelect} from '../../components/albums/AlbumMoveSelect';
import {avatarSources} from '../../components/people/PersonCard';
import {useSwipeScroll} from '../../hooks/useSwipeScroll';
import {formatNumber, plural} from '../../lib/format';
import {
  createPeopleAlbum, deletePeopleAlbum, movePeopleAlbum, renamePeopleAlbum, setPeopleAlbumHidden,
} from '../../services/endpoints/albums';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import type {Group, PeopleAlbum} from '../../types/api';
import {Avatar} from '../../ui/Avatar/Avatar';
import {Icon} from '../../ui/Icon/Icon';

interface AlbumChange {
  call(): Promise<unknown>;
  message: string;
}

/** Сколько лиц внахлёст на обложке альбома. */
const COVER_FACES = 3;

const groupsText = (count: number) => `${formatNumber(count)} ${plural(count, 'группа', 'группы', 'групп')}`;

/**
 * Альбомы людей. Сверху — лента карточек вложенных альбомов (листается
 * свайпом), а внутри открытого альбома — панель с путём и действиями.
 * Раньше это было дерево строк, где кнопки появлялись только при наведении:
 * на телефоне до них было не добраться, а строки налезали друг на друга.
 */
export function PeopleAlbumTree({albums, groups}: {albums: PeopleAlbum[]; groups: Group[]}) {
  const current = useStore(state => state.albums.peopleAlbum);
  const setPeopleAlbum = useStore(state => state.setPeopleAlbum);
  const canEdit = useStore(state => state.session.canEdit);
  const isAdmin = useStore(state => state.session.isAdmin);
  const toast = useStore(state => state.toast);
  const [moving, setMoving] = useState(false);
  const rail = useRef<HTMLDivElement>(null);

  const change = useMutation({
    mutationFn: ({call}: AlbumChange) => call(),
    onSuccess: (_data, {message}) => {
      void queryClient.invalidateQueries({queryKey: ['state']});
      toast(message);
    },
    onSettled: () => setMoving(false),
  });

  const byId = new Map(albums.map(album => [album.id, album]));
  const groupByKey = new Map(groups.map(group => [group.key, group]));
  const open = byId.get(current);
  const level = albums.filter(album => album.parent_id === (open ? current : 0));
  const showRail = level.length > 0 || canEdit;
  useSwipeScroll(rail, showRail);
  if (!level.length && !open && !canEdit) return null;

  const crumbs: PeopleAlbum[] = [];
  for (let album = open; album; album = byId.get(album.parent_id)) crumbs.unshift(album);

  const create = async () => {
    const title = await promptText(open ? `Новый альбом внутри «${open.title}»` : 'Название альбома, например «Родственники»');
    if (!title) return;
    change.mutate({call: () => createPeopleAlbum(title, open?.id ?? 0), message: 'Альбом создан'});
  };

  const rename = async (album: PeopleAlbum) => {
    const title = await promptText('Название альбома', album.title);
    if (title === null) return;
    change.mutate({call: () => renamePeopleAlbum(album.id, title), message: 'Альбом переименован'});
  };

  const remove = async (album: PeopleAlbum) => {
    const nested = albums.filter(item => item.trail.startsWith(`${album.trail} / `)).length;
    if (!await confirmAction(`Удалить альбом «${album.title}»${nested ? ` и ${nested} вложенных` : ''}?`
      + '\nСами люди и группы останутся на месте.')) return;
    setPeopleAlbum(album.parent_id);
    change.mutate({call: () => deletePeopleAlbum(album.id), message: 'Альбом удалён'});
  };

  return (
    <nav className="people-albums" aria-label="Альбомы людей">
      {open && (
        <div className={`people-album-bar${open.effectively_hidden ? ' secret' : ''}`}>
          <button
            type="button"
            className="people-album-back"
            aria-label="На уровень выше"
            onClick={() => setPeopleAlbum(open.parent_id)}
          >
            <Icon name="chevronLeft" size={20} />
          </button>
          <div className="people-album-title">
            <span className="people-album-trail">
              <button type="button" onClick={() => setPeopleAlbum(0)}>Все люди</button>
              {crumbs.slice(0, -1).map(album => (
                <button key={album.id} type="button" onClick={() => setPeopleAlbum(album.id)}>{album.title}</button>
              ))}
            </span>
            <strong>
              {open.title}
              {open.effectively_hidden && <Icon name="hide" size={16} />}
            </strong>
            <small>
              {groupsText(open.total)}
              {open.effectively_hidden ? ' · скрыт ото всех, кроме админа' : ''}
            </small>
          </div>
          {canEdit && (
            <div className="people-album-actions">
              {isAdmin && (
                <button
                  type="button"
                  title={open.hidden ? 'Показать всем' : 'Скрыть от всех, кроме админа'}
                  onClick={() => change.mutate({
                    call: () => setPeopleAlbumHidden(open.id, !open.hidden),
                    message: open.hidden ? 'Альбом снова виден всем' : 'Альбом скрыт ото всех, кроме админа',
                  })}
                >
                  <Icon name="hide" size={16} />
                  <span>{open.hidden ? 'Показать' : 'Скрыть'}</span>
                </button>
              )}
              <button type="button" title="Переименовать" onClick={() => rename(open)}>
                <Icon name="notes" size={16} />
                <span>Имя</span>
              </button>
              <button type="button" title="Переместить в другой альбом" onClick={() => setMoving(value => !value)}>
                <Icon name="folder" size={16} />
                <span>Переместить</span>
              </button>
              <button type="button" className="danger" title="Удалить альбом" onClick={() => remove(open)}>
                <Icon name="trash" size={16} />
                <span>Удалить</span>
              </button>
            </div>
          )}
          {moving && (
            <AlbumMoveSelect
              album={open}
              albums={albums}
              onPick={parentId => change.mutate({
                call: () => movePeopleAlbum(open.id, parentId), message: 'Альбом перемещён',
              })}
              onCancel={() => setMoving(false)}
            />
          )}
        </div>
      )}

      {showRail && (
        <div className="people-album-rail swipe-rail" ref={rail}>
          {level.map(album => {
            const faces = album.member_keys
              .map(key => groupByKey.get(key))
              .filter((group): group is Group => Boolean(group))
              .slice(0, COVER_FACES);
            return (
              <button
                key={album.id}
                type="button"
                className={`people-album-card${album.effectively_hidden ? ' secret' : ''}`}
                onClick={() => setPeopleAlbum(album.id)}
              >
                <span className="people-album-faces" aria-hidden="true">
                  {faces.length
                    ? faces.map(group => (
                        <span key={group.key} className="people-album-face">
                          <Avatar srcs={avatarSources(group)} name={group.title} />
                        </span>
                      ))
                    : <span className="people-album-face blank"><Icon name="people" size={18} /></span>}
                </span>
                <span className="people-album-text">
                  <b>
                    {album.title}
                    {album.effectively_hidden && <Icon name="hide" size={13} />}
                  </b>
                  <small>
                    {groupsText(album.total)}
                    {(album.children?.length ?? 0) > 0
                      ? ` · ${formatNumber(album.children!.length)} ${plural(album.children!.length, 'альбом', 'альбома', 'альбомов')}`
                      : ''}
                  </small>
                </span>
              </button>
            );
          })}
          {canEdit && (
            <button type="button" className="people-album-card add" onClick={create}>
              <span className="people-album-face blank" aria-hidden="true"><Icon name="plus" size={18} /></span>
              <span className="people-album-text">
                <b>{open ? 'Вложенный альбом' : 'Новый альбом'}</b>
                <small>{open ? `внутри «${open.title}»` : 'например, «Родственники»'}</small>
              </span>
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
