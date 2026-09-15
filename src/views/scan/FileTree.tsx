import {Fragment, type CSSProperties} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import {formatNumber} from '../../lib/format';
import {getTree, setExclusions, type TreeCounts} from '../../services/endpoints/backends';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {HintLine} from '../../ui/Hint/Hint';

// Отступ уровня — через CSSOM. Инлайновый style="" в innerHTML на проде срезала
// политика безопасности, и дерево рисовалось плоским.
const depthStyle = (depth: number) => ({'--depth': depth}) as CSSProperties;

const FILE_STATES: Record<string, string> = {
  new: 'новый', changed: 'изменился', missing: 'пропал', excluded: 'исключён', known: '',
};

const baseName = (path: string) => path.split(/[\/]/).filter(Boolean).pop() ?? path;

function Counters({counts}: {counts: TreeCounts}) {
  const badge = (value: number | undefined, kind: string, title: string) => value
    ? <span className={`tree-badge ${kind}`} title={title}>{formatNumber(value)}</span>
    : null;
  return (
    <span className="tree-counts">
      <span className="tree-total">{formatNumber(counts.subtree ?? counts.files ?? 0)}</span>
      {badge(counts.new, 'new', 'новых с прошлого раза')}
      {badge(counts.changed, 'changed', 'изменились')}
      {badge(counts.missing, 'missing', 'пропали с диска')}
      {badge(counts.excluded, 'off', 'исключено')}
    </span>
  );
}

export interface FileTreeProps {
  deviceId: string;
  /** Идёт опись: обновлять корень ещё раз нельзя. */
  busy: boolean;
  onCollect(roots: string[]): void;
}

/** Что нашла опись: папки по уровням, откуда можно исключить лишнее. */
export function FileTree({deviceId, busy, onCollect}: FileTreeProps) {
  const open = useStore(state => state.scan.treeOpen);
  const toggle = useStore(state => state.toggleTreeNode);
  const base = useQuery({queryKey: qk.tree(deviceId, ''), queryFn: () => getTree(deviceId, '')});
  const roots = base.data?.roots ?? [];

  if (!roots.length) {
    return <HintLine>Соберите список — появится дерево папок, откуда можно исключить лишнее.</HintLine>;
  }

  return (
    <div className="tree">
      {roots.map(root => (
        <div key={root.path} className="tree-root">
          <div className={`tree-row root${open.has(root.path) ? ' open' : ''}`} style={depthStyle(0)}>
            <button className="tree-toggle" type="button" aria-label="Раскрыть" onClick={() => toggle(root.path)}>
              {open.has(root.path) ? '▾' : '▸'}
            </button>
            <span className="tree-name" title={root.path}>{root.path}</span>
            <Counters counts={{...root, subtree: root.files}} />
            <Button small disabled={busy} onClick={() => onCollect([root.path])}>Обновить</Button>
          </div>
          {open.has(root.path) && <TreeLevel deviceId={deviceId} path={root.path} depth={1} />}
        </div>
      ))}
    </div>
  );
}

function TreeLevel({deviceId, path, depth}: {deviceId: string; path: string; depth: number}) {
  const open = useStore(state => state.scan.treeOpen);
  const toggle = useStore(state => state.toggleTreeNode);
  const toast = useStore(state => state.toast);

  const node = useQuery({queryKey: qk.tree(deviceId, path), queryFn: () => getTree(deviceId, path)});

  const exclusion = useMutation({
    mutationFn: (item: {path: string; off: boolean}) =>
      setExclusions(deviceId, item.off ? {remove: [item.path]} : {add: [item.path]}),
    onSuccess: async (_data, item) => {
      await queryClient.invalidateQueries({queryKey: ['tree', deviceId]});
      toast(item.off ? 'Вернули в обработку' : 'Исключено из обработки');
    },
  });

  if (node.isError) {
    return <div className="tree-row more" style={depthStyle(depth)}>{(node.error as Error).message}</div>;
  }
  if (!node.data) {
    return <div className="tree-row loading" style={depthStyle(depth)}>Загрузка…</div>;
  }

  const offButton = (item: {path: string; off: boolean}) => (
    <Button small disabled={exclusion.isPending} onClick={() => exclusion.mutate(item)}>
      {item.off ? 'вернуть' : 'исключить'}
    </Button>
  );

  return (
    <>
      {node.data.directories.map(item => (
        <Fragment key={item.path}>
          <div className={`tree-row${item.off ? ' off' : ''}`} style={depthStyle(depth)}>
            <button className="tree-toggle" type="button" aria-label="Раскрыть" onClick={() => toggle(item.path)}>
              {open.has(item.path) ? '▾' : '▸'}
            </button>
            <span className="tree-name" title={item.path}>{item.name}</span>
            <Counters counts={item} />
            {offButton(item)}
          </div>
          {open.has(item.path) && <TreeLevel deviceId={deviceId} path={item.path} depth={depth + 1} />}
        </Fragment>
      ))}
      {node.data.files.map(item => (
        <div key={item.path} className={`tree-row file${item.off ? ' off' : ''}`} style={depthStyle(depth)}>
          <span className="tree-dot" />
          <span className="tree-name" title={item.path}>{item.name ?? baseName(item.path)}</span>
          <span className="tree-counts">
            <span className={`tree-state ${item.state ?? ''}`}>{FILE_STATES[item.state ?? ''] ?? ''}</span>
          </span>
          {offButton(item)}
        </div>
      ))}
      {node.data.truncated && (
        <div className="tree-row more" style={depthStyle(depth)}>
          показаны первые {formatNumber(node.data.files.length)} файлов
        </div>
      )}
    </>
  );
}
