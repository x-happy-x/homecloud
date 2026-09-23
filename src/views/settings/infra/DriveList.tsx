import {formatNumber} from '../../../lib/format';
import type {DeviceDrive} from '../../../services/endpoints/backends';
import {Icon} from '../../../ui/Icon/Icon';
import {Progress} from '../../../ui/Progress/Progress';

const GIB = 1073741824;

/**
 * Диски компьютера и место на них. Показываются у источника «Диск
 * устройства»: это его содержимое, а не свойство вычислителя. Диски, где
 * лежат папки источника, отмечены.
 */
export function DriveList({drives, used = []}: {drives: DeviceDrive[]; used?: string[]}) {
  if (!drives.length) return <p className="fact-empty">Диски не найдены</p>;
  const marked = new Set(used.map(path => path.slice(0, 3).toUpperCase()));
  return (
    <ul className="drive-list">
      {drives.map(drive => {
        const share = drive.total && drive.free != null ? 1 - drive.free / drive.total : null;
        const inUse = marked.has(drive.path.slice(0, 3).toUpperCase());
        return (
          <li key={drive.path} className={inUse ? 'used' : undefined}
            title={inUse ? `${drive.path} — здесь папки источника` : drive.path}>
            <Icon name="drive" size={16} />
            <span className="drive-name">{drive.name || drive.path}</span>
            <span className="drive-free">
              {drive.free == null ? '—' : `${formatNumber(Math.round(drive.free / GIB))} ГБ свободно`}
            </span>
            {share !== null && <Progress value={share} className={`drive-bar${share > .9 ? ' full' : ''}`} />}
          </li>
        );
      })}
    </ul>
  );
}
