import {useState, type MouseEvent} from 'react';
import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {formatNumber} from '../../../lib/format';
import {getFolders} from '../../../services/endpoints/catalog';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import {Crumbs} from '../../../ui/Crumbs/Crumbs';
import {Icon} from '../../../ui/Icon/Icon';
import {FolderPickerDialog, sourceOf, type PickedFolder} from '../../../components/FolderPicker/FolderPickerDialog';
import {FolderContextMenu, type FolderMenuState} from '../FolderContextMenu';
import {useFolderActions} from '../useFolderActions';

/** Папки снимков по уровням: открыть вложенные, показать папку, исключить из библиотеки. */
export function FoldersSection() {
  const folder = useStore(state => state.filters.folder);
  const setFilters = useStore(state => state.setFilters);
  const canEdit = useStore(state => state.session.canEdit);
  // Панель открывается там, где сейчас стоит галерея.
  const [cursor, setCursor] = useState(folder);

  const folders = useQuery({
    queryKey: qk.folders(cursor),
    queryFn: () => getFolders(cursor),
    placeholderData: keepPreviousData,
  });

  const folderActions = useFolderActions();
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [moveFolder, setMoveFolder] = useState('');

  const pick = (path: string) => setFilters({folder: folder === path ? '' : path, folderExclude: '', album: 0});
  const openMenu = (event: MouseEvent, path: string, label: string) => {
    event.preventDefault();
    setFolderMenu({
      path, label,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 210),
    });
  };
  const movePicked = (target: PickedFolder) => {
    const path = moveFolder;
    setMoveFolder('');
    folderActions.move(path, target);
  };
  const data = folders.data;
  const trail = [{path: '', name: 'Все диски'}, ...(data?.trail ?? [])];

  return (
    <>
      <Crumbs items={trail.map(item => ({label: item.name, onClick: () => setCursor(item.path)}))} />
      <div className="folder-tree">
        {cursor && (
          <div className={`folder-row here has-context-menu${folder === cursor ? ' active' : ''}`} onContextMenu={event => openMenu(event, cursor, 'Эта папка')}>
            <button className="folder-pick" type="button" onClick={() => pick(cursor)}>
              <span className="folder-name">Показать всё в этой папке</span>
            </button>
          </div>
        )}
        {data && (data.folders.length
          ? data.folders.map(item => (
              <div key={item.path} className={`folder-row has-context-menu${folder === item.path ? ' active' : ''}`} onContextMenu={event => openMenu(event, item.path, item.name)}>
                <button
                  className="folder-open"
                  type="button"
                  aria-label="Открыть вложенные"
                  disabled={!item.folders}
                  onClick={() => setCursor(item.path)}
                >
                  {item.folders > 0 && <Icon name="chevronRight" />}
                </button>
                <button className="folder-pick" type="button" onClick={() => pick(item.path)}>
                  <span className="folder-name">{item.name}</span>
                  <span className="folder-count">{formatNumber(item.photos)}</span>
                </button>
              </div>
            ))
          : <span className="person-meta">Вложенных папок нет</span>)}
      </div>
      <FolderContextMenu
        menu={folderMenu}
        canEdit={canEdit}
        busy={folderActions.busy}
        onClose={() => setFolderMenu(null)}
        onExclude={folderActions.excludeFromFilter}
        onExcludeFaces={folderActions.excludeFaces}
        onHide={folderActions.hide}
        onMove={setMoveFolder}
        onDelete={folderActions.remove}
      />
      <FolderPickerDialog
        open={Boolean(moveFolder)}
        title="Куда переместить папку"
        note="Папка назначения — в том же источнике. Медиа из исходной папки переедут внутрь выбранной."
        confirmLabel="Переместить сюда"
        source={sourceOf(moveFolder)}
        onClose={() => setMoveFolder('')}
        onPick={movePicked}
      />
    </>
  );
}
