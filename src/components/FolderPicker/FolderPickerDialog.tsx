import {useEffect, useMemo, useState} from 'react';
import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {browseSource, getSources} from '../../services/endpoints/backends';
import {qk} from '../../services/queryKeys';
import {Button} from '../../ui/Button/Button';
import {Dialog, Sheet} from '../../ui/Dialog/Dialog';
import {HintLine} from '../../ui/Hint/Hint';
import './FolderPickerDialog.scss';

export interface PickedFolder {
  sourceId: string;
  sourceName: string;
  /** Ключ папки: «netcraze:/HDD/photo», «pc-x:D:\Фото». */
  path: string;
}

interface FolderPickerDialogProps {
  open: boolean;
  title: string;
  note?: string;
  confirmLabel?: string;
  /** Только этот источник: переносить файлы можно лишь внутри своего. */
  source?: string;
  onClose(): void;
  onPick(folder: PickedFolder): void;
}

/** Id источника из ключа папки или снимка. */
export const sourceOf = (key: string): string =>
  /^([a-z0-9][a-z0-9_-]{1,31}):/.exec(key)?.[1] ?? '';

const insidePath = (key: string) => key.replace(/^[a-z0-9][a-z0-9_-]{1,31}:/, '') || '/';

export function FolderPickerDialog({
  open, title, note, confirmLabel = 'Выбрать эту папку', source: locked, onClose, onPick,
}: FolderPickerDialogProps) {
  const sources = useQuery({queryKey: qk.sources(), queryFn: getSources, enabled: open});
  const list = useMemo(() => (sources.data?.sources ?? [])
    .filter(item => !locked || item.id === locked), [sources.data, locked]);
  const [sourceId, setSourceId] = useState('');
  const [path, setPath] = useState('');

  useEffect(() => {
    if (!open) return;
    const first = list[0]?.id ?? '';
    setSourceId(current => (current && list.some(item => item.id === current) ? current : first));
    setPath('');
  }, [open, list]);

  const source = list.find(item => item.id === sourceId) ?? list[0] ?? null;
  const browse = useQuery({
    queryKey: qk.browse(source?.id ?? '', path),
    queryFn: () => browseSource(source!.id, path),
    enabled: open && Boolean(source),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const data = browse.data?.source === source?.id ? browse.data : undefined;
  const entries = data?.directories ?? [];

  const pick = () => {
    if (!source || !data?.path) return;
    onPick({sourceId: source.id, sourceName: source.name, path: data.path});
  };

  const chooseSource = (next: string) => {
    setSourceId(next);
    setPath('');
  };

  return (
    <Dialog open={open} onClose={onClose} className="folder-picker-dialog">
      <Sheet
        title={title}
        note={note}
        onClose={onClose}
        footer={(
          <>
            <Button onClick={onClose}>Отмена</Button>
            <Button variant="primary" disabled={!data?.path} onClick={pick}>{confirmLabel}</Button>
          </>
        )}
      >
        <div className="folder-picker-device-row">
          <label>
            Источник
            <select value={source?.id ?? ''} disabled={Boolean(locked)}
              onChange={event => chooseSource(event.target.value)}>
              {list.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>

        {sources.data && !list.length && <HintLine>Нет источников — заведите их на «Сканировании».</HintLine>}

        {source && (
          <>
            <div className="path-toolbar">
              <Button small disabled={!data || data.parent === null} onClick={() => setPath(data?.parent ?? '')}>
                ↑
              </Button>
              <code>{data?.path ? insidePath(data.path) : source.name}</code>
            </div>
            <div className="folder-list folder-picker-list">
              {browse.isError
                ? <div className="folder-empty">Источник не открылся: {(browse.error as Error).message}</div>
                : !data
                  ? <div className="folder-empty">Загрузка…</div>
                  : entries.length
                    ? entries.map(entry => (
                        <button
                          key={entry.path}
                          type="button"
                          className="folder-picker-entry"
                          onClick={() => setPath(entry.path)}
                        >
                          <span>📁</span>
                          <span>{entry.name || entry.path}</span>
                        </button>
                      ))
                    : <div className="folder-empty">Нет вложенных папок</div>}
            </div>
          </>
        )}
      </Sheet>
    </Dialog>
  );
}
