import {useEffect, useRef, useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './VideoToolsDialog.scss';
import {fileSize, parseTimecode, timecode} from '../../../lib/format';
import {
  cancelVideoJob, getVideoJob, probeVideo, startVideoJob,
  type VideoJob, type VideoOp, type VideoProbe,
} from '../../../services/endpoints/video';
import {queryClient} from '../../../services/queryClient';
import {qk} from '../../../services/queryKeys';
import {useStore} from '../../../store';
import type {PhotoCard} from '../../../types/api';
import {Button} from '../../../ui/Button/Button';
import {Dialog, Sheet} from '../../../ui/Dialog/Dialog';
import {Icon} from '../../../ui/Icon/Icon';
import {Progress} from '../../../ui/Progress/Progress';

const HEIGHTS = [720, 480, 360];
const ANGLES = [{angle: 90, label: '90° по часовой'}, {angle: 180, label: '180°'},
  {angle: 270, label: '90° против часовой'}];
const OP_TITLES: Record<VideoOp, string> = {
  replace: 'Перекодирование в источнике',
  trim: 'Фрагмент',
  compress: 'Сжатая копия',
  rotate: 'Поворот',
  frame: 'Кадр',
  audio: 'Звук в MP3',
};

export interface VideoToolsDialogProps {
  photo: PhotoCard | null;
  /** Где сейчас плеер — для кадра и границ фрагмента. */
  currentTime(): number;
  onClose(): void;
  /** Ролик заменён в источнике: путь сменился, просмотр надо закрыть. */
  onReplaced(): void;
}

/** Обработка ролика через ffmpeg на ядре: перекодирование, фрагмент, сжатие, кадр, звук. */
export function VideoToolsDialog({photo, currentTime, onClose, onReplaced}: VideoToolsDialogProps) {
  const toast = useStore(state => state.toast);
  const path = photo?.path ?? '';
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [start, setStart] = useState('0:00');
  const [end, setEnd] = useState('0:30');
  const [height, setHeight] = useState(720);

  const probe = useQuery({
    queryKey: qk.videoProbe(path),
    queryFn: () => probeVideo(path),
    enabled: Boolean(path),
    staleTime: 60_000,
    retry: false,
  });
  const duration = probe.data?.duration || photo?.duration || 0;

  useEffect(() => {
    if (!photo) return;
    const now = currentTime();
    setStart(timecode(now));
    setEnd(timecode(Math.min(now + 30, photo.duration || now + 30)));
    setConfirmReplace(false);
    setJobs([]);
    // Окно открылось на другом ролике — всё начинаем сначала.
  }, [path]);

  const launch = useMutation({
    mutationFn: ({op, params}: {op: VideoOp; params?: Record<string, number>}) =>
      startVideoJob(path, op, params),
    onSuccess: job => setJobs(current => [job, ...current]),
    onError: error => toast(error instanceof Error ? error.message : 'Не удалось запустить'),
  });

  const replaceRunning = jobs.some(job => job.op === 'replace'
    && (job.status === 'queued' || job.status === 'running'));

  const updateJob = (next: VideoJob) => {
    setJobs(current => current.map(job => job.id === next.id ? next : job));
  };

  const cutFragment = () => {
    const from = parseTimecode(start);
    const to = parseTimecode(end);
    if (from == null || to == null) {
      toast('Время — в виде 1:23 или 1:02:03');
      return;
    }
    if (to <= from) {
      toast('Конец фрагмента должен быть позже начала');
      return;
    }
    launch.mutate({op: 'trim', params: {start: from, end: to}});
  };

  return (
    <Dialog open={Boolean(photo)} onClose={onClose}>
      <Sheet
        className="video-tools"
        eyebrow="ffmpeg на ядре"
        title="Обработка видео"
        note={photo?.filename}
        onClose={onClose}
      >
        <ProbeCard probe={probe.data} loading={probe.isLoading}
          error={probe.error instanceof Error ? probe.error.message : ''} />

        <section className="video-tools-section">
          <h3>Перекодировать в источнике</h3>
          <p>
            Ролик станет MP4 (H.264 и AAC) и будет играть в любом браузере. Новый файл ляжет
            на место старого, оригинал уйдёт в корзину источника. Лица, речь и альбомы
            останутся за роликом.
            {probe.data?.subtitles ? ' Субтитры внутри файла не переносятся.' : ''}
          </p>
          {confirmReplace ? (
            <div className="video-tools-confirm">
              <span>Заменить файл в источнике?</span>
              <Button variant="primary" small disabled={launch.isPending}
                onClick={() => {
                  setConfirmReplace(false);
                  launch.mutate({op: 'replace'});
                }}>
                Заменить
              </Button>
              <Button small onClick={() => setConfirmReplace(false)}>Отмена</Button>
            </div>
          ) : (
            <Button variant={probe.data && !probe.data.browser ? 'primary' : 'default'}
              disabled={replaceRunning || launch.isPending}
              onClick={() => setConfirmReplace(true)}>
              <Icon name="process" />Перекодировать…
            </Button>
          )}
        </section>

        <section className="video-tools-section">
          <h3>Скачать</h3>
          <div className="video-tools-grid">
            <div className="video-tools-card">
              <strong>Фрагмент</strong>
              <div className="video-tools-range">
                <label>
                  <span>С</span>
                  <input value={start} onChange={event => setStart(event.target.value)}
                    inputMode="numeric" aria-label="Начало фрагмента" />
                </label>
                <button type="button" className="video-tools-now" title="Текущий момент плеера"
                  onClick={() => setStart(timecode(currentTime()))}>сейчас</button>
                <label>
                  <span>по</span>
                  <input value={end} onChange={event => setEnd(event.target.value)}
                    inputMode="numeric" aria-label="Конец фрагмента" />
                </label>
                <button type="button" className="video-tools-now" title="Текущий момент плеера"
                  onClick={() => setEnd(timecode(currentTime()))}>сейчас</button>
              </div>
              <Button small onClick={cutFragment}>Скачать фрагмент</Button>
            </div>

            <div className="video-tools-card">
              <strong>Сжатая копия</strong>
              <div className="video-tools-chips" role="radiogroup" aria-label="Высота">
                {HEIGHTS.map(value => (
                  <button key={value} type="button" role="radio" aria-checked={height === value}
                    onClick={() => setHeight(value)}>{value}p</button>
                ))}
              </div>
              <Button small onClick={() => launch.mutate({op: 'compress', params: {height}})}>
                Скачать {height}p
              </Button>
            </div>

            <div className="video-tools-card">
              <strong>Поворот</strong>
              <div className="video-tools-chips">
                {ANGLES.map(item => (
                  <button key={item.angle} type="button"
                    onClick={() => launch.mutate({op: 'rotate', params: {angle: item.angle}})}>
                    {item.label}
                  </button>
                ))}
              </div>
              <small>Скачается повёрнутая копия</small>
            </div>

            <div className="video-tools-card">
              <strong>Кадр и звук</strong>
              <Button small onClick={() => launch.mutate({op: 'frame', params: {time: currentTime()}})}>
                <Icon name="photos" />Кадр {timecode(currentTime())} в JPEG
              </Button>
              <Button small disabled={probe.data ? !probe.data.audio.length : false}
                onClick={() => launch.mutate({op: 'audio'})}>
                <Icon name="mic" />Звук в MP3
              </Button>
            </div>
          </div>
          {duration > 0 && <small className="video-tools-note">Длина ролика — {timecode(duration)}</small>}
        </section>

        {jobs.length > 0 && (
          <section className="video-tools-section">
            <h3>Задания</h3>
            <ul className="video-tools-jobs">
              {jobs.map(job => (
                <JobRow key={job.id} job={job} onUpdate={updateJob}
                  onReplaced={next => {
                    void queryClient.invalidateQueries();
                    toast(`Ролик перекодирован: ${fileName(next.result?.new)}`);
                    onReplaced();
                  }} />
              ))}
            </ul>
          </section>
        )}
      </Sheet>
    </Dialog>
  );
}

function ProbeCard({probe, loading, error}: {probe?: VideoProbe; loading: boolean; error: string}) {
  if (loading) {
    return <div className="video-tools-probe"><Progress /><span>Ядро смотрит, что внутри файла…</span></div>;
  }
  if (error) return <div className="video-tools-probe error">{error}</div>;
  if (!probe) return null;
  const video = probe.video;
  const parts = [
    containerName(probe.container),
    video ? `${video.codec.toUpperCase()} ${video.width}×${video.height}` : 'без видео',
    video?.fps ? `${Math.round(video.fps)} к/с` : '',
    probe.audio.length ? probe.audio.map(track => track.codec.toUpperCase()).join(', ') : 'без звука',
    probe.duration ? timecode(probe.duration) : '',
    probe.size ? fileSize(probe.size) : '',
  ].filter(Boolean);
  return (
    <div className={['video-tools-probe', probe.browser ? 'ok' : 'warn'].join(' ')}>
      <span className="video-tools-badge">
        <Icon name={probe.browser ? 'check' : 'info'} />
        {probe.browser ? 'Браузер сыграет' : 'Браузер может не сыграть'}
      </span>
      <span>{parts.join(' · ')}</span>
      <small>Ядро: {probe.core}</small>
    </div>
  );
}

function JobRow({job, onUpdate, onReplaced}: {
  job: VideoJob;
  onUpdate(job: VideoJob): void;
  onReplaced(job: VideoJob): void;
}) {
  const active = job.status === 'queued' || job.status === 'running';
  const downloaded = useRef(false);
  const reported = useRef(false);

  const poll = useQuery({
    queryKey: qk.videoJob(job.id),
    queryFn: () => getVideoJob(job.id),
    refetchInterval: 1000,
    enabled: active,
  });

  useEffect(() => {
    if (poll.data) onUpdate(poll.data);
  }, [poll.data]);

  // Готовый файл скачивается сам один раз; ссылка остаётся в списке.
  useEffect(() => {
    if (job.status !== 'done') return;
    if (job.download && !downloaded.current) {
      downloaded.current = true;
      const link = document.createElement('a');
      link.href = job.download;
      link.download = job.result?.name ?? '';
      link.click();
    }
    if (job.op === 'replace' && !reported.current) {
      reported.current = true;
      onReplaced(job);
    }
  }, [job.status]);

  const cancel = useMutation({mutationFn: () => cancelVideoJob(job.id), onSuccess: onUpdate});

  return (
    <li className={`video-tools-job ${job.status}`}>
      <div className="video-tools-job-head">
        <strong>{OP_TITLES[job.op] ?? job.op}</strong>
        <span>{statusText(job)}</span>
        {active && (
          <Button small variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Отменить
          </Button>
        )}
        {job.status === 'done' && job.download && (
          <a className="video-tools-download" href={job.download} download={job.result?.name ?? ''}>
            <Icon name="openExternal" />{job.result?.name}
            {job.result?.size ? ` · ${fileSize(job.result.size)}` : ''}
          </a>
        )}
      </div>
      {active && <Progress value={job.status === 'running' && job.progress > 0 ? job.progress : null} />}
      {job.status === 'error' && <p className="video-tools-error">{job.error}</p>}
    </li>
  );
}

function statusText(job: VideoJob): string {
  if (job.status === 'running') {
    return job.progress > 0 ? `${job.message} · ${Math.round(job.progress * 100)}%` : job.message;
  }
  if (job.status === 'queued') return 'В очереди на ядре';
  if (job.status === 'done') return job.op === 'replace' ? 'Готово, файл заменён' : 'Готово';
  if (job.status === 'cancelled') return 'Отменено';
  return 'Ошибка';
}

function containerName(format: string): string {
  if (format.includes('matroska')) return 'MKV/WebM';
  if (format.includes('mp4') || format.includes('mov')) return 'MP4/MOV';
  return format.split(',')[0].toUpperCase();
}

function fileName(key?: string): string {
  return (key ?? '').split(/[\\/]/).pop() ?? '';
}
