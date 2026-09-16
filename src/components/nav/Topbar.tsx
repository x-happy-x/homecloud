import {useRef} from 'react';
import './Topbar.scss';
import {useMutation} from '@tanstack/react-query';
import {undo} from '../../services/endpoints/catalog';
import {queryClient} from '../../services/queryClient';
import {useStickyHeader} from '../../hooks/useStickyHeader';
import {useStore} from '../../store';
import {Icon} from '../../ui/Icon/Icon';
import {IconButton} from '../../ui/IconButton/IconButton';
import {NotifBell} from '../notifications/NotifBell';
import {AccountMenu} from './AccountMenu';

export interface TopbarProps {
  /** Подсказка поля поиска; null — на этом экране искать нечего, поля нет. */
  searchPlaceholder: string | null;
}

export function Topbar({searchPlaceholder}: TopbarProps) {
  const stuck = useStickyHeader();
  const query = useStore(state => state.filters.query);
  const setQuery = useStore(state => state.setQuery);
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const input = useRef<HTMLInputElement>(null);

  const undoLast = useMutation({
    mutationFn: undo,
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast('Последнее действие отменено', 'success');
    },
  });

  return (
    <header className={`topbar${stuck ? ' stuck' : ''}`}>
      {searchPlaceholder !== null && (
        <label className="search">
          <Icon name="search" />
          <input
            ref={input}
            id="searchInput"
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            autoComplete="off"
            aria-label="Поиск"
            onChange={event => setQuery(event.target.value)}
          />
          {query && (
            <button className="clear" type="button" aria-label="Очистить поиск"
              onClick={() => { setQuery(''); input.current?.focus(); }}>
              <Icon name="close" />
            </button>
          )}
          <kbd>Ctrl K</kbd>
        </label>
      )}

      <div className="topbar-actions">
        {canEdit && (
          <IconButton
            icon="undo"
            label="Отменить последнее действие"
            disabled={undoLast.isPending}
            onClick={() => undoLast.mutate()}
          />
        )}
        <NotifBell />
        <AccountMenu />
      </div>
    </header>
  );
}
