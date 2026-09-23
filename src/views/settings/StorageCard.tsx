import {useMutation, useQuery} from '@tanstack/react-query';
import {fileSize, formatNumber} from '../../lib/format';
import {
  cleanStorage, getStorage, type StoragePart, type StorageSource,
} from '../../services/endpoints/backends';
import {confirmAction} from '../../services/dialogs';
import {queryClient} from '../../services/queryClient';
import {qk} from '../../services/queryKeys';
import {useStore} from '../../store';
import {Button} from '../../ui/Button/Button';
import {Icon} from '../../ui/Icon/Icon';
import {Progress} from '../../ui/Progress/Progress';

const PARTS: Array<{part: StoragePart; label: string; note: string; confirm: string}> = [
  {part: 'thumbs', label: 'Превью', note: 'пересоздадутся при следующем обходе источника',
    confirm: 'Удалить превью сетки? Они пересоздадутся при следующем сканировании источника; до '
      + 'этого сетка будет брать картинки прямо из источника.'},
  {part: 'analysis', label: 'Анализ', note: 'индекс, OCR, описания, 18+, речь, дубликаты',
    confirm: 'Удалить визуальный индекс, текст, описания, оценки 18+, расшифровки речи и хеши '
      + 'дубликатов? Их придётся считать заново.'},
  {part: 'faces', label: 'Лица', note: 'вместе с именами на этих лицах',
    confirm: 'Удалить найденные лица вместе с назначенными им именами? Людей из других '
      + 'источников это не коснётся.'},
  {part: 'catalog', label: 'Всё', note: 'снимки исчезнут из галереи до нового сканирования',
    confirm: 'Удалить с сервера всё, что известно об этом источнике: снимки, превью, лица, анализ, '
      + 'места в альбомах? Сами файлы в источнике не трогаются.'},
];

/** Что сервер хранит по каждому источнику, и кнопки, чтобы это почистить. */
export function StorageCard() {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const storage = useQuery({queryKey: qk.storage(), queryFn: getStorage});

  const clean = useMutation({
    mutationFn: ({source, part}: {source: string; part: StoragePart}) => cleanStorage(source, [part]),
    onSuccess: data => {
      queryClient.setQueryData(qk.storage(), data);
      void queryClient.invalidateQueries({queryKey: qk.sources()});
      void queryClient.invalidateQueries({queryKey: ['photos']});
      void queryClient.invalidateQueries({queryKey: ['state']});
      void queryClient.invalidateQueries({queryKey: ['folders']});
      toast('Удалено', 'success');
    },
    onError: (error: Error) => toast(error.message, 'error'),
  });

  const data = storage.data;
  const used = data ? 1 - data.disk_free / Math.max(1, data.disk_total) : null;

  const onClean = async (item: StorageSource, part: (typeof PARTS)[number]) => {
    if (await confirmAction(part.confirm, {
      title: `${part.label} · ${item.name}`, confirmLabel: 'Удалить', danger: true,
    })) clean.mutate({source: item.id, part: part.part});
  };

  return (
    <section className="settings-card" aria-labelledby="settings-storage">
      <header className="settings-card-head">
        <span className="settings-card-icon"><Icon name="drive" /></span>
        <div className="settings-card-title">
          <h2 id="settings-storage">Данные по источникам</h2>
          <p>
            Всё посчитанное — превью, лица, описания — хранится на сервере HomeCloud, а не в
            источниках. Здесь видно, сколько места занимает каждый, и это можно почистить.
          </p>
        </div>
      </header>
      <div className="storage-body">
        {!data
          ? <p className="fact-empty">{storage.isError ? 'Сервер не ответил' : 'Считаю…'}</p>
          : (
            <>
              <div className="storage-disk">
                <span>Каталог {fileSize(data.catalog_bytes)} · свободно на сервере {fileSize(data.disk_free)} из {fileSize(data.disk_total)}</span>
                {used !== null && <Progress value={used} className={used > .9 ? 'drive-bar full' : 'drive-bar'} />}
              </div>
              {data.sources.map(item => (
                <article key={item.id || 'none'} className="storage-source">
                  <header>
                    <strong>{item.name}</strong>
                    {!item.known && <small>источник удалён или не заведён</small>}
                  </header>
                  <div className="storage-metrics">
                    <span><b>{formatNumber(item.photos)}</b>фото</span>
                    <span><b>{formatNumber(item.videos)}</b>видео</span>
                    <span><b>{formatNumber(item.faces)}</b>лиц</span>
                    <span><b>{formatNumber(item.named_faces)}</b>с именем</span>
                    <span><b>{formatNumber(item.thumbs)}</b>превью · {fileSize(item.thumb_bytes)}</span>
                    <span><b>{formatNumber(item.analysis)}</b>в индексе</span>
                    {item.missing > 0 && <span><b>{formatNumber(item.missing)}</b>пропало с диска</span>}
                  </div>
                  {canEdit && (
                    <div className="storage-actions">
                      {PARTS.map(part => (
                        <Button key={part.part} small variant={part.part === 'catalog' ? 'danger' : undefined}
                          title={part.note} disabled={clean.isPending}
                          onClick={() => void onClean(item, part)}>
                          <Icon name="trash" size={14} />
                          <span>{part.label}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </>
          )}
      </div>
    </section>
  );
}
