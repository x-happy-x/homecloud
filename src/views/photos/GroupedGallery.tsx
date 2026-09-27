import {memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent} from 'react';
import './GroupedGallery.scss';
import {useIntersection} from '../../hooks/useIntersection';
import {adultFlag} from '../../lib/adult';
import {formatNumber, plural} from '../../lib/format';
import type {PhotoFilterParams} from '../../services/endpoints/catalog';
import {photoMediaUrl} from '../../services/media';
import {useStore} from '../../store';
import type {GalleryFilters, PhotoScope} from '../../store/slices/gallery';
import type {PhotoGroup} from '../../types/api';
import type {AdultMode, ZoomLevel} from '../../types/domain';
import {Icon} from '../../ui/Icon/Icon';
import {IconButton} from '../../ui/IconButton/IconButton';
import {GROUP_NONE, groupHeading, groupNote, isCollapsed, isDated, type GroupBy, type Grouping} from './grouping';
import {PhotoTile} from './PhotoTile';
import {PHOTO_PAGE, scopedParams, usePhotoPages} from './useGallery';
import {YearScrubber} from './YearScrubber';

/** Ширина плитки в сетке auto-fill и число колонок на телефоне — как в PhotosView.scss. */
const TILE_MIN: Record<ZoomLevel, number> = {small: 104, medium: 168, large: 264};
const PHONE_COLUMNS: Record<ZoomLevel, number> = {small: 5, medium: 3, large: 2};
const GAP = 3;
const PHONE_GAP = 2;
const PHONE_WIDTH = 720;

interface Geometry {
  columns: number;
  tile: number;
  gap: number;
}

/**
 * Сколько колонок и какой ширины плитка. Нужна, чтобы незагруженная группа
 * сразу заняла своё место: иначе прокрутка прыгает, пока страницы приходят.
 */
function useGeometry(zoom: ZoomLevel) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const geometry = useMemo<Geometry>(() => {
    const phone = window.innerWidth <= PHONE_WIDTH;
    const gap = phone ? PHONE_GAP : GAP;
    // На телефоне сетка выходит к краям экрана (отрицательные поля).
    const full = phone ? window.innerWidth : width;
    const columns = phone
      ? PHONE_COLUMNS[zoom]
      : Math.max(1, Math.floor((full + gap) / (TILE_MIN[zoom] + gap)));
    return {columns, gap, tile: Math.max(1, (full - gap * (columns - 1)) / columns)};
  }, [width, zoom]);
  return {ref, geometry};
}

const blockHeight = (count: number, {columns, tile, gap}: Geometry): number => {
  const rows = Math.ceil(count / columns);
  return rows ? rows * tile + (rows - 1) * gap : 0;
};

/** Группа как фильтр: папка, альбом или человек открываются отдельной галереей. */
function groupFilter(by: GroupBy, key: string): Partial<GalleryFilters> | null {
  if (key === GROUP_NONE) return null;
  if (by === 'folder') return {folder: key, folderDeep: false};
  if (by === 'album') return {album: Number(key)};
  if (by === 'person') return {people: [key]};
  if (by === 'type') return {contentType: key};
  if (by === 'kind') return key === 'video' ? {kind: 'video'} : null;
  return null;
}

/** Обложка приходит путём и отметкой — адрес копии тот же, что у плитки. */
const coverPhoto = ({path, v, adult_rating}: PhotoGroup['covers'][number]) => ({
  path, adult_rating, preview: `/media/photo?path=${encodeURIComponent(path)}&v=${v}`,
});

const FILTER_LABELS: Partial<Record<GroupBy, string>> = {
  folder: 'Открыть папку', album: 'Открыть альбом', person: 'Только этот человек',
  type: 'Только такие снимки', kind: 'Только видео',
};

export interface GroupedGalleryProps {
  groups: PhotoGroup[];
  isPending: boolean;
  grouping: Grouping;
  params: PhotoFilterParams;
  zoom: ZoomLevel;
  size: number;
  adultMode: AdultMode;
  onFolderMenu(event: MouseEvent, path: string): void;
}

export function GroupedGallery({
  groups, isPending, grouping, params, zoom, size, adultMode, onFolderMenu,
}: GroupedGalleryProps) {
  const {ref, geometry} = useGeometry(zoom);
  const rules = useStore(state => state.prefs.collapsed);
  const scrubber = isDated(grouping.by) && !isPending && groups.length > 1;

  return (
    <div ref={ref} className="gallery-groups" data-zoom={zoom}>
      {scrubber && <YearScrubber groups={groups} />}
      {isPending
        ? Array.from({length: 3}, (_, index) => (
            <section key={index} className="gallery-group">
              <div className="gallery-group-head skeleton-head"><span className="skeleton-line" /></div>
              <div className="group-placeholder" style={{height: blockHeight(geometry.columns * 2, geometry)}} />
            </section>
          ))
        : groups.map(group => (
            <GallerySection
              key={group.key}
              group={group}
              by={grouping.by}
              order={grouping.order}
              zoom={zoom}
              collapsed={isCollapsed(rules, grouping.by, group.key)}
              params={params}
              geometry={geometry}
              size={size}
              adultMode={adultMode}
              onFolderMenu={onFolderMenu}
            />
          ))}
    </div>
  );
}

interface SectionProps {
  group: PhotoGroup;
  by: GroupBy;
  order: string;
  zoom: ZoomLevel;
  collapsed: boolean;
  params: PhotoFilterParams;
  geometry: Geometry;
  size: number;
  adultMode: AdultMode;
  onFolderMenu(event: MouseEvent, path: string): void;
}

/**
 * Группа — заголовок и, если раскрыта, своя постраничная сетка. У свёрнутой
 * группы запросов нет вовсе: папок бывают тысячи.
 */
const GallerySection = memo(function GallerySection({
  group, by, order, zoom, collapsed, params, geometry, size, adultMode, onFolderMenu,
}: SectionProps) {
  const toggleGroup = useStore(state => state.toggleGroup);
  const setFilters = useStore(state => state.setFilters);
  const heading = groupHeading(by, group);
  const note = groupNote(by, group);
  const filter = groupFilter(by, group.key);
  const scope = useMemo<PhotoScope>(() => ({groupBy: by, group: group.key, order}), [by, group.key, order]);
  const hideAdult = adultMode === 'hide';
  const covers = group.covers.filter(cover => !(hideAdult && adultFlag(cover))).slice(0, 4);
  const coverSize = Math.round(56 * Math.min(window.devicePixelRatio || 1, 2));
  // Меню есть только у настоящей папки: у корзины «без папки» её нет.
  const withMenu = by === 'folder' && group.key !== GROUP_NONE;

  return (
    <section className={`gallery-group${collapsed ? ' collapsed' : ''}`} data-group={group.key}>
      <div
        className={`gallery-group-head${withMenu ? ' has-context-menu' : ''}`}
        onContextMenu={withMenu ? event => onFolderMenu(event, group.key) : undefined}
      >
        <button
          type="button"
          className="group-toggle"
          aria-expanded={!collapsed}
          onClick={() => toggleGroup(by, group.key)}
        >
          <Icon name="chevronDown" className="group-caret" />
          <span className="group-text">
            <strong>{heading}</strong>
            <small>
              {formatNumber(group.count)} {plural(group.count, 'снимок', 'снимка', 'снимков')}
              {note && <span className="group-note" title={note}> · {note}</span>}
            </small>
          </span>
        </button>
        {collapsed && covers.length > 0 && (
          <button
            type="button"
            className="group-covers"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => toggleGroup(by, group.key)}
          >
            {covers.map((cover, index) => (
              <img key={index} src={photoMediaUrl(coverPhoto(cover), adultMode, coverSize)} alt="" loading="lazy" decoding="async" />
            ))}
          </button>
        )}
        {!collapsed && <SelectGroup scope={scope} params={params} />}
        {filter && (
          <IconButton
            icon="openExternal"
            label={FILTER_LABELS[by] ?? 'Открыть'}
            tiny
            onClick={() => setFilters(filter)}
          />
        )}
      </div>
      {!collapsed && (
        <SectionBody
          count={group.count}
          zoom={zoom}
          scope={scope}
          params={params}
          geometry={geometry}
          size={size}
          adultMode={adultMode}
        />
      )}
    </section>
  );
});

/** Выбрать загруженные снимки группы — или снять выбор, если они уже выбраны. */
function SelectGroup({scope, params}: {scope: PhotoScope; params: PhotoFilterParams}) {
  const canEdit = useStore(state => state.session.canEdit);
  const selected = useStore(state => state.selection.photos);
  const select = useStore(state => state.select);
  const scoped = useMemo(() => scopedParams(params, scope), [params, scope]);
  // Запрос тот же, что у сетки группы, — второго похода на сервер нет.
  const {photos} = usePhotoPages(scoped, false);
  if (!canEdit || !photos.length) return null;
  const all = photos.every(photo => selected.has(photo.path));
  const toggle = () => {
    const paths = new Set(selected);
    photos.forEach(photo => (all ? paths.delete(photo.path) : paths.add(photo.path)));
    select('photos', [...paths]);
  };
  return (
    <button
      type="button"
      className={`group-select${all ? ' checked' : ''}${selected.size ? ' visible' : ''}`}
      aria-pressed={all}
      title={all ? 'Снять выбор с группы' : 'Выбрать группу'}
      aria-label={all ? 'Снять выбор с группы' : 'Выбрать группу'}
      onClick={toggle}
    >
      <Icon name="check" />
    </button>
  );
}

interface BodyProps {
  count: number;
  zoom: ZoomLevel;
  scope: PhotoScope;
  params: PhotoFilterParams;
  geometry: Geometry;
  size: number;
  adultMode: AdultMode;
}

function SectionBody({count, zoom, scope, params, geometry, size, adultMode}: BodyProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const near = useIntersection(zoneRef, {rootMargin: '1000px'});
  // Однажды попавшая в поле зрения группа остаётся загруженной: прокрутка
  // назад не должна снова показывать пустое место.
  const [wanted, setWanted] = useState(false);
  useEffect(() => { if (near) setWanted(true); }, [near]);

  const scoped = useMemo(() => scopedParams(params, scope), [params, scope]);
  const {photos, total, isPending, hasNextPage, isFetchingNextPage, fetchNextPage} = usePhotoPages(scoped, wanted);
  const nearEnd = useIntersection(edgeRef);
  const selecting = useStore(state => state.selection.photos.size > 0);
  const canEdit = useStore(state => state.session.canEdit);
  const openPhoto = useStore(state => state.openPhoto);

  useEffect(() => {
    if (nearEnd && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [nearEnd, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const list = useRef(photos);
  list.current = photos;
  const open = useCallback((index: number) => {
    const photo = list.current[index];
    if (photo) openPhoto(photo.path, scope);
  }, [openPhoto, scope]);

  const known = Math.max(total, count);
  // Сколько места держать под ещё не пришедшее: одна страница, не вся группа.
  const pending = isPending ? Math.min(count, PHOTO_PAGE)
    : hasNextPage ? Math.min(known - photos.length, PHOTO_PAGE) : 0;

  return (
    <div ref={zoneRef} className="group-body">
      {photos.length > 0 && (
        <div className={`photo-grid${selecting && canEdit ? ' selecting' : ''}`} data-zoom={zoom}>
          {photos.map((photo, index) => (
            <PhotoTile key={photo.path} photo={photo} index={index} size={size} adultMode={adultMode} onOpen={open} />
          ))}
        </div>
      )}
      {pending > 0 && (
        <div
          ref={edgeRef}
          className={`group-placeholder${wanted ? ' loading' : ''}`}
          style={{height: blockHeight(pending, geometry), marginTop: photos.length ? geometry.gap : 0}}
        />
      )}
    </div>
  );
}
