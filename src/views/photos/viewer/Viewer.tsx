import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent} from 'react';
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
import {
  clampTransform,
  isCurrentMediaEvent,
  panTransform,
  resetTransform,
  shouldSwipe,
  zoomTransform,
  type MediaTransform,
  type Point,
} from './mediaGestures';

const STRIP_RADIUS = 25;
const PRELOAD_EDGE = 3;
const FACE_PRELOAD = 2;
const AUTO_HIDE_MS = 3000;
const SEARCH_FRAME_LIMIT = 700 * 1024;
const SEARCH_FRAME_SIDE = 1600;

const facePlaceholder = (face: GroupFace): PhotoCard => ({
  path: face.path, filename: face.filename, folder: '',
  preview: `${face.original}?face=1`,
  video: face.kind === 'video' ? face.original : '', kind: face.kind, duration: 0, taken: null,
  caption: '', caption_short: '', caption_tags: [], ocr_text: '', adult_description: '',
  adult_regions: [], people: [], face_count: 0, faces: [], router_labels: [], albums: [],
  speech_text: '', hidden_owner: '',
});

export function Viewer() {
  const faceGroup = useStore(state => state.viewer.faceGroup);
  return faceGroup ? <FaceViewer group={faceGroup} /> : <GalleryViewer />;
}

function GalleryViewer() {
  const routePhoto = useStore(state => state.routePhoto);
  const setRoutePhoto = useStore(state => state.setRoutePhoto);
  const {photos, isPending, hasNextPage, isFetchingNextPage, fetchNextPage} = useGallery();

  const position = photos.findIndex(photo => photo.path === routePhoto);
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
  faces?: GroupDetail;
  closeThroughHistory: boolean;
  onGo(index: number): void;
  onClose(): void;
}

type MediaStatus = 'loading' | 'ready' | 'error';

interface PlayerState {
  playing: boolean;
  duration: number;
  current: number;
  volume: number;
  muted: boolean;
  buffering: boolean;
  seeking: boolean;
}

interface SearchRequest {
  path: string;
  frame_jpeg?: string;
  tab: Window | null;
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
  const stage = useRef<HTMLDivElement>(null);
  const mediaToken = useRef('');
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef({
    moved: false,
    pinching: false,
    pinchDistance: 0,
    pinchScale: 1,
  } as {start?: Point; last?: Point; moved: boolean; pinching: boolean; pinchDistance: number; pinchScale: number});
  const ignoreClick = useRef(false);

  const [mediaStatus, setMediaStatus] = useState<MediaStatus>('loading');
  const [retry, setRetry] = useState(0);
  const [transform, setTransform] = useState<MediaTransform>(() => resetTransform());
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsHeld, setControlsHeld] = useState(false);
  const [player, setPlayer] = useState<PlayerState>({
    playing: false, duration: 0, current: 0, volume: 1, muted: false, buffering: false, seeking: false,
  });

  const photo = open ? list[index] : undefined;
  const many = list.length > 1;
  const movie = photo?.kind === 'video';
  const imageUrl = photo ? photoMediaUrl(photo, adultMode, viewerSize()) : '';
  const mediaUrl = movie ? photo?.video ?? '' : imageUrl;
  const src = retry ? withRetry(mediaUrl, retry) : mediaUrl;
  const mediaKey = photo ? `${photo.path}|${movie ? 'video' : 'photo'}|${mediaUrl}|${retry}` : '';
  const readyForVideoSearch = movie && mediaStatus === 'ready' && !player.seeking && Boolean(video.current?.videoWidth);

  useEffect(() => {
    if (!open) return;
    toggleChrome(true);
    toggleInfo(false);
    document.body.classList.add('lightbox-open');
    return () => document.body.classList.remove('lightbox-open');
  }, [open, toggleChrome, toggleInfo]);

  useEffect(() => {
    mediaToken.current = mediaKey;
    if (!mediaKey) return;
    setMediaStatus('loading');
    setTransform(resetTransform());
    setMenuOpen(false);
    pointers.current.clear();
    video.current?.pause();
    setPlayer(state => ({...state, playing: false, current: 0, duration: photo?.duration ?? 0, buffering: false, seeking: false}));
  }, [mediaKey, photo?.duration]);

  useEffect(() => {
    const resize = () => setTransform(current => clampTransform(current, stageBounds(stage.current)));
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, []);

  useEffect(() => {
    if (!open || !movie || !player.playing || !chrome || info || menuOpen || controlsHeld) return;
    const timer = window.setTimeout(() => toggleChrome(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open, movie, player.playing, chrome, info, menuOpen, controlsHeld, toggleChrome]);

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
  const showChrome = useCallback(() => {
    if (!chrome) toggleChrome(true);
  }, [chrome, toggleChrome]);

  const seekBy = useCallback((delta: number) => {
    const node = video.current;
    if (!node) return;
    node.currentTime = Math.max(0, Math.min(node.duration || 0, node.currentTime + delta));
  }, []);

  const togglePlay = useCallback(() => {
    const node = video.current;
    if (!node) return;
    if (node.paused) node.play().catch(() => {});
    else node.pause();
  }, []);

  const toggleMuted = useCallback(() => {
    const node = video.current;
    if (!node) return;
    node.muted = !node.muted;
    setPlayer(state => ({...state, muted: node.muted}));
  }, []);

  const fullscreen = useCallback(() => {
    const node = stage.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen?.();
  }, []);

  const shortcuts = useMemo(() => ({
    ArrowLeft: (event: KeyboardEvent) => {
      event.preventDefault();
      if (movie) seekBy(-5);
      else go(-1);
    },
    ArrowRight: (event: KeyboardEvent) => {
      event.preventDefault();
      if (movie) seekBy(5);
      else go(1);
    },
    'shift+ArrowLeft': (event: KeyboardEvent) => {
      event.preventDefault();
      go(-1);
    },
    'shift+ArrowRight': (event: KeyboardEvent) => {
      event.preventDefault();
      go(1);
    },
    ' ': (event: KeyboardEvent) => {
      if (!movie) return;
      event.preventDefault();
      togglePlay();
    },
    m: (event: KeyboardEvent) => {
      if (!movie) return;
      event.preventDefault();
      toggleMuted();
    },
    f: (event: KeyboardEvent) => {
      if (!movie) return;
      event.preventDefault();
      fullscreen();
    },
  }), [movie, go, seekBy, togglePlay, toggleMuted, fullscreen]);
  useKeyboardShortcuts(shortcuts, open && (many || Boolean(movie)));

  const seek = useCallback((seconds: number | null | undefined) => {
    const node = video.current;
    if (!node || seconds == null) return;
    node.currentTime = Number(seconds) || 0;
    node.play().catch(() => {});
  }, []);

  const search = useMutation({
    mutationFn: ({path, frame_jpeg}: SearchRequest) => uploadForSearch(frame_jpeg ? {path, frame_jpeg} : path),
    onMutate: () => toast('Готовлю снимок для поиска…'),
    onSuccess: (data, variables) => {
      const url = `https://yandex.ru/images/search?rpt=imageview&url=${encodeURIComponent(data.url)}`;
      if (variables.tab && !variables.tab.closed) variables.tab.location.href = url;
      else window.open(url, '_blank', 'noopener');
      toast('Открыл поиск в Яндекс.Картинках — временная ссылка на снимок исчезнет примерно через час');
    },
    onError: (error, variables) => {
      variables.tab?.close();
      toast(error instanceof Error ? error.message : 'Не удалось подготовить снимок для поиска');
    },
  });

  const runSearch = useCallback(async () => {
    if (!photo || search.isPending) return;
    const tab = window.open('', '_blank');
    if (tab) {
      tab.opener = null;
      tab.document.title = 'Яндекс.Картинки';
      tab.document.body.textContent = 'Готовлю кадр для поиска...';
    }
    try {
      const frame_jpeg = movie ? await captureVideoFrame(video.current) : undefined;
      search.mutate({path: photo.path, frame_jpeg, tab});
    } catch (error) {
      tab?.close();
      toast(error instanceof Error ? error.message : 'Не удалось снять текущий кадр');
    }
  }, [photo, movie, search, toast]);

  const hideAdult = adultMode === 'hide';
  const liveGroup = useQuery({
    queryKey: qk.group(faces?.key ?? '', hideAdult),
    queryFn: () => getGroup(faces!.key, hideAdult),
    enabled: Boolean(faces),
  }).data ?? faces;
  const face = faces?.faces[index];
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

  const avatarLabel = pinned ? 'Вернуть аватарку по умолчанию' : 'Сделать аватаркой';
  const chromeHidden = !chrome && !menuOpen;

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    showChrome();
    if (isUiTarget(event.target)) return;
    pointers.current.set(event.pointerId, point(event));
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.current.size === 1) {
      gesture.current = {start: point(event), last: point(event), moved: false, pinching: false, pinchDistance: 0, pinchScale: transform.scale};
    } else if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      gesture.current = {...gesture.current, pinching: true, pinchDistance: distance(first, second), pinchScale: transform.scale};
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    showChrome();
    const nextPoint = point(event);
    pointers.current.set(event.pointerId, nextPoint);
    if (pointers.current.size >= 2 && gesture.current.pinching) {
      const [first, second] = [...pointers.current.values()];
      const factor = distance(first, second) / Math.max(gesture.current.pinchDistance, 1);
      const rect = stage.current?.getBoundingClientRect();
      const midpoint = {x: (first.x + second.x) / 2 - (rect?.left ?? 0), y: (first.y + second.y) / 2 - (rect?.top ?? 0)};
      setTransform(current => zoomTransform({...current, scale: gesture.current.pinchScale}, gesture.current.pinchScale * factor, midpoint, stageBounds(stage.current)));
      gesture.current.moved = true;
      ignoreClick.current = true;
      event.preventDefault();
      return;
    }
    const last = gesture.current.last;
    const start = gesture.current.start;
    if (!last || !start) return;
    const dx = nextPoint.x - last.x;
    const dy = nextPoint.y - last.y;
    const totalX = nextPoint.x - start.x;
    const totalY = nextPoint.y - start.y;
    if (Math.hypot(totalX, totalY) > 6) {
      gesture.current.moved = true;
      ignoreClick.current = true;
    }
    if (transform.scale > 1.02) {
      setTransform(current => panTransform(current, {x: dx, y: dy}, stageBounds(stage.current)));
      event.preventDefault();
    }
    gesture.current.last = nextPoint;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = gesture.current.start;
    const end = point(event);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0 && start && !gesture.current.pinching && transform.scale <= 1.02) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (shouldSwipe(dx, dy, transform.scale)) go(dx < 0 ? 1 : -1);
    }
    if (pointers.current.size < 2) gesture.current.pinching = false;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (!isMediaTarget(event.target)) return;
    event.preventDefault();
    showChrome();
    const rect = stage.current?.getBoundingClientRect();
    const origin = {x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0)};
    const factor = event.deltaY < 0 ? 1.14 : 0.88;
    setTransform(current => zoomTransform(current, current.scale * factor, origin, stageBounds(stage.current)));
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!isMediaTarget(event.target)) return;
    event.preventDefault();
    const rect = stage.current?.getBoundingClientRect();
    const origin = {x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0)};
    setTransform(current => current.scale > 1.02
      ? resetTransform()
      : zoomTransform(current, 2, origin, stageBounds(stage.current)));
  };

  const markReady = (token: string) => {
    if (isCurrentMediaEvent(token, mediaToken.current)) setMediaStatus('ready');
  };
  const markError = (token: string) => {
    if (isCurrentMediaEvent(token, mediaToken.current)) setMediaStatus('error');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeThroughHistory={closeThroughHistory}
      className={[
        'viewer',
        chromeHidden ? 'bare' : '',
        info ? 'with-info' : '',
        movie ? 'is-video' : '',
        transform.scale > 1.02 ? 'is-zoomed' : '',
      ].filter(Boolean).join(' ')}
    >
      {photo && (
        <>
          <div
            ref={stage}
            className="viewer-stage"
            onClick={event => {
              if (ignoreClick.current) {
                ignoreClick.current = false;
                return;
              }
              if (isUiTarget(event.target)) return;
              if (isMediaTarget(event.target)) toggleChrome();
              else onClose();
            }}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={event => {
              pointers.current.delete(event.pointerId);
              gesture.current.pinching = false;
            }}
            onMouseMove={showChrome}
          >
            <div className="viewer-media-shell">
              {mediaStatus === 'loading' && <div className="viewer-loader" aria-label="Загрузка" />}
              {mediaStatus === 'error' && (
                <div className="viewer-error">
                  <span>Не удалось загрузить файл</span>
                  <button type="button" onClick={() => setRetry(value => value + 1)}>Повторить</button>
                </div>
              )}
              {movie
                ? (
                    <video
                      key={mediaKey}
                      ref={video}
                      preload="metadata"
                      playsInline
                      poster={imageUrl}
                      src={src}
                      style={mediaStyle(transform)}
                      onLoadedMetadata={event => {
                        markReady(mediaKey);
                        setPlayer(state => ({
                          ...state,
                          duration: event.currentTarget.duration || photo.duration || 0,
                          volume: event.currentTarget.volume,
                          muted: event.currentTarget.muted,
                        }));
                      }}
                      onCanPlay={() => markReady(mediaKey)}
                      onError={() => markError(mediaKey)}
                      onPlay={() => setPlayer(state => ({...state, playing: true, buffering: false}))}
                      onPause={() => setPlayer(state => ({...state, playing: false}))}
                      onWaiting={() => setPlayer(state => ({...state, buffering: true}))}
                      onPlaying={() => setPlayer(state => ({...state, buffering: false}))}
                      onSeeking={() => setPlayer(state => ({...state, seeking: true}))}
                      onSeeked={event => setPlayer(state => ({...state, seeking: false, current: event.currentTarget.currentTime || 0}))}
                      onTimeUpdate={event => setPlayer(state => ({...state, current: event.currentTarget.currentTime || 0}))}
                      onVolumeChange={event => setPlayer(state => ({
                        ...state, volume: event.currentTarget.volume, muted: event.currentTarget.muted,
                      }))}
                    />
                  )
                : (
                    <img
                      key={mediaKey}
                      src={src}
                      alt={photo.caption_short || photo.caption || photo.filename}
                      style={mediaStyle(transform)}
                      onLoad={() => markReady(mediaKey)}
                      onError={() => markError(mediaKey)}
                    />
                  )}
              {movie && (player.buffering || mediaStatus === 'loading') && <div className="viewer-buffering" />}
            </div>

            {many && transform.scale <= 1.02 && (
              <>
                <button className="viewer-nav prev viewer-ui" type="button" aria-label="Предыдущая" onClick={() => go(-1)}>
                  <Icon name="chevronLeft" />
                </button>
                <button className="viewer-nav next viewer-ui" type="button" aria-label="Следующая" onClick={() => go(1)}>
                  <Icon name="chevronRight" />
                </button>
              </>
            )}
          </div>

          <header className="viewer-bar top viewer-ui">
            <button className="viewer-icon" type="button" aria-label="Закрыть" onClick={onClose}>
              <Icon name="close" />
            </button>
            <div className="viewer-title">
              <strong>{photoDate(photo.taken) || photo.filename}</strong>
              <span>
                {[
                  photo.filename,
                  movie && (player.duration || photo.duration) ? `видео ${timecode(player.duration || photo.duration)}` : '',
                  `${index + 1} из ${formatNumber(list.length)}`,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div className="viewer-tools">
              <div className="viewer-menu-wrap">
                <button className="viewer-icon" type="button" aria-label="Действия" aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(opened => !opened)}>
                  <Icon name="more" />
                </button>
                {menuOpen && (
                  <div className="viewer-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); toggleInfo(); }}>
                      <Icon name="info" />Сведения
                    </button>
                    <a role="menuitem" href={movie ? photo.video : photo.preview} target="_blank" rel="noopener">
                      <Icon name="openExternal" />Оригинал
                    </a>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={search.isPending || (movie && !readyForVideoSearch)}
                      title={movie && !readyForVideoSearch ? 'Дождитесь готовности текущего кадра' : undefined}
                      onClick={() => {
                        setMenuOpen(false);
                        void runSearch();
                      }}
                    >
                      <Icon name="searchImage" />Поиск в Яндексе
                    </button>
                    {movie && [0.5, 1, 1.25, 1.5, 2].map(speed => (
                      <button key={speed} type="button" role="menuitem" aria-pressed={video.current?.playbackRate === speed}
                        onClick={() => {
                          if (video.current) video.current.playbackRate = speed;
                          setMenuOpen(false);
                        }}>
                        <Icon name="play" />{speed}×
                      </button>
                    ))}
                    {avatarVisible && (
                      <button type="button" role="menuitem" aria-pressed={pinned} disabled={avatar.isPending}
                        onClick={() => { setMenuOpen(false); avatar.mutate(pinned); }}>
                        <Icon name="star" />{avatarLabel}
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openProcess([photo.path]); }}>
                        <Icon name="process" />Обработать
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        if (hiddenAlbum) actions.reveal([photo.path], onClose);
                        else actions.hide([photo.path], onClose);
                      }}
                    >
                      <Icon name="hide" />{hiddenAlbum ? 'Вернуть из скрытого' : 'Скрыть'}
                    </button>
                    {canEdit && (
                      <button className="danger" type="button" role="menuitem"
                        onClick={() => { setMenuOpen(false); actions.remove([photo.path], onClose); }}>
                        <Icon name="trash" />Удалить
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          {movie && (
            <VideoControls
              player={player}
              duration={player.duration || photo.duration || 0}
              onHold={setControlsHeld}
              onPlay={togglePlay}
              onMute={toggleMuted}
              onFullscreen={fullscreen}
              onSeek={value => {
                const node = video.current;
                if (!node) return;
                node.currentTime = value;
                setPlayer(state => ({...state, current: value}));
              }}
              onVolume={value => {
                const node = video.current;
                if (!node) return;
                node.volume = value;
                node.muted = value === 0;
              }}
            />
          )}

          {many && (
            <footer className="viewer-bar bottom viewer-ui">
              <ViewerStrip list={list} index={index} adultMode={adultMode} onGo={onGo} />
            </footer>
          )}

          {info && (
            <aside className="viewer-sheet viewer-ui">
              <InfoPanel photo={photo} onClose={onClose} onSeek={seek} />
            </aside>
          )}
        </>
      )}
    </Dialog>
  );
}

interface VideoControlsProps {
  player: PlayerState;
  duration: number;
  onHold(held: boolean): void;
  onPlay(): void;
  onMute(): void;
  onFullscreen(): void;
  onSeek(value: number): void;
  onVolume(value: number): void;
}

function VideoControls({player, duration, onHold, onPlay, onMute, onFullscreen, onSeek, onVolume}: VideoControlsProps) {
  return (
    <div className="viewer-player viewer-ui" onPointerDown={() => onHold(true)} onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)} onFocus={() => onHold(true)} onBlur={() => onHold(false)}>
      <input
        className="viewer-seek"
        type="range"
        min="0"
        max={Math.max(0, duration)}
        step="0.1"
        value={Math.min(player.current, duration || 0)}
        onChange={event => onSeek(Number(event.currentTarget.value))}
        aria-label="Перемотка"
      />
      <div className="viewer-player-row">
        <button className="viewer-icon" type="button" aria-label={player.playing ? 'Пауза' : 'Воспроизвести'} onClick={onPlay}>
          <Icon name={player.playing ? 'pause' : 'play'} />
        </button>
        <span className="viewer-time">{timecode(player.current)} / {timecode(duration || 0)}</span>
        <button className="viewer-icon" type="button" aria-label={player.muted ? 'Включить звук' : 'Выключить звук'} onClick={onMute}>
          <Icon name={player.muted || player.volume === 0 ? 'volumeOff' : 'volume'} />
        </button>
        <input className="viewer-volume" type="range" min="0" max="1" step="0.02"
          value={player.muted ? 0 : player.volume} onChange={event => onVolume(Number(event.currentTarget.value))}
          aria-label="Громкость" />
        <button className="viewer-icon" type="button" aria-label="Полный экран" onClick={onFullscreen}>
          <Icon name="fullscreen" />
        </button>
      </div>
    </div>
  );
}

interface ViewerStripProps {
  list: PhotoCard[];
  index: number;
  adultMode: AdultMode;
  onGo(index: number): void;
}

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

function mediaStyle(transform: MediaTransform) {
  return {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
  };
}

function stageBounds(node: HTMLElement | null) {
  const rect = node?.getBoundingClientRect();
  return {width: rect?.width ?? 0, height: rect?.height ?? 0};
}

function point(event: ReactPointerEvent<HTMLElement>): Point {
  return {x: event.clientX, y: event.clientY};
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isUiTarget(target: EventTarget): boolean {
  return Boolean((target as HTMLElement).closest?.('.viewer-ui, button, a, input, .viewer-sheet'));
}

function isMediaTarget(target: EventTarget): boolean {
  return Boolean((target as HTMLElement).closest?.('.viewer-media-shell'));
}

function withRetry(url: string, retry: number): string {
  if (!url || url.startsWith('data:')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}retry=${retry}`;
}

async function captureVideoFrame(node: HTMLVideoElement | null): Promise<string> {
  if (!node || node.videoWidth <= 0 || node.videoHeight <= 0 || node.seeking) {
    throw new Error('Текущий кадр видео ещё не готов');
  }
  node.pause();
  const scale = Math.min(1, SEARCH_FRAME_SIDE / Math.max(node.videoWidth, node.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(node.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(node.videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось подготовить кадр видео');
  context.drawImage(node, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.5, 0.42, 0.34]) {
    const blob = await canvasBlob(canvas, quality);
    if (blob.size <= SEARCH_FRAME_LIMIT) return blobToBase64(blob);
  }
  throw new Error('Кадр видео слишком большой');
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось снять кадр видео')),
      'image/jpeg', quality);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
