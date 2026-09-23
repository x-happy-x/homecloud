import type {Device, Source} from '../services/endpoints/backends';

/** Путь папки внутри источника без его id: «/HDD/photo», «D:\Фото». */
export const insidePath = (key: string) => key.replace(/^[a-z0-9][a-z0-9_-]{1,31}:/, '') || '/';

/** Путь источника коротко: последняя папка, полный путь — в подсказке. */
export const shortPath = (path: string) =>
  insidePath(path).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

/** Где источник: адрес и шара у сетевых, устройство у дисков. */
export function sourceAddress(source: Source, devices: Pick<Device, 'id' | 'name'>[]): string {
  if (source.type === 'device') {
    const device = devices.find(item => item.id === source.device);
    return `диски ${device?.name ?? source.device}`;
  }
  if (source.type === 'local') return source.path;
  const scheme = {smb: 'smb', sftp: 'sftp', ftp: source.secure ? 'ftps' : 'ftp',
    webdav: source.secure ? 'https' : 'http'}[source.type] ?? source.type;
  const user = source.user ? `${source.user}@` : '';
  const tail = source.type === 'smb' ? `/${source.share}` : source.path;
  return `${scheme}://${user}${source.host}${tail ?? ''}`;
}

/** Ядро для задания по источнику: у своего диска — его хозяин, иначе основное в сети. */
export function pickCore(devices: Device[], source: Source | null): Device | null {
  const ready = devices.filter(device => device.online && !device.legacy);
  if (source?.type === 'device') {
    const own = ready.find(device => device.id === source.device);
    if (own) return own;
  }
  return ready.find(device => device.primary) ?? ready[0] ?? null;
}
