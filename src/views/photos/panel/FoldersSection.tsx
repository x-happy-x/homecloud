import {useState} from 'react';
import {keepPreviousData, useMutation, useQuery} from '@tanstack/react-query';
import {formatNumber} from '../../../lib/format';
import {getFolders} from '../../../services/endpoints/catalog';
import {getSettings, saveSettings} from '../../../services/endpoints/settings';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import {Crumbs} from '../../../ui/Crumbs/Crumbs';
import {Icon} from '../../../ui/Icon/Icon';

/** Папки снимков по уровням: открыть вложенные, показать папку, исключить из библиотеки. */
export function FoldersSection() {
  const folder = useStore(state => state.filters.folder);
  const setFilters = useStore(state => state.setFilters);
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  // Панель открывается там, где сейчас стоит галерея.
  const [cursor, setCursor] = useState(folder);

  const folders = useQuery({
    queryKey: qk.folders(cursor),
    queryFn: () => getFolders(cursor),
    placeholderData: keepPreviousData,
  });

  /** Исключение папки прямо из панели: дописываем её в чёрный список путей. */
  const block = useMutation({
    mutationFn: async (path: string) => {
      const {settings} = await queryClient.fetchQuery({queryKey: qk.settings(), queryFn: getSettings});
      const rules = String(settings.block_paths ?? '').split('\n').map(rule => rule.trim()).filter(Boolean);
      if (rules.some(rule => rule.toLowerCase() === path.toLowerCase())) return null;
      return saveSettings({block_paths: [...rules, path].join('\n')});
    },
    onSuccess: (result, path) => {
      if (!result) {
        toast('Эта папка уже в списке');
        return;
      }
      toast(result.excluded === null || result.excluded === undefined
        ? 'Настройки сохранены'
        : `Настройки сохранены, исключено снимков: ${formatNumber(result.excluded)}`);
      if (folder && folder.startsWith(path)) setFilters({folder: ''});
      void queryClient.invalidateQueries({queryKey: ['folders']});
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: ['photos']});
      void queryClient.invalidateQueries({queryKey: qk.settings()});
    },
  });

  const pick = (path: string) => setFilters({folder: folder === path ? '' : path, album: 0});
  const data = folders.data;
  const trail = [{path: '', name: 'Все диски'}, ...(data?.trail ?? [])];

  return (
    <>
      <Crumbs items={trail.map(item => ({label: item.name, onClick: () => setCursor(item.path)}))} />
      <div className="folder-tree">
        {cursor && (
          <div className={`folder-row here${folder === cursor ? ' active' : ''}`}>
            <button className="folder-pick" type="button" onClick={() => pick(cursor)}>
              <span className="folder-name">Показать всё в этой папке</span>
            </button>
          </div>
        )}
        {data && (data.folders.length
          ? data.folders.map(item => (
              <div key={item.path} className={`folder-row${folder === item.path ? ' active' : ''}`}>
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
                {canEdit && (
                  <button
                    className="icon-button tiny"
                    type="button"
                    title="Исключить папку из сканера и галереи"
                    disabled={block.isPending}
                    onClick={() => {
                      if (!confirm(`Исключить «${item.path}» из сканера и галереи?\n`
                        + 'Файлы останутся на диске, но библиотека их больше не показывает.')) return;
                      block.mutate(item.path);
                    }}
                  >
                    ⊘
                  </button>
                )}
              </div>
            ))
          : <span className="person-meta">Вложенных папок нет</span>)}
      </div>
    </>
  );
}
