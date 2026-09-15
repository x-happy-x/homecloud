import {useCallback, useEffect, useMemo, useRef} from 'react';
import {useMutation, useQueries, useQuery} from '@tanstack/react-query';
import './Viewer.scss';
import {VIEW_TITLES} from '../../../app/routes';
import {useDragScroll} from '../../../hooks/useDragScroll';
import {useKeyboardShortcuts} from '../../../hooks/useKeyboardShortcuts';
import {formatNumber, photoDate, timecode} from '../../../lib/format';
import {getGroup, getPhoto} from '../../../services/endpoints/catalog';
import {clearAvatar, setAvatar} from '../../../services/endpoints/people';
import {uploadForSearch} from '../../../services/endpoints/photos';
import {density, photoMediaUrl, viewerSize} from '../../../services/media';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import type {GroupDetail, GroupFace, PhotoCard} from '../../../types/api';
import type {AdultMode} from '../../../types/domain';
import {Dialog} from '../../../ui/Dialog/Dialog';
import {Icon} from '../../../ui/Icon/Icon';
import {useGallery} from '../useGallery';
import {usePhotoActions} from '../usePhotoActions';
import {InfoPanel} from './InfoPanel';

/** Сколько кадров по обе стороны от текущего показывает лента. */
const STRIP_RADIUS = 25;
/** Короче — это касание, а не листание. */
const SWIPE_MIN = 45;
/** Листаем к концу загруженного — подтягиваем следующую страницу заранее. */
const PRELOAD_EDGE = 3;
/** В просмотре лиц карточки снимков грузятся вокруг текущего кадра, а не все сразу. */
const FACE_PRELOAD = 2;

/** Снимок пропал с диска между сканами — показываем хотя бы кадр лица. */
const facePlaceholder = (face: GroupFace): PhotoCard => ({
  path: face.path, filename: face.filename, folder: '',
  // У оригинала кадра нет строки запроса — без «?» размер дописался бы к пути.
  preview: `${face.original}?face=1`,
  video: face.kind === 'video' ? face.original : '', kind: face.kind, duration: 0, taken: null,
  caption: '', caption_short: '', caption_tags: [], ocr_text: '', adult_description: '',
  adult_regions: [], people: [], face_count: 0, faces: [], router_labels: [], albums: [],
  speech_text: '', hidden_owner: '',
});

/** Общий просмотрщик: снимки галереи или кадры одного человека из карточки группы. */
export function Viewer() {
  const faceGroup = useStore(state => state.viewer.faceGroup);
  return faceGroup ? <FaceViewer group={faceGroup} /> : <GalleryViewer />;
}

function GalleryViewer() {
  const routePhoto = useStore(state => state.routePhoto);
  const setRoutePhoto = useStore(state => state.setRoutePhoto);
  const {photos, isPending, hasNextPage, isFetchingNextPage, fetchNextPage} = useGallery();

  const position = photos.findIndex(photo => photo.path === routePhoto);
  // Снимок открыт прямо по ссылке, а в загруженных страницах его нет.
  const single = useQuery({
    queryKey: qk.photo(routePhoto),
    queryFn: () => getPhoto(routePhoto),
    enabled: Boolean(routePhoto) && !isPending && position < 0,
  });

  const list = position >= 0 || !single.data ? photos : [...photos, single.data];
  const index = position >= 0 ? position : single.data ? photos.length : -1;

  useEffect(() => {
    if (routePhoto && single.isError) setRoutePhoto('');
  }, [routePhoto, single.isError, setRoutePhoto]);

  useEffect(() => {
    if (index >= 0 && index >= list.length - PRELOAD_EDGE && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [index, list.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <ViewerDialog
      list={list}
      index={index}
      open={Boolean(routePhoto) && index >= 0}
      closeThroughHistory
      onGo={next => setRoutePhoto(list[(next + list.length) % list.length].path)}
      onClose={() => setRoutePhoto('')}
    />
  );
}

function FaceViewer({group}: {group: GroupDetail}) {
  const index = useStore(state => state.viewer.faceIndex);
  const setFaceIndex = useStore(state => state.setFaceIndex);
  const closeFaces = useStore(state => state.closeFaces);

  const near = group.faces
    .map((face, position) => ({face, position}))
    .filter(({position}) => Math.abs(position - index) <= FACE_PRELOAD);
  const results = useQueries({
    queries: near.map(({face}) => ({
      queryKey: qk.facePhoto(face.path),
      queryFn: () => getPhoto(face.path).catch(() => facePlaceholder(face)),
      staleTime: 60_000,
    })),
  });

  const loaded = new Map(near.map(({position}, order) => [position, results[order]?.data]));
  const list = group.faces.map((face, position) =>
    loaded.get(position)
    ?? queryClient.getQueryData<PhotoCard>(qk.facePhoto(face.path))
    ?? facePlaceholder(face));

  return (
    <ViewerDialog
      list={list}
      index={Math.min(index, list.length - 1)}
      open={list.length > 0}
      faces={group}
      // Под просмотром лиц открыта карточка группы: шаг назад закрыл бы её.
      closeThroughHistory={false}
      onGo={next => setFaceIndex((next + list.length) % list.length)}
      onClose={closeFaces}
    />
  );
}

interface ViewerDialogProps {
  list: PhotoCard[];
  index: number;
  open: boolean;
  /** Просмотр кадров группы — появляется кнопка «сделать аватаркой». */
  faces?: GroupDetail;
  closeThroughHistory: boolean;
  onGo(index: number): void;
  onClose(): void;
}

function ViewerDialog({list, index, open, faces, closeThroughHistory, onGo, onClose}: ViewerDialogProps) {
  const adultMode = useStore(state => state.prefs.adultMode);
  const canEdit = useStore(state => state.session.canEdit);
  const view = useStore(state => state.view);
  const hiddenAlbum = useStore(state => state.filters.hidden);
  const info = useStore(state => state.viewer.info);
  const chrome = useStore(state => state.viewer.chrome);
  const toggleInfo = useStore(state => state.toggleViewerInfo);
  const toggleChrome = useStore(state => state.toggleViewerChrome);
  const openProcess = useStore(state => state.openProcess);
  const toast = useStore(state => state.toast);
  const actions = usePhotoActions();
  const video = useRef<HTMLVideoElement>(null);
  const swipe = useRef<{x: number; y: number} | null>(null);

  const photo = open ? list[index] : undefined;
  const many = list.length > 1;
  const movie = photo?.kind === 'video';

  // Открыли — снова с обвязкой и без шторки. showModal() не везде запирает
  // прокрутку страницы: колесо над видео иногда листало галерею сзади.
  useEffect(() => {
    if (!open) return;
    toggleChrome(true);
    toggleInfo(false);
    document.body.classList.add('lightbox-open');
    return () => document.body.classList.remove('lightbox-open');
  }, [open, toggleChrome, toggleInfo]);

  const filename = photo?.filename;
  useEffect(() => {
    if (!filename) return;
    document.title = `${filename} · HomeCloud`;
    return () => {
      document.title = faces
        ? `${faces.title} · HomeCloud`
        : `${VIEW_TITLES[useStore.getState().view]} · HomeCloud`;
    };
  }, [filename, faces]);

  const go = useCallback((step: number) => onGo(index + step), [onGo, index]);
  const arrows = useMemo(() => ({ArrowLeft: () => go(-1), ArrowRight: () => go(1)}), [go]);
  useKeyboardShortcuts(arrows, open && many);

  const seek = useCallback((seconds: number | null | undefined) => {
    const player = video.current;
    if (!player || seconds == null) return;
    player.currentTime = Number(seconds) || 0;
    player.play().catch(() => {});
  }, []);

  // Оригиналы лежат только в домашней сети: бэкенд на час заливает копию на
  // временный хостинг, и по прямой ссылке открывается поиск по картинке.
  const search = useMutation({
    mutationFn: uploadForSearch,
    onMutate: () => toast('Готовлю снимок для поиска…'),
    onSuccess: data => {
      window.open(`https://yandex.ru/images/search?rpt=imageview&url=${encodeURIComponent(data.url)}`,
        '_blank', 'noopener');
      toast('Открыл поиск в Яндекс.Картинках — временная ссылка на снимок исчезнет примерно через час');
    },
  });

  const hideAdult = adultMode === 'hide';
  const liveGroup = useQuery({
    queryKey: qk.group(faces?.key ?? '', hideAdult),
    queryFn: () => getGroup(faces!.key, hideAdult),
    enabled: Boolean(faces),
  }).data ?? faces;
  const face = faces?.faces[index];
  // Аватарку меняют только из первой вкладки «Люди».
  const avatarVisible = Boolean(face && canEdit && view === 'people');
  const pinned = Boolean(face && liveGroup && face.id === liveGroup.avatar_face && liveGroup.avatar_pinned);
  const avatar = useMutation({
    mutationFn: (unpin: boolean) => (unpin
      ? clearAvatar({key: faces!.key})
      : setAvatar({key: faces!.key, face_id: face!.id})),
    onSuccess: (_data, unpin) => {
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: ['group']});
      toast(unpin ? 'Аватарка снова по умолчанию' : 'Аватарка обновлена');
    },
  });

  const imageUrl = photo ? photoMediaUrl(photo, adultMode, viewerSize()) : '';
  const avatarLabel = pinned ? 'Вернуть аватарку по умолчанию' : 'Сделать аватаркой';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeThroughHistory={closeThroughHistory}
      className={['viewer', chrome ? '' : 'bare', info ? 'with-info' : ''].filter(Boolean).join(' ')}
    >
      {photo && (
        <>
          <div
            className="viewer-stage"
            onClick={event => {
              const target = event.target as HTMLElement;
              // У проигрывателя свои кнопки: по нему не прячем обвязку и не закрываем.
              if (target.closest('.viewer-nav') || target.tagName === 'VIDEO') return;
              // Кадр прячет обвязку, поля вокруг закрывают — как в галерее телефона.
              if (target.tagName === 'IMG') toggleChrome();
              else onClose();
            }}
            onWheel={event => {
              // Прокрутка вверх над кадром — жест «покажи подробности».
              if (event.deltaY < 0 && !info) toggleInfo(true);
            }}
            onPointerDown={event => {
              swipe.current = event.pointerType === 'touch' ? {x: event.clientX, y: event.clientY} : null;
            }}
            onPointerUp={event => {
              const start = swipe.current;
              swipe.current = null;
              if (!start) return;
              const dx = event.clientX - start.x;
              const dy = event.clientY - start.y;
              if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
              go(dx < 0 ? 1 : -1);
            }}
          >
            {movie
              ? <video key={photo.path} ref={video} controls preload="metadata" playsInline poster={imageUrl} src={photo.video} />
              : <img src={imageUrl} alt={photo.caption_short || photo.caption || photo.filename} />}
            {many && (
              <>
                <button className="viewer-nav prev" type="button" aria-label="Предыдущая" onClick={() => go(-1)}>
                  <Icon name="chevronLeft" />
                </button>
                <button className="viewer-nav next" type="button" aria-label="Следующая" onClick={() => go(1)}>
                  <Icon name="chevronRight" />
                </button>
              </>
            )}
          </div>

          <header className="viewer-bar top">
            <button className="viewer-icon" type="button" aria-label="Закрыть" onClick={onClose}>
              <Icon name="close" />
            </button>
            <div className="viewer-title">
              <strong>{photoDate(photo.taken) || photo.filename}</strong>
              <span>
                {[
                  photo.filename,
                  movie && photo.duration ? `видео ${timecode(photo.duration)}` : '',
                  `${index + 1} из ${formatNumber(list.length)}`,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div className="viewer-tools">
              <button className="viewer-icon" type="button" aria-label="Сведения" aria-pressed={info}
                onClick={() => toggleInfo()}>
                <Icon name="info" />
              </button>
              {/* У ролика «оригинал» — сам файл, а не его обложка. */}
              <a className="viewer-icon" href={movie ? photo.video : photo.preview} target="_blank" rel="noopener"
                aria-label="Открыть оригинал">
                <Icon name="openExternal" />
              </a>
              <button
                className="viewer-icon"
                type="button"
                title="Искать это изображение в Яндекс.Картинках — снимок на час уедет на анонимный временный хостинг"
                aria-label="Искать это изображение в интернете"
                disabled={search.isPending}
                onClick={() => search.mutate(photo.path)}
              >
                <Icon name="searchImage" />
              </button>
              {avatarVisible && (
                <button className="viewer-icon avatar-action" type="button" aria-pressed={pinned}
                  aria-label={avatarLabel} title={avatarLabel} disabled={avatar.isPending}
                  onClick={() => avatar.mutate(pinned)}>
                  <Icon name="star" />
                </button>
              )}
              {canEdit && (
                <button className="viewer-icon" type="button" aria-label="Обработать" onClick={() => openProcess([photo.path])}>
                  <Icon name="process" />
                </button>
              )}
              <button
                className="viewer-icon"
                type="button"
                aria-label={hiddenAlbum ? 'Вернуть из скрытого' : 'Скрыть в личный альбом'}
                onClick={() => (hiddenAlbum
                  ? actions.reveal([photo.path], onClose)
                  : actions.hide([photo.path], onClose))}
              >
                <Icon name="hide" />
              </button>
              {canEdit && (
                <button className="viewer-icon danger" type="button" aria-label="Удалить"
                  onClick={() => actions.remove([photo.path], onClose)}>
                  <Icon name="trash" />
                </button>
              )}
            </div>
          </header>

          {many && (
            <footer className="viewer-bar bottom">
              <ViewerStrip list={list} index={index} adultMode={adultMode} onGo={onGo} />
            </footer>
          )}

          {info && (
            <aside className="viewer-sheet">
              <InfoPanel photo={photo} onClose={onClose} onSeek={seek} />
            </aside>
          )}
        </>
      )}
    </Dialog>
  );
}

interface ViewerStripProps {
  list: PhotoCard[];
  index: number;
  adultMode: AdultMode;
  onGo(index: number): void;
}

/** Лента кадров: тянется мышью, колесо листает её вбок. */
function ViewerStrip({list, index, adultMode, onGo}: ViewerStripProps) {
  const strip = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement>(null);
  useDragScroll(strip);

  useEffect(() => {
    active.current?.scrollIntoView({block: 'nearest', inline: 'center', behavior: 'instant'});
  }, [index]);

  const from = Math.max(0, index - STRIP_RADIUS);
  const to = Math.min(list.length, index + STRIP_RADIUS + 1);
  const size = Math.round(120 * density());

  return (
    <div ref={strip} className="viewer-strip">
      {list.slice(from, to).map((item, offset) => {
        const position = from + offset;
        return (
          <button
            key={`${item.path}-${position}`}
            ref={position === index ? active : undefined}
            type="button"
            className={`strip-item${position === index ? ' active' : ''}`}
            aria-label={item.filename}
            onClick={() => onGo(position)}
          >
            <img src={photoMediaUrl(item, adultMode, size)} alt="" loading="lazy" decoding="async" />
          </button>
        );
      })}
    </div>
  );
}
