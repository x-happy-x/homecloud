import {memo, useEffect, useMemo, useRef, useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './HighlightsView.scss';
import {useSwipeScroll} from '../../hooks/useSwipeScroll';
import {adultFlag} from '../../lib/adult';
import {formatNumber, plural} from '../../lib/format';
import {
  getHighlight, getHighlights, getHighlightsStatus, regenerateHighlights,
  type Highlight, type HighlightPhoto,
} from '../../services/endpoints/highlights';
import {density, photoMediaUrl} from '../../services/media';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import type {AdultMode} from '../../types/domain';
import {Button} from '../../ui/Button/Button';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Icon} from '../../ui/Icon/Icon';
import {Skeleton} from '../../ui/Skeleton/Skeleton';
import {ToggleChip} from '../../ui/Chip/Chip';
import {
  cardLabel, explainReasons, featuredHighlight, highlightSections, isFeatureTile, KIND_FILTERS, KIND_LABELS,
  sortHighlights,
} from './highlights';

const photosText = (count: number) => `${formatNumber(count)} ${plural(count, 'снимок', 'снимка', 'снимков')}`;

/** Обложка крупнее плитки галереи: карточек на экране немного. */
const coverSize = () => Math.round(360 * density());
/** Главная подборка во всю ширину — ей нужна копия побольше. */
const heroSize = () => Math.round(900 * density());
/** Сколько снимков мозаикой рядом с обложкой главной подборки. */
const HERO_MOSAIC = 4;

export function HighlightsView() {
  const openKey = useStore(state => state.routeHighlight);
  return openKey ? <HighlightDetail highlightKey={openKey} /> : <HighlightList />;
}

function useHighlightsJob() {
  const status = useQuery({
    queryKey: qk.highlightsStatus(),
    queryFn: getHighlightsStatus,
    refetchInterval: query => (query.state.data?.status === 'running' ? 1500 : false),
  });
  const running = status.data?.status === 'running';
  // Пересборка закончилась — списки и открытая подборка устарели.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) void queryClient.invalidateQueries({queryKey: ['highlights']});
    wasRunning.current = running;
  }, [running]);
  return status;
}

function HighlightList() {
  const canEdit = useStore(state => state.session.canEdit);
  const adultMode = useStore(state => state.prefs.adultMode);
  const openHighlight = useStore(state => state.setRouteHighlight);
  const toast = useStore(state => state.toast);
  const [kind, setKind] = useState('');
  const hideAdult = adultMode === 'hide';

  const list = useQuery({
    queryKey: qk.highlights(kind, hideAdult),
    queryFn: () => getHighlights(kind, hideAdult),
  });
  const job = useHighlightsJob();
  const running = job.data?.status === 'running';

  const regenerate = useMutation({
    mutationFn: () => regenerateHighlights(true),
    onSuccess: () => {
      toast('Пересобираю подборки');
      void queryClient.invalidateQueries({queryKey: qk.highlightsStatus()});
    },
    onError: error => toast(error instanceof Error ? error.message : 'Не удалось запустить', 'error'),
  });

  const groups = useMemo(() => sortHighlights(list.data?.groups ?? []), [list.data]);
  // Главная — только на общем виде: в отфильтрованном списке все равны.
  const featured = kind ? null : featuredHighlight(groups);
  const rest = useMemo(() => groups.filter(group => group !== featured), [groups, featured]);
  const sections = useMemo(() => (kind ? [] : highlightSections(rest)), [kind, rest]);
  const size = coverSize();
  const filters = useRef<HTMLDivElement>(null);
  useSwipeScroll(filters);

  return (
    <section className="view active highlights-view">
      <header className="hl-head">
        <div>
          <p className="eyebrow">Собираются сами из лучших снимков</p>
          <h1>Воспоминания</h1>
        </div>
        {groups.length > 0 && (
          <span className="hl-head-count">
            {formatNumber(groups.length)} {plural(groups.length, 'подборка', 'подборки', 'подборок')}
          </span>
        )}
        {canEdit && (
          <Button small disabled={running || regenerate.isPending} onClick={() => regenerate.mutate()}>
            {running ? <span className="hl-spinner" aria-hidden="true" /> : <Icon name="process" size={16} />}
            <span>{running ? 'Пересобираю…' : 'Пересобрать'}</span>
          </Button>
        )}
      </header>

      {job.data?.status === 'error' && (
        <p className="hl-error" role="alert">Пересборка не удалась: {job.data.error}</p>
      )}

      <div className="hl-filters swipe-rail" ref={filters} role="group" aria-label="Вид подборок">
        {KIND_FILTERS.map(([id, label]) => (
          <button
            key={id || 'all'}
            type="button"
            className={kind === id ? 'active' : ''}
            aria-pressed={kind === id}
            onClick={() => setKind(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {list.isPending && (
        <div className="hl-grid">
          <Skeleton count={8} variant="photo" />
        </div>
      )}

      {featured && <FeaturedHighlight group={featured} adultMode={adultMode} onOpen={openHighlight} />}

      {!kind && sections.map(section => (
        <section key={section.kind} className="hl-section">
          <div className="hl-section-head">
            <h2>{section.title} <small>{formatNumber(section.groups.length)}</small></h2>
            {section.groups.length > 4 && (
              <button type="button" className="hl-see-all" onClick={() => setKind(section.kind)}>
                Все <Icon name="chevronRight" size={16} />
              </button>
            )}
          </div>
          <HighlightRail groups={section.groups} adultMode={adultMode} size={size} onOpen={openHighlight} />
        </section>
      ))}

      {kind && (
        <div className="hl-grid">
          {groups.map(group => (
            <HighlightCard key={group.key} group={group} adultMode={adultMode} size={size} onOpen={openHighlight} />
          ))}
        </div>
      )}

      {!list.isPending && groups.length === 0 && (
        <EmptyState mark="✦" title={kind ? 'Подборок такого вида нет' : 'Подборок пока нет'}>
          {kind
            ? 'Выберите другой вид или пересоберите подборки после нового анализа.'
            : 'Они появятся после визуального анализа и оценки снимков. Запустите этапы «Оценка» и «Подборки» в сканировании или нажмите «Пересобрать».'}
        </EmptyState>
      )}
    </section>
  );
}

/** Лента одного вида подборок: без полосы прокрутки, листается свайпом. */
function HighlightRail({groups, adultMode, size, onOpen}: {
  groups: Highlight[];
  adultMode: AdultMode;
  size: number;
  onOpen(key: string): void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  useSwipeScroll(rail);
  return (
    <div className="hl-rail swipe-rail" ref={rail}>
      {groups.map(group => (
        <HighlightCard key={group.key} group={group} adultMode={adultMode} size={size} onOpen={onOpen} />
      ))}
    </div>
  );
}

interface FeaturedProps {
  group: Highlight;
  adultMode: AdultMode;
  onOpen(key: string): void;
}

/** Главная подборка: крупная обложка и мозаика из её лучших снимков. */
function FeaturedHighlight({group, adultMode, onOpen}: FeaturedProps) {
  const hideAdult = adultMode === 'hide';
  // Список отдаёт только обложку; снимки для мозаики — из самой подборки.
  // Этот же запрос пригодится, когда её откроют.
  const detail = useQuery({
    queryKey: qk.highlight(group.key, hideAdult),
    queryFn: () => getHighlight(group.key, hideAdult),
    staleTime: 60_000,
  });
  const cover = group.cover;
  const mosaic = (detail.data?.group.photos ?? [])
    .filter(photo => photo.path !== cover?.path)
    .slice(0, HERO_MOSAIC);
  const big = heroSize();
  const small = coverSize();
  const eyebrow = group.kind === 'on-this-day' ? 'В этот день' : KIND_LABELS[group.kind] ?? '';

  return (
    <article className={`hl-hero kind-${group.kind}${mosaic.length >= 2 ? ' with-mosaic' : ''}`}>
      <button type="button" className="hl-hero-cover" onClick={() => onOpen(group.key)}>
        {cover
          ? <img src={photoMediaUrl(cover, adultMode, big)} alt="" decoding="async" />
          : <span className="hl-card-blank" aria-hidden="true"><Icon name="highlights" /></span>}
        <span className="hl-hero-text">
          <small>{eyebrow}</small>
          <strong>{group.title}</strong>
          <span>{group.kind === 'on-this-day' ? `${group.subtitle} · ` : ''}{photosText(group.photo_count)}</span>
          <span className="hl-hero-cta">Смотреть <Icon name="chevronRight" size={16} /></span>
        </span>
      </button>
      {mosaic.length >= 2 && (
        <div className={`hl-mosaic count-${mosaic.length}`}>
          {mosaic.map(photo => (
            <button key={photo.path} type="button" className="hl-mosaic-tile" onClick={() => onOpen(group.key)} tabIndex={-1}>
              <img src={photoMediaUrl(photo, adultMode, small)} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

interface HighlightCardProps {
  group: Highlight;
  adultMode: AdultMode;
  size: number;
  onOpen(key: string): void;
}

const HighlightCard = memo(function HighlightCard({group, adultMode, size, onOpen}: HighlightCardProps) {
  const cover = group.cover;
  return (
    <button type="button" className={`hl-card kind-${group.kind}`} onClick={() => onOpen(group.key)}>
      {cover
        ? <img src={photoMediaUrl(cover, adultMode, size)} alt="" loading="lazy" decoding="async" />
        : <span className="hl-card-blank" aria-hidden="true"><Icon name="highlights" /></span>}
      <span className="hl-card-kind">{cardLabel(group)}</span>
      <span className="hl-card-text">
        <strong>{group.title}</strong>
        <span>{photosText(group.photo_count)}</span>
      </span>
    </button>
  );
});

function HighlightDetail({highlightKey}: {highlightKey: string}) {
  const adultMode = useStore(state => state.prefs.adultMode);
  const openHighlight = useStore(state => state.setRouteHighlight);
  const setRoutePhoto = useStore(state => state.setRoutePhoto);
  const setSequence = useStore(state => state.setViewerSequence);
  const [explain, setExplain] = useState(false);
  const hideAdult = adultMode === 'hide';
  useHighlightsJob();

  const detail = useQuery({
    queryKey: qk.highlight(highlightKey, hideAdult),
    queryFn: () => getHighlight(highlightKey, hideAdult),
    retry: false,
  });
  const group = detail.data?.group;
  const photos = useMemo(() => group?.photos ?? [], [group]);

  // Просмотрщик листает снимки подборки, а не галерею.
  useEffect(() => {
    setSequence(photos.length ? photos : null);
    return () => setSequence(null);
  }, [photos, setSequence]);

  const small = coverSize();
  const large = heroSize();
  const cover = group?.cover ?? photos[0];
  const backdrop = cover ? photoMediaUrl(cover, adultMode, small) : '';

  return (
    <section className="view active highlights-view">
      {detail.isError && (
        <>
          <div className="hl-back">
            <Button small onClick={() => openHighlight('')}>
              <Icon name="chevronLeft" size={16} />
              <span>Все подборки</span>
            </Button>
          </div>
          <EmptyState mark="✦" title="Подборка не найдена">
            Её могли пересобрать: вернитесь к списку подборок.
          </EmptyState>
        </>
      )}

      {group && (
        <>
          <header className={`hl-detail-hero kind-${group.kind}`}>
            {/* Размытая обложка фоном: через style — это CSSOM, политика безопасности его пропускает. */}
            {backdrop && <span className="hl-detail-backdrop" style={{backgroundImage: `url("${backdrop}")`}} aria-hidden="true" />}
            <div className="hl-detail-bar">
              <button type="button" className="hl-back-button" onClick={() => openHighlight('')}>
                <Icon name="chevronLeft" size={18} />
                <span>Все подборки</span>
              </button>
              <ToggleChip checked={explain} onChange={setExplain} title="Оценки и причины выбора каждого снимка">
                Почему эти снимки
              </ToggleChip>
            </div>
            <div className="hl-detail-text">
              <p className="eyebrow">
                {group.kind === 'on-this-day' ? `В этот день · ${group.subtitle}` : KIND_LABELS[group.kind] ?? ''}
              </p>
              <h1>{group.title}</h1>
              <div className="hl-detail-stats">
                <span>{photosText(photos.length)}</span>
                {group.meta.candidates !== undefined && (
                  <span>
                    отобрано из {formatNumber(group.meta.candidates)}
                  </span>
                )}
                {!!group.meta.collapsed && <span>{formatNumber(group.meta.collapsed)} похожих схлопнуто</span>}
                {group.kind !== 'event' && !!group.meta.events && (
                  <span>
                    {formatNumber(group.meta.events)} {plural(group.meta.events, 'событие', 'события', 'событий')}
                  </span>
                )}
              </div>
            </div>
          </header>

          <div className="hl-photos">
            {photos.map((photo, index) => (
              <HighlightTile
                key={photo.path}
                photo={photo}
                feature={isFeatureTile(index, photos.length)}
                size={isFeatureTile(index, photos.length) ? large : small}
                adultMode={adultMode}
                explain={explain}
                onOpen={setRoutePhoto}
              />
            ))}
          </div>
        </>
      )}

      {detail.isPending && (
        <>
          <div className="hl-detail-hero pending" />
          <div className="hl-photos"><Skeleton count={12} /></div>
        </>
      )}
    </section>
  );
}

interface HighlightTileProps {
  photo: HighlightPhoto;
  feature: boolean;
  size: number;
  adultMode: AdultMode;
  explain: boolean;
  onOpen(path: string): void;
}

const HighlightTile = memo(function HighlightTile({photo, feature, size, adultMode, explain, onOpen}: HighlightTileProps) {
  const reasons = photo.highlight.reasons;
  return (
    <button
      type="button"
      className={`hl-tile${feature ? ' feature' : ''}`}
      title={explain ? explainReasons(reasons) : photo.filename}
      onClick={() => onOpen(photo.path)}
    >
      <img
        src={photoMediaUrl(photo, adultMode, size)}
        alt={photo.caption_short || photo.caption || photo.filename}
        loading="lazy"
        decoding="async"
      />
      {photo.kind === 'video' && <span className="hl-tile-video" aria-label="Видео"><Icon name="play" size={12} /></span>}
      {adultFlag(photo) && <span className="tile-flag">18+</span>}
      {explain && (
        <span className="hl-score" aria-label={explainReasons(reasons)}>
          <b>{Math.round(photo.highlight.score * 100)}</b>
          {reasons.series > 0 && <small>из {reasons.series + 1}</small>}
        </span>
      )}
    </button>
  );
});
