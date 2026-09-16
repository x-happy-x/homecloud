import {useCallback, useEffect, useRef, useState, type MouseEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import './PhotosView.scss';
import {useCatalogState} from '../../hooks/useCatalogState';
import {useIntersection} from '../../hooks/useIntersection';
import {formatNumber, plural} from '../../lib/format';
import {getAlbums} from '../../services/endpoints/albums';
import {tileSize} from '../../services/media';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import type {ZoomLevel} from '../../types/domain';
import {ActionBar} from '../../ui/ActionBar/ActionBar';
import {Button} from '../../ui/Button/Button';
import {Chip, Chips} from '../../ui/Chip/Chip';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Icon, type IconName} from '../../ui/Icon/Icon';
import {Skeleton} from '../../ui/Skeleton/Skeleton';
import {ViewHeader} from '../../ui/ViewHeader/ViewHeader';
import {baseName, bigfamPersonUrl, dropFilter, galleryContext} from './gallery';
import {FolderContextMenu, type FolderMenuState} from './FolderContextMenu';
import {FolderPickerDialog, type PickedFolder} from '../../components/FolderPicker/FolderPickerDialog';
import {PhotoTile} from './PhotoTile';
import {useGallery} from './useGallery';
import {useFolderActions} from './useFolderActions';
import {usePhotoActions} from './usePhotoActions';

const ZOOM_STEPS: Array<[ZoomLevel, IconName, string]> = [
  ['large', 'zoomLarge', 'Крупные плитки'],
  ['medium', 'zoomMedium', 'Средние плитки'],
  ['small', 'zoomSmall', 'Мелкие плитки'],
];

export function PhotosView() {
  const {photos, total, isPending, hasNextPage, isFetchingNextPage, fetchNextPage} = useGallery();
  const filters = useStore(state => state.filters);
  const setFilters = useStore(state => state.setFilters);
  const zoom = useStore(state => state.prefs.zoom);
  const setZoom = useStore(state => state.setZoom);
  const adultMode = useStore(state => state.prefs.adultMode);
  const canEdit = useStore(state => state.session.canEdit);
  const bigfamUrl = useStore(state => state.session.bigfamUrl);
  const selected = useStore(state => state.selection.photos);
  const select = useStore(state => state.select);
  const clear = useStore(state => state.clear);
  const openSidepage = useStore(state => state.openSidepage);
  const openAlbumPick = useStore(state => state.openAlbumPick);
  const openProcess = useStore(state => state.openProcess);
  const setRoutePhoto = useStore(state => state.setRoutePhoto);
  const people = useCatalogState().data?.people;
  const albums = useQuery({queryKey: qk.albums(), queryFn: getAlbums}).data;
  const actions = usePhotoActions();
  const folderActions = useFolderActions();
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [moveFolder, setMoveFolder] = useState('');

  const edge = useRef<HTMLDivElement>(null);
  const nearEnd = useIntersection(edge);

  // Край сетки виден — берём следующую страницу. Если страница не заполнила
  // экран, край остаётся видимым и после загрузки, и эффект сработает снова:
  // ручной «дёрнем ещё раз через 60 мс» больше не нужен.
  useEffect(() => {
    if (nearEnd && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [nearEnd, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Выбор живёт только среди показанного: после смены фильтров чужие пути выбывают.
  useEffect(() => {
    if (isPending || !selected.size) return;
    const shown = new Set(photos.map(photo => photo.path));
    const kept = [...selected].filter(path => shown.has(path));
    if (kept.length !== selected.size) select('photos', kept);
  }, [isPending, photos, selected, select]);

  const list = useRef(photos);
  list.current = photos;
  const open = useCallback((index: number) => {
    const photo = list.current[index];
    if (photo) setRoutePhoto(photo.path);
  }, [setRoutePhoto]);

  const size = tileSize(zoom);
  const chips = galleryContext(filters, albums);
  const person = filters.people.length === 1
    ? people?.find(item => item.name === filters.people[0])
    : undefined;
  const shown = photos.length;
  const all = Math.max(total, shown);
  const counter = !all ? 'Галерея'
    : shown < all ? `Показано ${formatNumber(shown)} из ${formatNumber(all)}`
    : `${formatNumber(all)} ${plural(all, 'снимок', 'снимка', 'снимков')}`;
  const count = selected.size;
  const paths = [...selected];

  const openFolderMenu = (event: MouseEvent, path: string) => {
    event.preventDefault();
    setFolderMenu({
      path,
      label: baseName(path),
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 190),
    });
  };

  const movePicked = (target: PickedFolder) => {
    const path = moveFolder;
    setMoveFolder('');
    folderActions.move(path, target);
  };

  return (
    <section className="view active">
      <ViewHeader eyebrow={counter} title="Фотографии">
        <div className="zoom" role="group" aria-label="Размер плиток">
          {ZOOM_STEPS.map(([level, icon, label]) => (
            <button
              key={level}
              className={`zoom-step${zoom === level ? ' active' : ''}`}
              type="button"
              aria-label={label}
              onClick={() => setZoom(level)}
            >
              <Icon name={icon} />
            </button>
          ))}
        </div>
      </ViewHeader>

      <div className="gallery-bar">
        <Button small onClick={openSidepage}>
          <Icon name="filters" size={16} />
          Подборки и фильтры
          {chips.length > 0 && <span className="bar-count">{chips.length}</span>}
        </Button>
        <Chips className="context-chips">
          {chips.map(chip => {
            const folderPath = chip.drop.kind === 'folder' ? filters.folder : '';
            return (
              <Chip
                key={chip.label}
                context
                onClick={() => setFilters(dropFilter(filters, chip.drop))}
                onContextMenu={folderPath ? event => openFolderMenu(event, folderPath) : undefined}
              >
                {chip.label}
              </Chip>
            );
          })}
        </Chips>
      </div>

      {person && (
        <div className="person-context">
          {person.bigfam_id && <img src={`/media/bigfam/${person.bigfam_id}`} alt="" />}
          <div className="body">
            <strong>{person.name}</strong>
            <small>Фотографии с этим человеком</small>
          </div>
          {person.bigfam_id
            ? (
              <a className="button small" href={bigfamPersonUrl(bigfamUrl, person.bigfam_id)}
                target="_blank" rel="noopener">
                Открыть в BiGFaM
              </a>
            )
            : <span className="photo-unknown">Не связан с BiGFaM</span>}
        </div>
      )}

      {canEdit && (
        <ActionBar
          variant="sticky"
          count={count}
          countLabel={`${formatNumber(count)} выбрано`}
          onClear={() => clear('photos')}
          actions={
            <>
              <Button small onClick={() => select('photos', photos.map(photo => photo.path))}>
                Выбрать все показанные
              </Button>
              <span className="toolbar-spacer" />
              <Button small onClick={() => openAlbumPick({kind: 'photos', paths})}>В альбом</Button>
              <Button
                small
                disabled={actions.busy}
                onClick={() => (filters.hidden ? actions.reveal(paths) : actions.hide(paths))}
              >
                {filters.hidden ? 'Вернуть из скрытого' : 'Скрыть'}
              </Button>
              <Button variant="primary" small onClick={() => openProcess(paths)}>Обработать</Button>
              <Button variant="danger" small disabled={actions.busy} onClick={() => actions.remove(paths)}>
                Удалить
              </Button>
            </>
          }
        />
      )}

      <div className={`photo-grid${count > 0 && canEdit ? ' selecting' : ''}`} data-zoom={zoom}>
        {isPending
          ? <Skeleton count={18} variant="photo" />
          : photos.map((photo, index) => (
              <PhotoTile
                key={photo.path}
                photo={photo}
                index={index}
                size={size}
                adultMode={adultMode}
                onOpen={open}
              />
            ))}
      </div>
      <div ref={edge} className={`grid-more${isFetchingNextPage ? ' loading' : ''}`} aria-hidden="true" />

      <FolderContextMenu
        menu={folderMenu}
        canEdit={canEdit}
        busy={folderActions.busy}
        onClose={() => setFolderMenu(null)}
        onExclude={folderActions.excludeFromFilter}
        onHide={folderActions.hide}
        onMove={setMoveFolder}
        onDelete={folderActions.remove}
      />
      <FolderPickerDialog
        open={Boolean(moveFolder)}
        title="Куда переместить папку"
        note="Выберите подключенный бэк и папку назначения. Медиа из исходной папки будут перенесены внутрь выбранной папки."
        confirmLabel="Переместить сюда"
        onClose={() => setMoveFolder('')}
        onPick={movePicked}
      />

      {!isPending && photos.length === 0 && (
        <EmptyState mark="▧" title="Фотографии не найдены">
          Для совместного поиска сначала назначьте людям имена.
        </EmptyState>
      )}
    </section>
  );
}
