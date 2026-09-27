import type {ReactNode} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import {adultFlag, unchecked} from '../../../lib/adult';
import {fileSize, formatNumber, plural} from '../../../lib/format';
import {getPhotoMetadata, getPhotos, type MetadataGroup} from '../../../services/endpoints/catalog';
import {getSimilarPhotos, markAdult} from '../../../services/endpoints/photos';
import {density, photoMediaUrl} from '../../../services/media';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import type {PhotoCard} from '../../../types/api';
import {Icon} from '../../../ui/Icon/Icon';

/** Сколько снимков в ленте «в тот же день» и «похожие». */
const SLIDER_LIMIT = 24;

export function InfoCard({title, action, className, children}: {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={['info-card', className].filter(Boolean).join(' ')}>
      {(title || action) && (
        <header className="info-card-head">
          {title && <h4>{title}</h4>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Дата снимка по местному времени ключом группы «день»: 2025-07-14. */
export function dayKey(taken: number | string | null | undefined): string {
  if (taken == null || taken === '') return '';
  const date = new Date(typeof taken === 'number' ? taken : Date.parse(String(taken)));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Параметры съёмки из EXIF по ключам: «f/1.8», «1/120 с», «ISO 64», «26 мм», модель. */
export function shotFacts(groups: MetadataGroup[] | undefined): Array<{key: string; value: string; label: string}> {
  const items = new Map<string, string>();
  for (const group of groups ?? []) for (const item of group.items) items.set(item.key, item.value);
  const pick = (keys: string[]) => keys.map(key => items.get(key)).find(Boolean) ?? '';
  const facts = [
    {key: 'aperture', label: 'диафрагма', value: pick(['FNumber'])},
    {key: 'exposure', label: 'выдержка', value: pick(['ExposureTime'])},
    {key: 'iso', label: 'ISO', value: pick(['ISOSpeedRatings', 'PhotographicSensitivity'])},
    {key: 'focal', label: 'фокусное', value: pick(['FocalLengthIn35mmFilm', 'FocalLength'])},
  ];
  return facts.filter(fact => fact.value);
}

/** Когда снято и чем: крупная дата, день недели, размеры и параметры съёмки. */
export function WhenCard({photo}: {photo: PhotoCard}) {
  const movie = photo.kind === 'video';
  const metadata = useQuery({
    queryKey: qk.photoMetadata(photo.path),
    queryFn: () => getPhotoMetadata(photo.path, Boolean(photo.hidden_owner)),
    staleTime: Infinity,
    retry: false,
    enabled: Boolean(photo.path),
  });
  const date = photo.taken ? new Date(photo.taken) : null;
  const items = new Map<string, string>();
  for (const group of metadata.data?.groups ?? []) for (const item of group.items) items.set(item.key, item.value);
  const camera = [items.get('Make'), items.get('Model')].filter(Boolean).join(' ')
    .replace(/^(\S+) \1 /i, '$1 ');
  const megapixels = photo.width && photo.height ? (photo.width * photo.height) / 1e6 : 0;
  const tiles = [
    megapixels ? {value: `${megapixels >= 10 ? Math.round(megapixels) : megapixels.toFixed(1).replace('.', ',')} Мп`,
      note: `${photo.width}×${photo.height}`} : null,
    photo.size ? {value: fileSize(photo.size), note: movie ? 'видео' : (photo.filename.split('.').pop() ?? '').toUpperCase()} : null,
    ...shotFacts(metadata.data?.groups).map(fact => ({value: fact.value, note: fact.label})),
  ].filter((tile): tile is {value: string; note: string} => Boolean(tile)).slice(0, 4);

  return (
    <InfoCard className="info-when">
      <div className="when-row">
        {date && (
          <span className="when-date" aria-hidden="true">
            <b>{date.getDate()}</b>
            <small>{MONTHS_SHORT[date.getMonth()]}</small>
          </span>
        )}
        <span className="when-text">
          <b>
            {date
              ? `${WEEKDAYS[date.getDay()]}, ${date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})}`
              : 'Дата неизвестна'}
          </b>
          <span>
            {[date ? date.getFullYear() : '', camera].filter(Boolean).join(' · ') || photo.filename}
          </span>
        </span>
      </div>
      {tiles.length > 0 && (
        <div className="when-tiles">
          {tiles.map(tile => (
            <span key={tile.note + tile.value}><b>{tile.value}</b><small>{tile.note}</small></span>
          ))}
        </div>
      )}
    </InfoCard>
  );
}

/** Кто на снимке — аватарами; неизвестные пунктиром. Полный разбор — на вкладке «Люди». */
export function PeopleMini({photo, onMore}: {photo: PhotoCard; onMore(): void}) {
  if (!photo.faces.length) return null;
  const named = photo.faces.filter(face => face.name);
  const unknown = photo.faces.length - named.length;
  return (
    <InfoCard
      title="Кто на фото"
      action={<button type="button" className="info-card-action" onClick={onMore}>Подробнее</button>}
    >
      <div className="people-mini">
        {photo.faces.slice(0, 8).map(face => (
          <button key={face.id} type="button" className={`person-mini${face.name ? '' : ' unknown'}`}
            title={face.name || 'Без имени'} onClick={onMore}>
            <img src={face.thumbnail} alt="" loading="lazy" decoding="async" />
            <span>{face.name ? face.name.split(' ')[0] : 'Кто это?'}</span>
          </button>
        ))}
      </div>
      {unknown > 0 && named.length > 0 && (
        <p className="info-note">{`Без имени: ${unknown}`}</p>
      )}
    </InfoCard>
  );
}

const RATING_TEXT: Record<string, string> = {
  safe: 'не 18+', sensitive: 'откровенное, но не 18+', unknown: 'ещё не проверено',
  suggestive: 'на грани', nudity: '18+ (обнажённость)', explicit: '18+', questionable: 'сомнительно',
};

/**
 * Оценка 18+ и ручная поправка: «это не 18+» снимает замыливание и отбор,
 * «это 18+» — наоборот. Отметка ложится на все копии файла, а этап 18+ её
 * больше не перезаписывает.
 */
export function AdultMarkCard({photo}: {photo: PhotoCard}) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const mark = useMutation({
    mutationFn: (rating: 'safe' | 'explicit' | null) => markAdult([photo.path], rating),
    onSuccess: (_data, rating) => {
      toast(rating === 'safe' ? 'Отмечено: не 18+' : rating === 'explicit' ? 'Отмечено: 18+'
        : 'Вернул автоматическую оценку', 'success');
      // Оценка сидит в адресах превью, отборе галереи, подборках и группах лиц.
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast(error.message || 'Не удалось сохранить отметку', 'error'),
  });
  const manual = photo.adult_manual ?? null;
  const flagged = adultFlag(photo);
  // Чистый проверенный снимок без отметки — карточка не нужна, хватит строки в «Анализе».
  if (!canEdit || (!manual && !flagged && !unchecked(photo))) return null;
  const rating = photo.adult_rating ?? 'unknown';
  return (
    <InfoCard title="18+" className={`info-adult${flagged ? ' flagged' : ''}`}>
      <p className="info-adult-state">
        {manual
          ? <>Отмечено вручную: <b>{manual === 'safe' ? 'не 18+' : '18+'}</b></>
          : <>Автоматически: <b>{RATING_TEXT[rating] ?? rating}</b></>}
      </p>
      <div className="info-adult-actions">
        {manual !== 'safe' && (flagged || unchecked(photo) || manual) && (
          <button type="button" className="button small" disabled={mark.isPending} onClick={() => mark.mutate('safe')}>
            <Icon name="check" size={15} />Это не 18+
          </button>
        )}
        {manual !== 'explicit' && !(flagged && !manual) && (
          <button type="button" className="button small" disabled={mark.isPending} onClick={() => mark.mutate('explicit')}>
            <Icon name="hide" size={15} />Это 18+
          </button>
        )}
        {manual && (
          <button type="button" className="button small ghost" disabled={mark.isPending} onClick={() => mark.mutate(null)}>
            Вернуть автоматическую
          </button>
        )}
      </div>
      {photo.copies && photo.copies.length > 0 && (
        <p className="info-note">Отметка ляжет и на копии: {formatNumber(photo.copies.length)}</p>
      )}
    </InfoCard>
  );
}

function SliderRow({photos, current, onOpen}: {photos: PhotoCard[]; current: string; onOpen(photo: PhotoCard): void}) {
  const adultMode = useStore(state => state.prefs.adultMode);
  const size = Math.round(120 * density());
  return (
    <div className="info-slider">
      {photos.map(item => (
        <button key={item.path} type="button" className={`info-slide${item.path === current ? ' active' : ''}`}
          title={item.filename} onClick={() => onOpen(item)}>
          <img src={photoMediaUrl(item, adultMode, size)} alt="" loading="lazy" decoding="async" />
          {item.kind === 'video' && <span className="info-slide-video"><Icon name="play" size={12} /></span>}
        </button>
      ))}
    </div>
  );
}

/** Другие снимки того же дня — лентой. */
export function SameDaySlider({photo, onOpen}: {photo: PhotoCard; onOpen(photo: PhotoCard): void}) {
  const hideAdult = useStore(state => state.prefs.adultMode === 'hide');
  const day = dayKey(photo.taken);
  const same = useQuery({
    queryKey: qk.sameDay(day, hideAdult),
    queryFn: () => getPhotos({limit: SLIDER_LIMIT + 1, offset: 0, groupBy: 'day', group: day, order: 'old'}),
    enabled: Boolean(day),
    staleTime: 5 * 60_000,
  });
  const photos = same.data?.photos ?? [];
  if (!day || photos.length < 2) return null;
  const total = same.data?.total ?? photos.length;
  return (
    <InfoCard title="В тот же день" action={<span className="info-card-count">{formatNumber(total)}</span>}>
      <SliderRow photos={photos} current={photo.path} onOpen={onOpen} />
    </InfoCard>
  );
}

/** Похожие по визуальному индексу; у снимка без вектора ленты нет. */
export function SimilarSlider({photo, onOpen}: {photo: PhotoCard; onOpen(photo: PhotoCard): void}) {
  const similar = useQuery({
    queryKey: qk.similarPhotos(photo.path),
    queryFn: () => getSimilarPhotos(photo.path, SLIDER_LIMIT),
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (similar.isPending) {
    return (
      <InfoCard title="Похожие снимки">
        <div className="info-slider loading">{[0, 1, 2, 3].map(index => <span key={index} className="info-slide" />)}</div>
      </InfoCard>
    );
  }
  const photos = similar.data?.photos ?? [];
  if (!photos.length) return null;
  return (
    <InfoCard title="Похожие снимки">
      <SliderRow photos={photos} current={photo.path} onOpen={onOpen} />
    </InfoCard>
  );
}

/** Копии файла в других папках и источниках. */
export function CopiesList({photo}: {photo: PhotoCard}) {
  const copies = photo.copies ?? [];
  if (!copies.length) return null;
  return (
    <div className="info-copies">
      <span>{`Ещё ${formatNumber(copies.length)} ${plural(copies.length, 'копия', 'копии', 'копий')}:`}</span>
      <ul>
        {copies.slice(0, 6).map(copy => (
          <li key={copy.path} title={copy.path}>
            <b>{copy.source_name}</b> {copy.path.replace(/^[a-z0-9][a-z0-9_-]{1,31}:/, '')}
          </li>
        ))}
      </ul>
    </div>
  );
}
