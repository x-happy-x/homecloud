import {Fragment, useState, type MouseEvent} from 'react';
import {fileSize, timecode} from '../../../lib/format';
import {useStore} from '../../../store';
import type {PhotoCard, RouterLabel} from '../../../types/api';
import {FolderPickerDialog, type PickedFolder} from '../../../components/FolderPicker/FolderPickerDialog';
import {folderCrumbs} from '../gallery';
import {FolderContextMenu, type FolderMenuState} from '../FolderContextMenu';
import {useFolderActions} from '../useFolderActions';
import {FacesOverlay} from './FacesOverlay';
import {SpeechPanel} from './SpeechPanel';

/** Метку роутера показываем, если её подтвердили или модель в ней уверена. */
const ROUTER_MIN_SCORE = .55;
/** Области 18+ слабее этого — шум; лица сами по себе к делу не относятся. */
const ADULT_MIN_SCORE = .25;
const CAPTION_TAGS_SHOWN = 30;

export interface InfoPanelProps {
  photo: PhotoCard;
  onClose(): void;
  onSeek(seconds: number | null | undefined): void;
}

/** Шторка подробностей снимка. */
export function InfoPanel({photo, onClose, onSeek}: InfoPanelProps) {
  return (
    <div className="viewer-sheet-body">
      {/*
        Ключей здесь быть не должно. Соседние разделы появляются и пропадают
        (роутер, 18+, речь), и единственный ключ среди соседей без ключей сбивал
        React: он добавлял новый блок «Кто на фото», не убрав прежний, и при
        листании они копились. Своё состояние панели сбрасывают сами, по смене
        пути снимка.
      */}
      <PlacesPanel photo={photo} onClose={onClose} />
      <FacesOverlay photo={photo} onClose={onClose} onSeek={onSeek} />
      <Description photo={photo} />
      <RouterLabels photo={photo} />
      <AdultAnalysis photo={photo} />
      {photo.kind === 'video' && photo.speech_text && (
        <SpeechPanel photo={photo} onSeek={onSeek} />
      )}
      {photo.ocr_text && (
        <details className="lightbox-ocr">
          <summary>Распознанный текст</summary>
          <div>{photo.ocr_text}</div>
        </details>
      )}
      <h3>
        Файл
        <CopyPathButton photo={photo} />
      </h3>
      <FileInfo photo={photo} />
    </div>
  );
}

function CopyPathButton({photo}: {photo: PhotoCard}) {
  const toast = useStore(state => state.toast);
  const path = windowsPath(photo);
  return (
    <button
      className="link-button"
      type="button"
      title={path}
      onClick={() => {
        void copyText(path).then(
          () => toast('Путь скопирован'),
          () => toast('Не удалось скопировать путь', 'error'),
        );
      }}
    >
      копировать путь
    </button>
  );
}

/** Папка и альбомы снимка — кликабельные: ведут в ту же подборку. */
function PlacesPanel({photo, onClose}: {photo: PhotoCard; onClose(): void}) {
  const canEdit = useStore(state => state.session.canEdit);
  const album = useStore(state => state.filters.album);
  const setFilters = useStore(state => state.setFilters);
  const openAlbumPick = useStore(state => state.openAlbumPick);
  const crumbs = folderCrumbs(photo.folder);

  const folderActions = useFolderActions();
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [moveFolder, setMoveFolder] = useState('');

  const openMenu = (event: MouseEvent, path: string, label: string) => {
    event.preventDefault();
    setFolderMenu({
      path, label,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 210),
    });
  };

  return (
    <>
      <h3>Папка</h3>
      <div className="sheet-trail has-context-menu">
        {crumbs.length
          ? crumbs.map((crumb, index) => (
              <Fragment key={crumb.path}>
                {index > 0 && <i aria-hidden="true">/</i>}
                <button
                  className="crumb"
                  type="button"
                  onClick={() => { onClose(); setFilters({folder: crumb.path, album: 0}); }}
                  onContextMenu={event => openMenu(event, crumb.path, crumb.name)}
                >
                  {crumb.name}
                </button>
              </Fragment>
            ))
          : <span className="photo-unknown">Путь неизвестен</span>}
      </div>

      <FolderContextMenu
        menu={folderMenu}
        canEdit={canEdit}
        busy={folderActions.busy}
        onClose={() => setFolderMenu(null)}
        // Фильтр меняем и уходим в галерею — как по щелчку на самой крошке.
        onExclude={path => { onClose(); folderActions.excludeFromFilter(path); }}
        // Остальное делаем не закрывая просмотрщик: эти действия идут запросом,
        // и снимать компонент, пока он не ответил, — терять и ответ, и сообщение.
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
        onPick={target => {
          const path = moveFolder;
          setMoveFolder('');
          folderActions.move(path, target);
        }}
      />

      <h3>
        Альбомы
        {canEdit && (
          <button className="link-button" type="button"
            onClick={() => openAlbumPick({kind: 'photos', paths: [photo.path]})}>
            добавить
          </button>
        )}
      </h3>
      <div className="chips album-chips">
        {photo.albums.length
          ? photo.albums.map(item => (
              <button
                key={item.id}
                className="chip"
                type="button"
                onClick={() => {
                  onClose();
                  setFilters({album: album === item.id ? 0 : item.id, folder: '', hidden: false});
                }}
              >
                {item.trail}
              </button>
            ))
          : <span className="photo-unknown">Снимок пока не в альбомах</span>}
      </div>
    </>
  );
}

function Description({photo}: {photo: PhotoCard}) {
  const tags = Array.isArray(photo.caption_tags) ? [] : photo.caption_tags.ru ?? [];
  return (
    <>
      <h3>Описание</h3>
      {photo.caption_short && <strong className="lightbox-caption">{photo.caption_short}</strong>}
      <div className={`lightbox-description${photo.caption ? '' : ' is-empty'}`}>
        {photo.caption || 'Описание ещё не создано'}
      </div>
      {tags.length > 0 && (
        <div className="chips caption-tags">
          {tags.slice(0, CAPTION_TAGS_SHOWN).map(tag => <span key={tag}>{tag}</span>)}
        </div>
      )}
    </>
  );
}

function RouterLabels({photo}: {photo: PhotoCard}) {
  const labels = photo.router_labels.filter(item => item.verified || item.score >= ROUTER_MIN_SCORE);
  if (!labels.length) return null;
  const groups = new Map<string, RouterLabel[]>();
  for (const item of labels) {
    const group = item.group || 'Другое';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  return (
    <section className="lightbox-router">
      <h3>Категории визуального роутера</h3>
      <div className="router-detail-groups">
        {[...groups].map(([group, items]) => (
          <div key={group} className="router-detail-group">
            <b>{group}</b>
            <div className="chips">
              {items.map(item => (
                <span key={item.id} className={`chip${item.verified ? ' verified' : ''}`}>
                  {item.verified ? '✓ ' : ''}{item.title}
                  {item.verified ? '' : ` ${Math.round(item.score * 100)}%`}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <small>✓ — подтверждено вручную; остальные проценты рассчитаны локальной моделью.</small>
    </section>
  );
}

function AdultAnalysis({photo}: {photo: PhotoCard}) {
  if (!photo.adult_description) return null;
  const regions = photo.adult_regions
    .filter(item => item.score >= ADULT_MIN_SCORE && !item.class.startsWith('FACE_'));
  return (
    <section className="lightbox-adult">
      <h3>Локальный анализ 18+</h3>
      <p className="adult-description">{photo.adult_description}</p>
      <div className="adult-regions">
        {regions.map((item, index) => (
          <span key={`${item.class}-${index}`}>
            {item.class.replaceAll('_', ' ').toLowerCase()} · {Math.round(item.score * 100)}%
          </span>
        ))}
      </div>
    </section>
  );
}

/** Техническая сводка: размер, разрешение, длина. */
function FileInfo({photo}: {photo: PhotoCard}) {
  const movie = photo.kind === 'video';
  const path = windowsPath(photo);
  const rows: Array<[string, string]> = [
    ['Путь', path],
    ['Размер файла', photo.size ? fileSize(photo.size) : ''],
    ['Разрешение', photo.width && photo.height ? `${photo.width}×${photo.height}` : ''],
    ...(movie ? [['Длительность', photo.duration ? timecode(photo.duration) : '']] as Array<[string, string]> : []),
    ['Тип', movie ? 'Видео' : 'Фотография'],
  ];
  return (
    <dl className="file-info">
      {rows.filter(([, value]) => value).map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function windowsPath(photo: PhotoCard): string {
  if (/^[a-z]:[\\/]/i.test(photo.path) || photo.path.startsWith('\\\\')) return photo.path;
  if (!photo.folder) return photo.path || photo.filename;
  const separator = photo.folder.includes('/') && !photo.folder.includes('\\') ? '/' : '\\';
  return `${photo.folder.replace(/[\\/]+$/, '')}${separator}${photo.filename}`;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // HTTP по локальной сети может запретить Clipboard API; ниже старый путь.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.setAttribute('readonly', '');
  document.body.append(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy failed');
}
