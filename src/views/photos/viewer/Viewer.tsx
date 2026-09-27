import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent} from 'react';
import {createPortal} from 'react-dom';
import {useMutation, useQueries, useQuery} from '@tanstack/react-query';
import './Viewer.scss';
import {VIEW_TITLES} from '../../../app/routes';
import {useDragScroll} from '../../../hooks/useDragScroll';
import {useKeyboardShortcuts} from '../../../hooks/useKeyboardShortcuts';
import {useKin} from '../../../hooks/useKin';
import {formatNumber, photoDate, timecode} from '../../../lib/format';
import {getGroup, getPhoto} from '../../../services/endpoints/catalog';
import {clearAvatar, setAvatar} from '../../../services/endpoints/people';
import {uploadForSearch} from '../../../services/endpoints/photos';
import {density, photoMediaUrl, viewerSize} from '../../../services/media';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import type {VideoFit} from '../../../store/slices/prefs';
import type {GroupDetail, GroupFace, KinPerson, PhotoCard, PhotoFace} from '../../../types/api';
import type {AdultMode} from '../../../types/domain';
import {Dialog} from '../../../ui/Dialog/Dialog';
import {Avatar} from '../../../ui/Avatar/Avatar';
import {Icon} from '../../../ui/Icon/Icon';
import {videoStart} from '../../people/stacks';
import {bigfamPersonUrl} from '../gallery';
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
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const FITS: Array<{fit: VideoFit; label: string}> = [
  {fit: 'contain', label: 'Вписать'},
  {fit: 'cover', label: 'Заполнить'},
  {fit: 'fill', label: 'Растянуть'},
];
/** Ширина превью кадра над полосой перемотки. */
const PREVIEW_WIDTH = 176;
const SEARCH_FRAME_LIMIT = 700 * 1024;
const SEARCH_FRAME_SIDE = 1600;

const facePlaceholder = (face: GroupFace): PhotoCard => ({
  path: face.path, filename: face.filename, folder: '',
  preview: `${face.original}?face=1`,
  video: face.kind === 'video' ? face.original : '', kind: face.kind, duration: 0, taken: null,
  width: face.width ?? 0, height: face.height ?? 0,
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
  // Вне галереи её страницы не грузятся: снимок, открытый с другого экрана
  // (например, из дубликатов), показываем один.
  const inGallery = useStore(state => state.view === 'photos');
  const sequence = useStore(state => state.viewer.sequence);
  const gallery = useGallery();
  // Снимок из ленты другого экрана (подборки) листается внутри неё.
  const fromSequence = !inGallery && Boolean(sequence?.some(photo => photo.path === routePhoto));
  const photos = fromSequence ? sequence! : gallery.photos;
  const {isPending} = gallery;
  const hasNextPage = !fromSequence && gallery.hasNextPage;
  const {isFetchingNextPage, fetchNextPage} = gallery;

  const position = photos.findIndex(photo => photo.path === routePhoto);
  const single = useQuery({
    queryKey: qk.photo(routePhoto),
    queryFn: () => getPhoto(routePhoto),
    // Страница галереи содержит размеры рабочей копии. Открытый снимок всегда
    // уточняем отдельно: рамки лиц заданы в координатах оригинала.
    enabled: Boolean(routePhoto),
  });

  const list = position >= 0
    ? photos.map((photo, photoIndex) => photoIndex === position && single.data ? single.data : photo)
    : single.data ? [...photos, single.data] : photos;
  const index = position >= 0 ? position : single.data ? photos.length : -1;

  useEffect(() => {
    if (routePhoto && position < 0 && single.isError) setRoutePhoto('');
  }, [routePhoto, position, single.isError, setRoutePhoto]);

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
      startAt={videoStart(group.faces[Math.min(index, list.length - 1)])}
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
  /** Ролик открывается не с начала, а с момента, где в кадре это лицо. */
  startAt?: number | null;
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
  /** До какой секунды ролик уже загружен от текущего места. */
  buffered: number;
  rate: number;
}

/** Значок, который на миг вспыхивает в центре кадра, как в YouTube. */
interface Flash {
  id: number;
  icon: 'play' | 'pause' | 'volume' | 'volumeOff';
  label?: string;
}

interface SearchRequest {
  path: string;
  frame_jpeg?: string;
  tab: Window | null;
}

interface ImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

function ViewerDialog({list, index, open, faces, startAt, closeThroughHistory, onGo, onClose}: ViewerDialogProps) {
  const adultMode = useStore(state => state.prefs.adultMode);
  const canEdit = useStore(state => state.session.canEdit);
  const view = useStore(state => state.view);
  const hiddenAlbum = useStore(state => state.filters.hidden);
  const bigfamUrl = useStore(state => state.session.bigfamUrl);
  const info = useStore(state => state.viewer.info);
  const chrome = useStore(state => state.viewer.chrome);
  const toggleInfo = useStore(state => state.toggleViewerInfo);
  const toggleChrome = useStore(state => state.toggleViewerChrome);
  const videoFit = useStore(state => state.prefs.videoFit);
  const setVideoFit = useStore(state => state.setVideoFit);
  const openProcess = useStore(state => state.openProcess);
  const toast = useStore(state => state.toast);
  const actions = usePhotoActions();
  const kin = useKin().data ?? [];

  const video = useRef<HTMLVideoElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const poster = useRef<HTMLImageElement>(null);
  /** Куда перемотать ролик, как только у него появятся метаданные. */
  const pendingStart = useRef<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  /** Всё содержимое окна просмотра: его и разворачиваем на весь экран. */
  const frame = useRef<HTMLDivElement>(null);
  const mediaToken = useRef('');
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef({
    moved: false,
    pinching: false,
    pinchDistance: 0,
    pinchScale: 1,
  } as {start?: Point; last?: Point; moved: boolean; pinching: boolean; pinchDistance: number; pinchScale: number; media?: boolean});

  const [mediaStatus, setMediaStatus] = useState<MediaStatus>('loading');
  const [retry, setRetry] = useState(0);
  const [transform, setTransform] = useState<MediaTransform>(() => resetTransform());
  const [imageBounds, setImageBounds] = useState<ImageBounds | null>(null);
  const [passportFace, setPassportFace] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsHeld, setControlsHeld] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [player, setPlayer] = useState<PlayerState>({
    playing: false, duration: 0, current: 0, volume: 1, muted: false, buffering: false, seeking: false, buffered: 0, rate: 1,
  });

  const photo = open ? list[index] : undefined;
  const many = list.length > 1;
  const movie = photo?.kind === 'video';
  const imageUrl = photo ? photoMediaUrl(photo, adultMode, viewerSize()) : '';
  const mediaUrl = movie ? photo?.video ?? '' : imageUrl;
  const src = retry ? withRetry(mediaUrl, retry) : mediaUrl;
  const mediaKey = photo ? `${photo.path}|${movie ? 'video' : 'photo'}|${mediaUrl}|${retry}` : '';
  const readyForVideoSearch = movie && mediaStatus === 'ready' && !player.seeking && Boolean(video.current?.videoWidth);
  // Превью видно сразу при открытии и остаётся, пока ролик не загрузится и не пойдёт.
  const showVideoPoster = movie && ((!player.playing && player.current < 0.05) || mediaStatus !== 'ready');

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
    setPassportFace(null);
    setMenuOpen(false);
    pointers.current.clear();
    video.current?.pause();
    setPlayer(state => ({...state, playing: false, current: 0, duration: photo?.duration ?? 0, buffering: false, seeking: false, buffered: 0}));
  }, [mediaKey, photo?.duration]);

  const measureImage = useCallback(() => {
    const node = image.current;
    const shell = node?.parentElement;
    if (!node || !shell || !node.naturalWidth || !node.naturalHeight) {
      setImageBounds(null);
      return;
    }
    const mediaRect = node.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    setImageBounds({
      left: mediaRect.left - shellRect.left,
      top: mediaRect.top - shellRect.top,
      width: mediaRect.width,
      height: mediaRect.height,
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight,
    });
  }, []);

  useEffect(() => {
    if (movie || mediaStatus !== 'ready') {
      setImageBounds(null);
      return;
    }
    const frame = requestAnimationFrame(measureImage);
    const observer = new ResizeObserver(measureImage);
    if (image.current) observer.observe(image.current);
    if (image.current?.parentElement) observer.observe(image.current.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [movie, mediaStatus, mediaKey, transform, info, chrome, measureImage]);

  // Лица одного ролика — это один и тот же файл: при переходе между ними
  // видео не перезагружается, и перематывать надо уже загруженное.
  useEffect(() => {
    if (!open || !movie || startAt == null) {
      pendingStart.current = null;
      return;
    }
    const node = video.current;
    if (node && node.readyState >= HTMLMediaElement.HAVE_METADATA) {
      pendingStart.current = null;
      node.currentTime = startAt;
      node.play().catch(() => {});
    } else {
      pendingStart.current = startAt;
    }
  }, [open, movie, startAt, index, mediaKey]);

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

  const flashIcon = useCallback((icon: Flash['icon'], label?: string) => {
    setFlash(current => ({id: (current?.id ?? 0) + 1, icon, label}));
  }, []);

  const seekBy = useCallback((delta: number) => {
    const node = video.current;
    if (!node) return;
    node.currentTime = Math.max(0, Math.min(node.duration || 0, node.currentTime + delta));
  }, []);

  const togglePlay = useCallback((withFlash = false) => {
    const node = video.current;
    if (!node) return;
    if (node.paused) node.play().catch(() => {});
    else node.pause();
    if (withFlash) flashIcon(node.paused ? 'pause' : 'play');
  }, [flashIcon]);

  const toggleMuted = useCallback((withFlash = false) => {
    const node = video.current;
    if (!node) return;
    node.muted = !node.muted;
    setPlayer(state => ({...state, muted: node.muted}));
    if (withFlash) flashIcon(node.muted ? 'volumeOff' : 'volume');
  }, [flashIcon]);

  // В полный экран уходит всё окно просмотра, чтобы панель плеера осталась видна.
  // Сам <dialog> браузеры на весь экран не пускают — разворачиваем обёртку внутри.
  const fullscreen = useCallback(() => {
    const node = frame.current;
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
      togglePlay(true);
    },
    k: (event: KeyboardEvent) => {
      if (!movie) return;
      event.preventDefault();
      togglePlay(true);
    },
    j: (event: KeyboardEvent) => {
      if (!movie) return;
      event.preventDefault();
      seekBy(-10);
      flashIcon('play', '−10 с');
    },
    l: (event: KeyboardEvent) => {
      if (!movie) return;
      event.preventDefault();
      seekBy(10);
      flashIcon('play', '+10 с');
    },
    m: (event: KeyboardEvent) => {
      if (!movie) return;
      event.preventDefault();
      toggleMuted(true);
    },
    f: (event: KeyboardEvent) => {
      if (!movie) return;
      event.preventDefault();
      fullscreen();
    },
  }), [movie, go, seekBy, togglePlay, toggleMuted, fullscreen, flashIcon]);
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
    if (isUiTarget(event.target)) {
      pointers.current.delete(event.pointerId);
      gesture.current = {moved: false, pinching: false, pinchDistance: 0, pinchScale: transform.scale};
      return;
    }
    pointers.current.set(event.pointerId, point(event));
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.current.size === 1) {
      gesture.current = {
        start: point(event), last: point(event), moved: false, pinching: false,
        pinchDistance: 0, pinchScale: transform.scale, media: isMediaElementTarget(event.target),
      };
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
    }
    if (transform.scale > 1.02) {
      setTransform(current => panTransform(current, {x: dx, y: dy}, stageBounds(stage.current)));
      event.preventDefault();
    }
    gesture.current.last = nextPoint;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const start = gesture.current.start;
    const moved = gesture.current.moved;
    const end = point(event);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0 && start && !gesture.current.pinching && transform.scale <= 1.02) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (shouldSwipe(dx, dy, transform.scale)) go(dx < 0 ? 1 : -1);
      else if (Math.abs(dy) >= 60 && Math.abs(dy) > Math.abs(dx)) {
        if (dy > 0) {
          if (info) toggleInfo(false);
          else onClose();
        }
        else toggleInfo(true);
      }
    }
    if (pointers.current.size < 2) gesture.current.pinching = false;
    if (pointers.current.size === 0) {
      gesture.current = {moved: false, pinching: false, pinchDistance: 0, pinchScale: transform.scale};
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (!isMediaElementTarget(event.target)) return;
    event.preventDefault();
    showChrome();
    const rect = stage.current?.getBoundingClientRect();
    const origin = {x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0)};
    const factor = event.deltaY < 0 ? 1.14 : 0.88;
    setTransform(current => zoomTransform(current, current.scale * factor, origin, stageBounds(stage.current)));
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!isMediaElementTarget(event.target)) return;
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
      closeOnBackdrop={false}
      className={[
        'viewer',
        chromeHidden ? 'bare' : '',
        info ? 'with-info' : '',
        movie ? 'is-video' : '',
        transform.scale > 1.02 ? 'is-zoomed' : '',
        movie && videoFit !== 'contain' ? `fit-${videoFit}` : '',
      ].filter(Boolean).join(' ')}
    >
      {photo && (
        <div ref={frame} className="viewer-frame">
          <div
            ref={stage}
            className="viewer-stage"
            onClick={event => {
              if (isUiTarget(event.target)) return;
              // Клик по кадру или превью ролика — пауза и пуск, как в YouTube.
              // Пока ролик грузится, его размеры ещё не известны: клик по окну
              // тогда тоже запускает, а не закрывает просмотр.
              if (movie && (mediaStatus === 'loading' || [video.current, poster.current]
                .some(node => node && insideRect(node.getBoundingClientRect(), event.clientX, event.clientY)))) {
                togglePlay(mediaStatus === 'ready');
                return;
              }
              const insidePhoto = Boolean(imageBounds
                && event.clientX >= imageBounds.left
                && event.clientX <= imageBounds.left + imageBounds.width
                && event.clientY >= imageBounds.top
                && event.clientY <= imageBounds.top + imageBounds.height);
              if (insidePhoto) {
                if (passportFace !== null) setPassportFace(null);
                return;
              }
              onClose();
            }}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={event => {
              pointers.current.delete(event.pointerId);
              if (pointers.current.size === 0) {
                gesture.current = {moved: false, pinching: false, pinchDistance: 0, pinchScale: transform.scale};
              } else {
                gesture.current.pinching = false;
              }
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
                  <>
                    <video
                      key={mediaKey}
                      ref={video}
                      preload="metadata"
                      playsInline
                      poster={imageUrl}
                      src={src}
                      style={mediaStyle(transform)}
                      onLoadedMetadata={event => {
                        const node = event.currentTarget;
                        markReady(mediaKey);
                        // Выбранная скорость переходит на следующий ролик, как в YouTube.
                        node.playbackRate = player.rate;
                        if (pendingStart.current != null) {
                          node.currentTime = Math.min(pendingStart.current, node.duration || pendingStart.current);
                          pendingStart.current = null;
                          node.play().catch(() => {});
                        }
                        setPlayer(state => ({
                          ...state,
                          duration: node.duration || photo.duration || 0,
                          volume: node.volume,
                          muted: node.muted,
                        }));
                      }}
                      onCanPlay={() => markReady(mediaKey)}
                      onError={() => markError(mediaKey)}
                      onPlay={() => setPlayer(state => ({...state, playing: true, buffering: false}))}
                      onPause={() => setPlayer(state => ({...state, playing: false}))}
                      onWaiting={() => setPlayer(state => ({...state, buffering: true}))}
                      onPlaying={() => setPlayer(state => ({...state, buffering: false}))}
                      onSeeking={() => setPlayer(state => ({...state, seeking: true}))}
                      onSeeked={event => {
                        const current = event.currentTarget.currentTime || 0;
                        setPlayer(state => ({...state, seeking: false, current}));
                      }}
                      onTimeUpdate={event => {
                        const current = event.currentTarget.currentTime || 0;
                        const buffered = bufferedEnd(event.currentTarget);
                        setPlayer(state => ({...state, current, buffered}));
                      }}
                      onProgress={event => {
                        const buffered = bufferedEnd(event.currentTarget);
                        setPlayer(state => ({...state, buffered}));
                      }}
                      onRateChange={event => {
                        const rate = event.currentTarget.playbackRate;
                        setPlayer(state => ({...state, rate}));
                      }}
                      onVolumeChange={event => {
                        const node = event.currentTarget;
                        const volume = node.volume;
                        const muted = node.muted;
                        setPlayer(state => ({...state, volume, muted}));
                      }}
                    />
                    {showVideoPoster && (
                      <>
                        <img
                          ref={poster}
                          className="viewer-video-poster"
                          src={imageUrl}
                          fetchPriority="high"
                          alt=""
                          style={mediaStyle(transform)}
                          aria-hidden="true"
                        />
                        {mediaStatus !== 'error' && (
                          <button className="viewer-video-play viewer-ui" type="button" aria-label="Воспроизвести видео"
                            onClick={() => togglePlay()}>
                            <Icon name="play" />
                          </button>
                        )}
                      </>
                    )}
                  </>
                  )
                : (
                    <img
                      key={mediaKey}
                      ref={image}
                      src={src}
                      alt={photo.caption_short || photo.caption || photo.filename}
                      style={mediaStyle(transform)}
                      onLoad={() => {
                        markReady(mediaKey);
                        requestAnimationFrame(measureImage);
                      }}
                      onError={() => markError(mediaKey)}
                    />
                  )}
              {!movie && imageBounds && photo.faces.length > 0 && (
                <PhotoFaces
                  faces={photo.faces}
                  bounds={imageBounds}
                  sourceWidth={photo.width || imageBounds.naturalWidth}
                  sourceHeight={photo.height || imageBounds.naturalHeight}
                  kin={kin}
                  selected={passportFace}
                  onSelect={faceId => setPassportFace(current => current === faceId ? null : faceId)}
                  bigfamUrl={bigfamUrl}
                  photoTaken={photo.taken}
                />
              )}
              {movie && (player.buffering || mediaStatus === 'loading') && <div className="viewer-buffering" />}
              {movie && flash && (
                <div key={flash.id} className="viewer-flash" aria-hidden="true" onAnimationEnd={() => setFlash(null)}>
                  {flash.label ? <span>{flash.label}</span> : <Icon name={flash.icon} />}
                </div>
              )}
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
              docked={!many}
              src={src}
              fit={videoFit}
              onFit={setVideoFit}
              onHold={setControlsHeld}
              onPlay={() => togglePlay()}
              onMute={() => toggleMuted()}
              onFullscreen={fullscreen}
              onSpeed={rate => {
                if (video.current) video.current.playbackRate = rate;
              }}
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
        </div>
      )}
    </Dialog>
  );
}

interface VideoControlsProps {
  player: PlayerState;
  duration: number;
  /** Ленты снимков под плеером нет — панель прижимается к низу окна. */
  docked: boolean;
  /** Адрес ролика — из него берутся кадры для превью над полосой перемотки. */
  src: string;
  fit: VideoFit;
  onFit(fit: VideoFit): void;
  onHold(held: boolean): void;
  onPlay(): void;
  onMute(): void;
  onFullscreen(): void;
  onSeek(value: number): void;
  onVolume(value: number): void;
  onSpeed(rate: number): void;
}

type SettingsPage = 'main' | 'speed' | 'fit';

function VideoControls({
  player, duration, docked, src, fit, onFit, onHold, onPlay, onMute, onFullscreen, onSeek, onVolume, onSpeed,
}: VideoControlsProps) {
  const [settings, setSettings] = useState<SettingsPage | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const settingsWrap = useRef<HTMLDivElement>(null);
  const settingsOpen = settings !== null;

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  // Пока открыты настройки, панель не прячется; клик мимо меню его закрывает.
  useEffect(() => {
    onHold(settingsOpen);
    if (!settingsOpen) return;
    const close = (event: PointerEvent) => {
      if (!settingsWrap.current?.contains(event.target as Node)) setSettings(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [settingsOpen, onHold]);

  const silent = player.muted || player.volume === 0;
  const level = player.muted ? 0 : player.volume;
  const fitLabel = FITS.find(item => item.fit === fit)?.label ?? 'Вписать';
  return (
    <div className={['viewer-player', 'viewer-ui', docked ? 'docked' : ''].filter(Boolean).join(' ')}
      onPointerDown={() => onHold(true)} onPointerUp={() => onHold(settingsOpen)}
      onPointerCancel={() => onHold(settingsOpen)} onFocus={() => onHold(true)} onBlur={() => onHold(settingsOpen)}>
      <SeekBar current={player.current} buffered={player.buffered} duration={duration} src={src} onSeek={onSeek} />
      <div className="viewer-player-row">
        <button className="viewer-ctl" type="button" aria-label={player.playing ? 'Пауза (k)' : 'Смотреть (k)'} onClick={onPlay}>
          <Icon name={player.playing ? 'pause' : 'play'} />
        </button>
        <div className="viewer-volume-wrap">
          <button className="viewer-ctl" type="button" aria-label={silent ? 'Включить звук (m)' : 'Выключить звук (m)'} onClick={onMute}>
            <Icon name={silent ? 'volumeOff' : 'volume'} />
          </button>
          <input className="viewer-volume" type="range" min="0" max="1" step="0.02"
            value={level} onInput={event => onVolume(Number(event.currentTarget.value))}
            style={{'--fill': `${level * 100}%`} as CSSProperties}
            aria-label="Громкость" />
        </div>
        <span className="viewer-time">
          {timecode(player.current)}<i> / </i><span>{timecode(duration || 0)}</span>
        </span>
        <span className="viewer-player-spacer" />
        <div className="viewer-speed-wrap" ref={settingsWrap}>
          <button className="viewer-ctl viewer-speed-button" type="button" aria-label="Настройки"
            aria-expanded={settingsOpen} onClick={() => setSettings(page => page ? null : 'main')}>
            <Icon name="settings" />
            {player.rate !== 1 && <b>{formatRate(player.rate)}</b>}
          </button>
          {settings === 'main' && (
            <div className="viewer-speed-menu" role="menu" aria-label="Настройки">
              <button type="button" role="menuitem" className="viewer-settings-row" onClick={() => setSettings('speed')}>
                <span>Скорость</span><em>{player.rate === 1 ? 'Обычная' : formatRate(player.rate)}</em>
                <Icon name="chevronRight" />
              </button>
              <button type="button" role="menuitem" className="viewer-settings-row" onClick={() => setSettings('fit')}>
                <span>Масштаб</span><em>{fitLabel}</em>
                <Icon name="chevronRight" />
              </button>
            </div>
          )}
          {settings === 'speed' && (
            <div className="viewer-speed-menu" role="menu" aria-label="Скорость">
              <button type="button" className="viewer-speed-title" onClick={() => setSettings('main')}>
                <Icon name="chevronLeft" />Скорость
              </button>
              {SPEEDS.map(rate => (
                <button key={rate} type="button" role="menuitemradio" aria-checked={player.rate === rate}
                  onClick={() => {
                    onSpeed(rate);
                    setSettings(null);
                  }}>
                  <Icon name="check" />{rate === 1 ? 'Обычная' : formatRate(rate)}
                </button>
              ))}
            </div>
          )}
          {settings === 'fit' && (
            <div className="viewer-speed-menu" role="menu" aria-label="Масштаб">
              <button type="button" className="viewer-speed-title" onClick={() => setSettings('main')}>
                <Icon name="chevronLeft" />Масштаб
              </button>
              {FITS.map(item => (
                <button key={item.fit} type="button" role="menuitemradio" aria-checked={fit === item.fit}
                  onClick={() => {
                    onFit(item.fit);
                    setSettings(null);
                  }}>
                  <Icon name="check" />{item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="viewer-ctl" type="button"
          aria-label={isFullscreen ? 'Выйти из полноэкранного режима (f)' : 'Во весь экран (f)'}
          onClick={onFullscreen}>
          <Icon name={isFullscreen ? 'fullscreenExit' : 'fullscreen'} />
        </button>
      </div>
    </div>
  );
}

interface SeekBarProps {
  current: number;
  buffered: number;
  duration: number;
  src: string;
  onSeek(value: number): void;
}

/** Полоса перемотки как в YouTube: тонкая, толще под курсором, с кадром и временем. */
function SeekBar({current, buffered, duration, src, onSeek}: SeekBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const preview = useFramePreview(src, hover == null ? null : hover * duration);

  const ratioAt = (x: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect?.width) return 0;
    return Math.min(1, Math.max(0, (x - rect.left) / rect.width));
  };
  const share = (seconds: number) => `${duration > 0 ? Math.min(100, Math.max(0, seconds / duration * 100)) : 0}%`;
  // Превью не вылезает за края полосы.
  const half = PREVIEW_WIDTH / 2 + 4;
  const tipLeft = hover == null ? undefined : `clamp(${half}px, ${hover * 100}%, calc(100% - ${half}px))`;

  return (
    <div
      ref={bar}
      className={['viewer-seek', dragging ? 'dragging' : ''].filter(Boolean).join(' ')}
      role="slider"
      aria-label="Перемотка"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${timecode(current)} из ${timecode(duration)}`}
      onPointerDown={event => {
        if (!duration) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        const ratio = ratioAt(event.clientX);
        setHover(ratio);
        onSeek(ratio * duration);
      }}
      onPointerMove={event => {
        const ratio = ratioAt(event.clientX);
        setHover(ratio);
        if (dragging) onSeek(ratio * duration);
      }}
      onPointerUp={event => {
        setDragging(false);
        if (event.pointerType !== 'mouse') setHover(null);
      }}
      onPointerCancel={() => {
        setDragging(false);
        setHover(null);
      }}
      onPointerLeave={() => {
        if (!dragging) setHover(null);
      }}
    >
      <div className="viewer-seek-track">
        <div className="viewer-seek-buffered" style={{width: share(buffered)}} />
        {hover != null && <div className="viewer-seek-hover" style={{width: `${hover * 100}%`}} />}
        <div className="viewer-seek-played" style={{width: share(current)}} />
      </div>
      <div className="viewer-seek-thumb" style={{left: share(current)}} />
      {hover != null && duration > 0 && (
        <div className="viewer-seek-tip" style={{left: tipLeft}}>
          <canvas ref={preview.canvas} className={preview.ready ? 'ready' : ''} width={PREVIEW_WIDTH} height={Math.round(PREVIEW_WIDTH * 9 / 16)} />
          <span>{timecode(hover * duration)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Кадр ролика на заданной секунде для превью над полосой перемотки: скрытая
 * копия видео перематывается туда, куда наведён курсор, и рисуется в canvas.
 * Перемотки идут по одной — пока копия ищет кадр, новое время только запоминается.
 */
function useFramePreview(src: string, seconds: number | null) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const probe = useRef<HTMLVideoElement | null>(null);
  const wanted = useRef<number | null>(null);
  const busy = useRef(false);
  const [ready, setReady] = useState(false);

  // force — перерисовать, даже если копия уже стоит на нужном кадре (новый canvas пуст).
  const seekProbe = useCallback((force = false) => {
    const node = probe.current;
    const target = wanted.current;
    if (!node || busy.current || target == null || node.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (!force && Math.abs(node.currentTime - target) < 0.05) return;
    busy.current = true;
    node.currentTime = target;
  }, []);

  useEffect(() => {
    if (!src) return;
    const node = document.createElement('video');
    node.muted = true;
    node.playsInline = true;
    node.preload = 'metadata';
    node.src = src;
    const draw = () => {
      busy.current = false;
      const target = canvas.current;
      if (target && node.videoWidth > 0) {
        target.height = Math.round(PREVIEW_WIDTH * node.videoHeight / node.videoWidth);
        target.getContext('2d')?.drawImage(node, 0, 0, target.width, target.height);
        setReady(true);
      }
      seekProbe();
    };
    node.addEventListener('seeked', draw);
    const start = () => seekProbe(true);
    node.addEventListener('loadedmetadata', start);
    probe.current = node;
    return () => {
      node.removeEventListener('seeked', draw);
      node.removeEventListener('loadedmetadata', start);
      node.removeAttribute('src');
      node.load();
      probe.current = null;
      busy.current = false;
      setReady(false);
    };
  }, [src, seekProbe]);

  useEffect(() => {
    const fresh = wanted.current == null;
    wanted.current = seconds;
    if (seconds == null) setReady(false);
    else seekProbe(fresh);
  }, [seconds, seekProbe]);

  return {canvas, ready};
}


function formatRate(rate: number): string {
  return `${String(rate).replace('.', ',')}×`;
}

/** Конец загруженного куска, в котором стоит воспроизведение. */
function bufferedEnd(node: HTMLVideoElement): number {
  const ranges = node.buffered;
  for (let index = 0; index < ranges.length; index += 1) {
    if (ranges.start(index) <= node.currentTime + 0.5 && node.currentTime <= ranges.end(index)) return ranges.end(index);
  }
  return 0;
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
  const {dragged} = useDragScroll(strip);

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
            className={[
              'strip-item',
              position === index ? 'active' : '',
              item.kind === 'video' ? 'is-video' : '',
            ].filter(Boolean).join(' ')}
            aria-label={item.filename}
            onClick={() => {
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              onGo(position);
            }}
          >
            <img src={photoMediaUrl(item, adultMode, size)} alt="" loading="lazy" decoding="async" />
            {item.kind === 'video' && (
              <span className="strip-video-mark" aria-hidden="true">
                <Icon name="play" />
              </span>
            )}
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

function insideRect(rect: DOMRect, x: number, y: number): boolean {
  return rect.width > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isUiTarget(target: EventTarget): boolean {
  return Boolean((target as HTMLElement).closest?.('.viewer-ui, button, a, input, .viewer-sheet'));
}

function PhotoFaces({faces, bounds, sourceWidth, sourceHeight, kin, selected, onSelect, bigfamUrl, photoTaken}: {
  faces: PhotoFace[];
  bounds: ImageBounds;
  sourceWidth: number;
  sourceHeight: number;
  kin: KinPerson[];
  selected: number | null;
  onSelect(faceId: number): void;
  bigfamUrl: string;
  photoTaken?: number | null;
}) {
  const kinById = new Map(kin.map(person => [person.id, person]));
  const [relativesOpen, setRelativesOpen] = useState(false);
  useEffect(() => setRelativesOpen(false), [selected]);
  return (
    <div className="viewer-face-layer viewer-ui" style={{
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    }} aria-label="Лица на фотографии">
      {faces.map(face => {
        if (!face.box) return null;
        const [left, top, right, bottom] = face.box;
        const person = face.bigfam_id ? kinById.get(face.bigfam_id) : undefined;
        const birthday = Boolean(person && !person.deceased && isBirthdayToday(person.birth));
        const birthdayAge = birthday && person ? ageOnDate(person.birth, new Date()) : null;
        const photoAge = person && photoTaken ? ageOnDate(person.birth, new Date(photoTaken)) : null;
        const open = selected === face.id;
        const faceTop = bounds.top + top / sourceHeight * bounds.height;
        const faceBottom = bounds.top + bottom / sourceHeight * bounds.height;
        const faceCenter = bounds.left + (left + right) / 2 / sourceWidth * bounds.width;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const passportWidth = Math.min(310, viewportWidth - 24);
        const passportLeft = Math.max(12 + passportWidth / 2, Math.min(viewportWidth - 12 - passportWidth / 2, faceCenter));
        const spaceAbove = faceTop - 24;
        const spaceBelow = viewportHeight - faceBottom - 24;
        const wantedHeight = relativesOpen ? Math.min(520, viewportHeight * .82) : 245;
        const passportAbove = spaceBelow < wantedHeight && spaceAbove > spaceBelow;
        const passportSpace = Math.max(170, passportAbove ? spaceAbove : spaceBelow);
        const passportStyle = passportAbove
          ? {left: passportLeft, bottom: viewportHeight - faceTop + 12, maxHeight: passportSpace}
          : {left: passportLeft, top: faceBottom + 12, maxHeight: passportSpace};
        const style = {
          left: `${left / sourceWidth * 100}%`,
          top: `${top / sourceHeight * 100}%`,
          width: `${Math.max(0, right - left) / sourceWidth * 100}%`,
          height: `${Math.max(0, bottom - top) / sourceHeight * 100}%`,
        };
        return (
          <span
            key={face.id}
            className={`viewer-face-box${open ? ' selected' : ''}`}
            style={style}
            role="button"
            tabIndex={0}
            aria-label={`Открыть карточку: ${face.name || 'Без имени'}`}
            aria-expanded={open}
            onClick={event => { event.stopPropagation(); onSelect(face.id); }}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onSelect(face.id);
              }
            }}
          >
            <span className="viewer-face-name">{face.name || 'Без имени'}</span>
            {open && (
              <span className={`viewer-face-passport ${passportAbove ? 'above' : 'below'}${person?.deceased ? ' is-deceased' : ''}${birthday ? ' is-birthday' : ''}`} style={passportStyle}>
                {person?.deceased && <GhostPattern />}
                {birthday && <ConfettiPattern />}
                <span className="viewer-face-passport-head">
                  <span className="viewer-face-passport-avatar-wrap">
                    <Avatar
                      srcs={[person?.avatar, face.bigfam_id ? `/media/bigfam/${face.bigfam_id}` : '', face.thumbnail]}
                      name={face.name}
                      className="viewer-face-passport-avatar"
                      letterClassName="viewer-face-passport-letter"
                    />
                    {birthday && (
                      <SmartTooltip text={birthdayAge === null ? 'Сегодня день рождения' : `Сегодня исполнилось ${ageLabel(birthdayAge)}`} className="viewer-birthday-hat-wrap">
                        <span className="viewer-birthday-hat" aria-label={birthdayAge === null ? 'Сегодня день рождения' : `Сегодня исполнилось ${ageLabel(birthdayAge)}`}>🥳</span>
                      </SmartTooltip>
                    )}
                  </span>
                  <span>
                    <strong>{person?.name || face.name || 'Без имени'}</strong>
                    <small>{face.bigfam_id ? 'Профиль Bigfam' : 'Локальное распознавание'}</small>
                    {birthdayAge !== null && <small className="viewer-birthday-age">Сегодня исполнилось {ageLabel(birthdayAge)}</small>}
                  </span>
                </span>
                {person && (
                  <span className="viewer-face-passport-data">
                    {person.birth && <span><small>Дата рождения</small><b>{kinDate(person.birth)}</b></span>}
                    {photoAge !== null && <span><small>Возраст на фото</small><b>{ageLabel(photoAge)}</b></span>}
                    {person.sex && <span><small>Пол</small><b>{kinSex(person.sex)}</b></span>}
                  </span>
                )}
                {person && (
                  <span className="viewer-face-passport-actions">
                    <SmartTooltip text="Открыть все связи в Bigfam">
                      <a href={bigfamPersonUrl(bigfamUrl, person.id)} target="_blank" rel="noopener"
                        onClick={event => event.stopPropagation()}>
                        Все связи ↗
                      </a>
                    </SmartTooltip>
                    <button type="button" aria-expanded={relativesOpen}
                      onClick={event => { event.stopPropagation(); setRelativesOpen(value => !value); }}>
                      {relativesOpen ? 'Скрыть близких' : 'Близкие'}
                    </button>
                  </span>
                )}
                {person && relativesOpen && <KinGraph person={person} bigfamUrl={bigfamUrl} />}
                {person?.deceased && <SmartTooltip text={`Дата смерти: ${kinDate(person.death || '') || 'не указана'}`} className="viewer-deceased-mark-wrap">
                  <span className="viewer-deceased-mark" role="img" aria-label={`Дата смерти: ${kinDate(person.death || '') || 'не указана'}`}>💀</span>
                </SmartTooltip>}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function KinGraph({person, bigfamUrl}: {person: KinPerson; bigfamUrl: string}) {
  const groups = [
    ['Супруги', person.relatives?.spouses ?? []],
    ['Родители', person.relatives?.parents ?? []],
    ['Братья и сёстры', person.relatives?.siblings ?? []],
    ['Дети', person.relatives?.children ?? []],
  ] as const;
  const hasRelatives = groups.some(([, relatives]) => relatives.length > 0);
  return (
    <span className="viewer-kin-graph">
      {hasRelatives ? groups.map(([title, relatives]) => relatives.length > 0 && (
        <span className="viewer-kin-branch" key={title}>
          <small>{title}</small>
          <span>
            {relatives.map(relative => (
              <SmartTooltip key={relative.id} text={`Открыть ${shortKinName(relative.name)} в Bigfam`}>
                <a href={bigfamPersonUrl(bigfamUrl, relative.id)} target="_blank" rel="noopener"
                  onClick={event => event.stopPropagation()}>
                  <Avatar srcs={[relative.avatar]} name={relative.name}
                    className="viewer-kin-avatar" letterClassName="viewer-kin-letter" />
                  <b>{shortKinName(relative.name)}</b>
                </a>
              </SmartTooltip>
            ))}
          </span>
        </span>
      )) : <small className="viewer-kin-empty">Ближайшие родственники в графе не указаны</small>}
    </span>
  );
}

function SmartTooltip({text, children, className = ''}: {text: string; children: React.ReactNode; className?: string}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({left: 0, top: 0, below: false});
  const place = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const width = tooltip.current?.offsetWidth ?? Math.min(340, text.length * 7 + 24);
    const height = tooltip.current?.offsetHeight ?? 34;
    const margin = 10;
    const below = rect.top < height + margin + 8;
    setPosition({
      left: Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left + rect.width / 2 - width / 2)),
      top: below ? rect.bottom + 8 : rect.top - height - 8,
      below,
    });
  }, [text]);
  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);
  return <>
    <span ref={anchor} className={`smart-tooltip-anchor ${className}`.trim()}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
    </span>
    {open && createPortal(
      <span ref={tooltip} className={`smart-tooltip${position.below ? ' below' : ''}`} role="tooltip"
        style={{left: position.left, top: position.top}}>{text}</span>,
      anchor.current?.closest('.viewer') ?? document.body,
    )}
  </>;
}

function GhostPattern() {
  return <span className="viewer-ghost-pattern" aria-hidden="true">
    {Array.from({length: 22}, (_, index) => <span key={index}>👻</span>)}
  </span>;
}

function ConfettiPattern() {
  return <span className="viewer-confetti-pattern" aria-hidden="true">
    {Array.from({length: 30}, (_, index) => <i key={index} style={{
      left: `${(index * 37 + 7) % 96}%`,
      top: `${(index * 61 + 5) % 94}%`,
      background: `hsl(${(index * 47) % 360} 88% 62% / 42%)`,
      transform: `rotate(${index * 29}deg)`,
    }} />)}
  </span>;
}

function isBirthdayToday(value?: string): boolean {
  if (!value) return false;
  const match = value.match(/(?:^|\D)(\d{1,2})-(\d{1,2})$/);
  if (!match) return false;
  const today = new Date();
  return Number(match[1]) === today.getMonth() + 1 && Number(match[2]) === today.getDate();
}

function ageOnDate(birth: string | undefined, date: Date): number | null {
  if (!birth || Number.isNaN(date.getTime())) return null;
  const match = birth.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  let age = date.getFullYear() - year;
  if (date.getMonth() + 1 < month || (date.getMonth() + 1 === month && date.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

function ageLabel(age: number): string {
  const mod100 = age % 100;
  const mod10 = age % 10;
  const suffix = mod100 >= 11 && mod100 <= 14 ? 'лет' : mod10 === 1 ? 'год' : mod10 >= 2 && mod10 <= 4 ? 'года' : 'лет';
  return `${age} ${suffix}`;
}

function shortKinName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  const [, first, middle] = parts;
  const initials = [parts[0], middle].filter(Boolean).map(part => `${part[0].toUpperCase()}.`).join('');
  return `${first} ${initials}`;
}

function kinDate(value: string): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}

function kinSex(value: string): string {
  const normalized = value.toLowerCase();
  if (['m', 'male', 'м', 'мужской'].includes(normalized)) return 'Мужской';
  if (['f', 'female', 'ж', 'женский'].includes(normalized)) return 'Женский';
  return value;
}

function isMediaElementTarget(target: EventTarget): boolean {
  return Boolean((target as HTMLElement).closest?.('.viewer-media-shell > img, .viewer-media-shell > video'));
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
