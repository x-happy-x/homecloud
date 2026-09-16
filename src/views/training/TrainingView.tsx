import {useCallback, useEffect, useMemo, useState} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './TrainingView.scss';
import {useKeyboardShortcuts} from '../../hooks/useKeyboardShortcuts';
import {copyText} from '../../lib/clipboard';
import {formatNumber, plural, runMoment} from '../../lib/format';
import {saveSettings} from '../../services/endpoints/settings';
import {
  activateRouterModel, cancelRouterBatch, clearRouterSkips, getRouterBatches, getRouterReview,
  getRouterSummary, getRouterTaggers, importRouterAnswer, routerExportUrl, runRouter, saveRouterLabel,
  skipRouterPhoto, startRouterTagging, stopRouterJob,
  type RouterBatch, type RouterJob, type RouterLabel, type RouterQueueItem, type RouterSummary,
  type RouterTagger, type TaggerId,
} from '../../services/endpoints/training';
import {photoMediaUrl, viewerSize} from '../../services/media';
import {qk} from '../../services/queryKeys';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import type {TrainingTab} from '../../store/slices/training';
import {Button} from '../../ui/Button/Button';
import {Chip, ToggleChip} from '../../ui/Chip/Chip';
import {EmptyState} from '../../ui/EmptyState/EmptyState';
import {Icon} from '../../ui/Icon/Icon';
import {Progress} from '../../ui/Progress/Progress';
import {SectionHead} from '../../ui/ViewHeader/ViewHeader';

/** Пока проверок меньше дюжины, обучать не на чем. */
const MIN_REVIEWS = 12;
const BATCH_SIZES = [1, 3, 5, 10, 15, 20];
const QUEUE_PAGE = 30;

const refreshRouter = () => {
  void queryClient.invalidateQueries({queryKey: ['router-summary']});
  void queryClient.invalidateQueries({queryKey: ['router-review']});
  void queryClient.invalidateQueries({queryKey: ['router-batches']});
};

const photos = (count: number) => `${formatNumber(count)} ${plural(count, 'снимок', 'снимка', 'снимков')}`;

/** Названия разметчиков до того, как пришёл их список. */
const TAGGER_TITLES: Record<TaggerId, string> = {ram_plus: 'RAM++', qwen: 'Qwen3-VL-2B', lmstudio: 'LM Studio'};
const TAG_COUNTS = [20, 100, 500, 1000];

const percent = (value: number | null | undefined) => value == null ? '—' : `${Math.round(value * 100)}%`;

export function TrainingView({job}: {job?: RouterJob}) {
  const tab = useStore(state => state.training.tab);
  const setTab = useStore(state => state.setTrainingTab);
  const summaryQuery = useQuery({queryKey: qk.routerSummary(), queryFn: getRouterSummary});
  const summary = summaryQuery.data ?? {};

  const tabs: Array<[TrainingTab, string, number | undefined]> = [
    ['review', 'Разметка', summary.pending],
    ['batch', 'Через нейросеть', summary.pending_batches],
    ['models', 'Модели', summary.models?.length],
  ];

  return (
    <section className="analysis-panel training-view">
      <SectionHead
        title="Обучение"
        note="Модель раскладывает снимки по темам: люди, пейзаж, документ, скриншот… Отметьте, что на снимке на самом деле, — на этих ответах обучается своя, более точная версия."
      />

      {summaryQuery.data ? <Overview summary={summary} job={job} /> : <div className="training-overview loading" />}

      <div className="training-tabs" role="tablist" aria-label="Разделы обучения">
        {tabs.map(([id, label, count]) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
            {count ? <small>{formatNumber(count)}</small> : null}
          </Chip>
        ))}
      </div>

      {tab === 'review' && <ReviewPanel summary={summary} />}
      {tab === 'batch' && <BatchPanel summary={summary} job={job} />}
      {tab === 'models' && <ModelsPanel summary={summary} job={job} />}
    </section>
  );
}

/** Что сейчас ставит метки и сколько осталось до следующей версии. */
function Overview({summary, job}: {summary: RouterSummary; job?: RouterJob}) {
  const reviewed = summary.reviewed ?? 0;
  const active = summary.models?.find(model => model.version === summary.active_version);
  const f1 = active?.metrics?.macro_f1;
  const toTrain = Math.max(0, MIN_REVIEWS - reviewed);
  const toAuto = summary.auto_train ? Math.max(0, (summary.auto_train_every ?? 50) - (summary.new_since_training ?? 0)) : null;
  const running = Boolean(job?.active);
  const fraction = job?.total ? (job.completed ?? 0) / job.total : null;

  return (
    <div className="training-overview">
      <div className="training-card source">
        <span className="training-label">Сейчас метки ставит</span>
        <b>{summary.source === 'trained' ? `Своя модель ${summary.active_version}` : 'Общая модель (zero-shot)'}</b>
        <small>
          {summary.source === 'trained' && f1 != null
            ? `Точность F1 ${Math.round(f1 * 100)}% · ${summary.embedding_model ?? ''}`
            : `${summary.embedding_model ?? ''} · без обучения на ваших снимках`}
        </small>
      </div>
      <div className="training-card">
        <span className="training-label">Проверено</span>
        <b>{formatNumber(reviewed)}</b>
        <small>
          вручную {formatNumber(summary.human_reviewed ?? 0)} · похожих {formatNumber(summary.propagated ?? 0)}
          {' · '}нейросетью {formatNumber((summary.ai_reviewed ?? 0) + (summary.local_reviewed ?? 0))}
        </small>
        <Progress value={toTrain ? reviewed / MIN_REVIEWS : toAuto === null ? 1
          : 1 - toAuto / (summary.auto_train_every ?? 50)} />
        <small className="training-next">
          {toTrain
            ? `Ещё ${photos(toTrain)} — и можно обучить первую версию`
            : toAuto === null ? 'Можно обучить новую версию во вкладке «Модели»'
            : toAuto === 0 ? 'Новая версия обучится после следующей проверки'
            : `До автообучения ещё ${photos(toAuto)}`}
        </small>
      </div>
      <div className="training-card">
        <span className="training-label">В очереди</span>
        <b>{formatNumber(summary.pending ?? 0)}</b>
        <small>
          из {formatNumber(summary.predicted ?? 0)} с метками
          {summary.skipped ? ` · пропущено ${formatNumber(summary.skipped)}` : ''}
        </small>
      </div>
      {(running || job?.status === 'error') && <JobCard job={job!} fraction={fraction} />}
    </div>
  );
}

function JobCard({job, fraction}: {job: RouterJob; fraction: number | null}) {
  const canEdit = useStore(state => state.session.canEdit);
  const running = Boolean(job.active);
  const tagging = job.action === 'tag';
  const title = tagging
    ? `${job.scope === 'reviewed' ? 'Проверка' : 'Разметка'} · ${TAGGER_TITLES[job.engine ?? 'ram_plus'] ?? job.engine}`
    : job.action === 'train' ? 'Обучение новой версии' : 'Пересчёт меток';
  const stop = useMutation({mutationFn: stopRouterJob});

  let note = job.error || 'идёт в фоне';
  if (!job.error && tagging) {
    note = job.status === 'preparing' ? 'загружаю модель…' : `${formatNumber(job.completed ?? 0)} из ${formatNumber(job.total ?? 0)}`;
    if (job.accepted) note += ` · сохранено ${formatNumber(job.accepted)}`;
    if (job.errors) note += ` · не открылось ${formatNumber(job.errors)}`;
  } else if (!job.error && job.loss != null) {
    note = `ошибка модели (loss) ${job.loss}`;
  }

  return (
    <div className={`training-card job${job.status === 'error' ? ' error' : ''}`}>
      <span className="training-label">{title}</span>
      <b>{job.status === 'error' ? 'Ошибка' : fraction === null ? '…' : `${Math.floor(fraction * 100)}%`}</b>
      <small>{note}</small>
      {running && <Progress value={fraction} />}
      {running && tagging && canEdit && (
        <Button small disabled={stop.isPending} onClick={() => stop.mutate()}>
          {stop.isPending || stop.isSuccess ? 'Останавливаю…' : 'Остановить'}
        </Button>
      )}
    </div>
  );
}

/* ---------- ручная разметка ---------- */

function ReviewPanel({summary}: {summary: RouterSummary}) {
  const canEdit = useStore(state => state.session.canEdit);
  const adultMode = useStore(state => state.prefs.adultMode);
  const index = useStore(state => state.training.index);
  const setIndex = useStore(state => state.setTrainingIndex);
  const drafts = useStore(state => state.training.drafts);
  const setDraft = useStore(state => state.setDraft);
  const dropDraft = useStore(state => state.dropDraft);
  const propagate = useStore(state => state.training.propagate);
  const setPropagate = useStore(state => state.setPropagate);
  const toast = useStore(state => state.toast);
  const [search, setSearch] = useState('');
  /** Сохранённые и пропущенные — прячем сразу, не дожидаясь перезапроса очереди. */
  const [done, setDone] = useState<Set<string>>(() => new Set());

  const reviewQuery = useQuery({
    queryKey: qk.routerReview(adultMode === 'hide'),
    queryFn: () => getRouterReview(adultMode === 'hide', QUEUE_PAGE),
  });
  const queue = useMemo(
    () => (reviewQuery.data?.photos ?? []).filter(photo => !done.has(photo.path)),
    [reviewQuery.data, done],
  );
  const position = Math.min(index, Math.max(0, queue.length - 1));
  const item: RouterQueueItem | undefined = queue[position];
  const labels = summary.labels ?? [];

  // Очередь подходит к концу — подтягиваем свежую.
  useEffect(() => {
    // Только если прошлая страница пришла полной: иначе на сервере больше нечего взять.
    const full = (reviewQuery.data?.photos.length ?? 0) >= QUEUE_PAGE;
    if (full && queue.length < 5 && !reviewQuery.isFetching) void reviewQuery.refetch();
  }, [queue.length, reviewQuery]);

  const selected = useMemo(() => {
    if (!item) return new Set<string>();
    // Подсказки общей модели заранее не отмечаем: она чаще ошибается, чем угадывает.
    return new Set(drafts.get(item.path) ?? (item.router_trained ? item.router_suggested ?? [] : []));
  }, [item, drafts]);

  const finish = (path: string) => {
    setDone(current => new Set(current).add(path));
    dropDraft(path);
    void queryClient.invalidateQueries({queryKey: ['router-summary']});
  };

  const save = useMutation({
    mutationFn: (path: string) => saveRouterLabel({
      path,
      labels: Object.fromEntries(labels.map(label => [label.id, selected.has(label.id)])),
      propagate,
    }),
    onSuccess: (result, path) => {
      finish(path);
      const similar = result.similar?.length ?? 0;
      if (result.auto_started) toast('Сохранено · запущено обучение новой версии', 'success');
      else if (similar) toast(`Сохранено и применено ещё к ${formatNumber(similar)} похожим`, 'success');
    },
  });

  const skip = useMutation({
    mutationFn: (path: string) => skipRouterPhoto(path),
    onSuccess: (_data, path) => finish(path),
  });

  const toggle = (id: string) => {
    if (!item) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(item.path, [...next]);
  };

  const busy = save.isPending || skip.isPending;
  const go = useCallback((step: number) => {
    if (queue.length) setIndex((position + step + queue.length) % queue.length);
  }, [position, queue.length, setIndex]);

  const shortcuts = useMemo(() => ({
    ArrowRight: () => go(1),
    ArrowLeft: () => go(-1),
    ...(canEdit && item && !busy ? {
      // На кнопке Enter нажимает саму кнопку — сохранять тогда не надо.
      Enter: (event: KeyboardEvent) => {
        if ((event.target as HTMLElement | null)?.tagName !== 'BUTTON') save.mutate(item.path);
      },
      Delete: () => skip.mutate(item.path),
    } : {}),
  }), [go, canEdit, item, busy, save, skip]);
  useKeyboardShortcuts(shortcuts);

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const result = new Map<string, RouterLabel[]>();
    for (const label of labels) {
      if (needle && !label.title.toLowerCase().includes(needle)) continue;
      const group = label.group || 'Другое';
      if (!result.has(group)) result.set(group, []);
      result.get(group)!.push(label);
    }
    return [...result];
  }, [labels, search]);

  if (!item && reviewQuery.isPending) return <div className="review-loading">Загружаю очередь…</div>;
  if (!item) {
    return (
      <EmptyState mark="✓" title={summary.predicted ? 'Очередь разобрана' : 'Меток ещё нет'}>
        {summary.predicted
          ? 'Все снимки с метками проверены или пропущены. Обновите предсказания во вкладке «Модели», когда появятся новые.'
          : 'Сначала посчитайте метки: вкладка «Модели» → «Обновить предсказания».'}
      </EmptyState>
    );
  }

  const title = (id: string) => labels.find(label => label.id === id)?.title ?? id;
  // Основная модель и разметчики, смотревшие снимок, — каждый своей строкой.
  const sources: Array<[string, string, string[]]> = [
    ['base', item.router_trained ? 'Своя модель предлагает' : 'Общая модель предлагает', item.router_suggested ?? []],
    ...Object.entries(item.router_alternatives ?? {}).map(([engine, ids]): [string, string, string[]] =>
      [engine, TAGGER_TITLES[engine as TaggerId] ?? engine, ids ?? []]),
  ];
  const votes = new Map<string, number>();
  for (const [, , ids] of sources) for (const id of ids) votes.set(id, (votes.get(id) ?? 0) + 1);
  const suggested = new Set(votes.keys());
  const addAll = (ids: string[]) => {
    setDraft(item.path, [...new Set([...selected, ...ids])]);
  };

  return (
    <div className="review">
      <figure className="review-photo">
        <img src={photoMediaUrl(item, adultMode, Math.min(1600, viewerSize()))} alt="Снимок для разметки" />
        <figcaption>
          <b title={item.path}>{item.filename}</b>
          <span>{position + 1} из {formatNumber(queue.length)} в очереди</span>
        </figcaption>
      </figure>

      <div className="review-side">
        <section className="review-block">
          <div className="review-block-head">
            <h3>На снимке</h3>
            <small>{selected.size ? `${selected.size} ${plural(selected.size, 'метка', 'метки', 'меток')}` : 'ничего не отмечено'}</small>
          </div>
          <div className="review-chosen">
            {selected.size === 0 && (
              <span className="review-empty">Отметьте подходящие метки ниже. Если не подходит ничего — пропустите снимок.</span>
            )}
            {[...selected].map(id => (
              <button key={id} type="button" className="label-chip on" disabled={!canEdit} onClick={() => toggle(id)}>
                {title(id)}
                <Icon name="close" size={14} />
              </button>
            ))}
          </div>
          {sources.map(([source, name, ids]) => {
            const rest = ids.filter(id => !selected.has(id));
            // Разметчик смотрел снимок и ничего не нашёл — это тоже ответ.
            if (!rest.length && (source === 'base' || ids.length)) return null;
            return (
              <div key={source} className={`review-suggest${source === 'base' ? '' : ' alternative'}`}>
                <span className="review-hint"><Icon name="process" size={14} />{name}</span>
                {rest.length === 0 && <span className="review-hint">ничего не нашёл</span>}
                {rest.map(id => (
                  <button
                    key={id}
                    type="button"
                    className={`label-chip suggested${(votes.get(id) ?? 0) > 1 ? ' agreed' : ''}`}
                    title={(votes.get(id) ?? 0) > 1 ? `Сходятся ${votes.get(id)} модели` : undefined}
                    disabled={!canEdit}
                    onClick={() => toggle(id)}
                  >
                    <Icon name="plus" size={14} />
                    {title(id)}
                  </button>
                ))}
                {canEdit && rest.length > 1 && (
                  <button type="button" className="review-accept" onClick={() => addAll(rest)}>
                    Принять все
                  </button>
                )}
              </div>
            );
          })}
        </section>

        <section className="review-block">
          <div className="review-block-head">
            <h3>Все метки</h3>
            <label className="review-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                placeholder="Найти метку"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </label>
          </div>
          {groups.map(([group, items]) => (
            <div key={group} className="label-group">
              <span className="label-group-title">{group}</span>
              <div className="label-group-chips">
                {items.map(label => {
                  const on = selected.has(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      className={`label-chip${on ? ' on' : ''}${suggested.has(label.id) ? ' suggested' : ''}`}
                      aria-pressed={on}
                      disabled={!canEdit}
                      onClick={() => toggle(label.id)}
                    >
                      {on && <Icon name="check" size={14} />}
                      {label.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {groups.length === 0 && <p className="review-empty">Метки с таким названием нет.</p>}
        </section>
      </div>

      {canEdit && (
        <div className="review-actions">
          <div className="review-nav">
            <button type="button" className="icon-button" aria-label="Предыдущий" title="Предыдущий (←)" onClick={() => go(-1)}>
              <Icon name="chevronLeft" />
            </button>
            <button type="button" className="icon-button" aria-label="Следующий" title="Следующий (→)" onClick={() => go(1)}>
              <Icon name="chevronRight" />
            </button>
          </div>
          <Button
            small
            disabled={busy}
            title="Сложно описать метками — убрать из очереди и не использовать для обучения (Delete)"
            onClick={() => skip.mutate(item.path)}
          >
            Не размечать
          </Button>
          <ToggleChip
            checked={propagate}
            title="Та же разметка ляжет на непроверенные кадры с визуальным сходством от 98,5%"
            onChange={setPropagate}
          >
            и почти такие же
          </ToggleChip>
          <Button variant="primary" disabled={busy} onClick={() => save.mutate(item.path)}>
            <Icon name="check" size={16} />
            <span>Сохранить</span>
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- пакеты для нейросети ---------- */

function BatchPanel({summary, job}: {summary: RouterSummary; job?: RouterJob}) {
  const canEdit = useStore(state => state.session.canEdit);
  const adultMode = useStore(state => state.prefs.adultMode);
  const size = useStore(state => state.training.batchSize);
  const setSize = useStore(state => state.setBatchSize);
  const toast = useStore(state => state.toast);
  const batches = useQuery({queryKey: qk.routerBatches(), queryFn: getRouterBatches});
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(routerExportUrl(size, adultMode === 'hide'));
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as {error?: string};
        throw new Error(data.error || `Сервер ответил ${response.status}`);
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1]
        ?? 'homecloud-review.zip';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      toast('Архив скачан — отправьте его нейросети вместе с промптом', 'success');
      refreshRouter();
    } catch (error) {
      toast(`Не удалось собрать архив: ${(error as Error).message}`, 'error');
    } finally {
      setDownloading(false);
    }
  };

  const list = batches.data?.batches ?? [];

  return (
    <div className="batch-panel">
      <LocalTaggers summary={summary} job={job} />

      <div className="batch-heading">
        <h3>Вручную через чат-нейросеть</h3>
        <small>ChatGPT, Claude, Gemini: архив туда, ответ обратно.</small>
      </div>
      <section className="batch-steps">
        <div className="batch-step">
          <span className="batch-step-number">1</span>
          <div>
            <b>Скачайте архив</b>
            <small>Снимки из очереди, список меток и готовый промпт. Эти снимки не попадут в ручную разметку, пока пакет ждёт ответа.</small>
            <div className="batch-size" role="group" aria-label="Снимков в архиве">
              {BATCH_SIZES.map(value => (
                <Chip key={value} active={size === value} onClick={() => setSize(value)}>{value}</Chip>
              ))}
            </div>
            <Button variant="primary" disabled={!canEdit || downloading || !(summary.pending ?? 0)} onClick={() => void download()}>
              <Icon name="duplicates" size={16} />
              <span>{downloading ? 'Собираю архив…' : `Скачать архив на ${photos(size)}`}</span>
            </Button>
          </div>
        </div>
        <div className="batch-step">
          <span className="batch-step-number">2</span>
          <div>
            <b>Отдайте его нейросети</b>
            <small>ChatGPT, Claude, Gemini — любой, что принимает архив или картинки. Вставьте промпт из карточки пакета ниже (или prompt.txt из архива).</small>
          </div>
        </div>
        <div className="batch-step">
          <span className="batch-step-number">3</span>
          <div>
            <b>Вставьте ответ в карточку пакета</b>
            <small>JSON из ответа целиком — можно вместе с ```json. Метки лягут как проверенные, и на них будет учиться модель.</small>
          </div>
        </div>
      </section>

      {list.length === 0
        ? <p className="batch-empty">Ожидающих пакетов нет. Скачайте архив — его карточка появится здесь.</p>
        : list.map(batch => <BatchCard key={batch.batch_id} batch={batch} canEdit={canEdit} />)}
    </div>
  );
}

/** RAM++ и Qwen на этой машине: без архивов и копирования, рядом с основной моделью. */
function LocalTaggers({summary, job}: {summary: RouterSummary; job?: RouterJob}) {
  const canEdit = useStore(state => state.session.canEdit);
  const adultMode = useStore(state => state.prefs.adultMode);
  const toast = useStore(state => state.toast);
  const taggers = useQuery({queryKey: qk.routerTaggers(), queryFn: getRouterTaggers});
  const [count, setCount] = useState(100);
  const [accept, setAccept] = useState(false);
  const busy = Boolean(job?.active);

  const start = useMutation({
    mutationFn: (payload: {engine: TaggerId; scope: 'queue' | 'reviewed'}) => startRouterTagging({
      ...payload,
      count: payload.scope === 'reviewed' ? 5000 : count,
      accept: payload.scope === 'queue' && accept,
      adult: adultMode === 'hide' ? 'hide' : '',
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: qk.routerStatus()});
      toast('Разметка запущена — ход виден в карточке сверху', 'success');
    },
    onError: (error: Error) => toast(error.message, 'error'),
  });

  const list = taggers.data?.taggers ?? [];
  const base = list.find(tagger => tagger.base);
  const humans = summary.human_reviewed ?? 0;

  return (
    <section className="taggers">
      <div className="batch-heading">
        <h3>Локальные модели</h3>
        <small>
          Смотрят на сами снимки и кладут свои метки рядом с основной моделью — в разметке это отдельные подсказки.
          Можно сразу сохранять их ответ, тогда на нём будет учиться своя модель.
        </small>
      </div>

      <div className="taggers-options">
        <span className="review-hint">Следующие в очереди</span>
        {TAG_COUNTS.map(value => (
          <Chip key={value} active={count === value} onClick={() => setCount(value)}>{formatNumber(value)}</Chip>
        ))}
        <ToggleChip
          checked={accept}
          disabled={!canEdit}
          title="Ответ модели сразу станет разметкой без вашей проверки. Уже размеченное вручную не трогается."
          onChange={setAccept}
        >
          сразу сохранять разметкой
        </ToggleChip>
      </div>

      {taggers.isPending && <div className="review-loading">Проверяю модели…</div>}
      <div className="taggers-list">
        {list.filter(tagger => !tagger.base).map(tagger => (
          <TaggerCard
            key={tagger.id}
            tagger={tagger}
            base={base}
            humans={humans}
            disabled={!canEdit || busy || start.isPending}
            onRun={scope => start.mutate({engine: tagger.id as TaggerId, scope})}
            count={count}
            total={summary.labels?.length ?? 0}
          />
        ))}
      </div>
    </section>
  );
}

function TaggerCard({tagger, base, humans, disabled, count, total, onRun}: {
  tagger: RouterTagger;
  base?: RouterTagger;
  humans: number;
  disabled: boolean;
  count: number;
  total: number;
  onRun(scope: 'queue' | 'reviewed'): void;
}) {
  const {quality} = tagger;
  const checked = quality.photos > 0;
  const unchecked = Math.max(0, humans - quality.photos);

  return (
    <article className={`tagger-card${tagger.ready ? '' : ' offline'}`}>
      <header>
        <b>{tagger.title}</b>
        <small>{tagger.detail}</small>
      </header>
      <p>{tagger.note}</p>

      <div className="tagger-quality" title="Сравнение с тем, что вы отметили вручную, по меткам, которые модель умеет ставить">
        {checked ? (
          <>
            <div>
              <span>Точность</span>
              <b>{percent(quality.precision)}</b>
              <Progress value={quality.precision ?? 0} className={(quality.precision ?? 0) < .5 ? 'weak' : ''} />
            </div>
            <div>
              <span>Полнота</span>
              <b>{percent(quality.recall)}</b>
              <Progress value={quality.recall ?? 0} className={(quality.recall ?? 0) < .5 ? 'weak' : ''} />
            </div>
            <small>
              на {photos(quality.photos)} вашей разметки
              {base?.quality.photos ? ` · основная модель: ${percent(base.quality.precision)} и ${percent(base.quality.recall)}` : ''}
            </small>
          </>
        ) : (
          <small>Ещё не сравнивалась с вашей разметкой.</small>
        )}
      </div>

      <small className="tagger-stats">
        посмотрела {photos(tagger.tagged ?? 0)}
        {tagger.accepted ? ` · сохранено разметкой ${formatNumber(tagger.accepted)}` : ''}
        {tagger.id === 'ram_plus' ? ` · умеет ${tagger.labels} из ${total} меток` : ''}
      </small>

      <div className="tagger-actions">
        <Button variant="primary" small disabled={disabled || !tagger.ready} onClick={() => onRun('queue')}>
          Разметить {formatNumber(count)}
        </Button>
        {unchecked > 0 && (
          <Button
            small
            disabled={disabled || !tagger.ready}
            title="Прогнать по снимкам, размеченным вручную, и посчитать, насколько модель с вами согласна"
            onClick={() => onRun('reviewed')}
          >
            Сравнить с моей разметкой
          </Button>
        )}
      </div>
    </article>
  );
}

function BatchCard({batch, canEdit}: {batch: RouterBatch; canEdit: boolean}) {
  const adultMode = useStore(state => state.prefs.adultMode);
  const toast = useStore(state => state.toast);
  const [answer, setAnswer] = useState('');

  const upload = useMutation({
    mutationFn: () => importRouterAnswer(answer),
    onSuccess: result => {
      setAnswer('');
      toast(`Загружено ${photos(result.imported)}${result.skipped.length
        ? `, уже размечены вручную: ${result.skipped.length}` : ''}${result.auto_started ? ' · запущено обучение' : ''}`,
        'success');
      refreshRouter();
    },
    onError: (error: Error) => toast(error.message, 'error'),
  });

  const cancel = useMutation({
    mutationFn: () => cancelRouterBatch(batch.batch_id),
    onSuccess: () => { toast('Пакет отменён, снимки вернулись в очередь'); refreshRouter(); },
  });

  const copy = async () => {
    try {
      await copyText(batch.prompt);
      toast('Промпт скопирован', 'success');
    } catch {
      toast('Не удалось скопировать — возьмите prompt.txt из архива', 'error');
    }
  };

  return (
    <article className="batch-card">
      <header className="batch-card-head">
        <div>
          <b>Пакет на {photos(batch.items.length)}</b>
          <small>выдан {runMoment(batch.created_at)} · {batch.batch_id.slice(0, 8)}</small>
        </div>
        <Button small onClick={() => void copy()}>
          <Icon name="duplicates" size={15} />
          <span>Промпт</span>
        </Button>
        {canEdit && (
          <button
            type="button"
            className="icon-button"
            aria-label="Отменить пакет"
            title="Отменить пакет — снимки вернутся в очередь"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            <Icon name="close" />
          </button>
        )}
      </header>
      <div className="batch-thumbs">
        {batch.items.map(item => (
          <figure key={item.file} title={item.photo?.filename ?? item.file}>
            {item.photo && <img src={photoMediaUrl(item.photo, adultMode, 160)} alt="" loading="lazy" />}
            <figcaption>{item.file}</figcaption>
          </figure>
        ))}
      </div>
      {canEdit && (
        <div className="batch-answer">
          <textarea
            rows={4}
            placeholder={`Вставьте ответ нейросети: {"batch_id": "${batch.batch_id.slice(0, 8)}…", "items": [...]}`}
            value={answer}
            onChange={event => setAnswer(event.target.value)}
          />
          <Button variant="primary" small disabled={!answer.trim() || upload.isPending} onClick={() => upload.mutate()}>
            Загрузить ответ
          </Button>
        </div>
      )}
    </article>
  );
}

/* ---------- модели ---------- */

function ModelsPanel({summary, job}: {summary: RouterSummary; job?: RouterJob}) {
  const canEdit = useStore(state => state.session.canEdit);
  const toast = useStore(state => state.toast);
  const reviewed = summary.reviewed ?? 0;
  const busy = Boolean(job?.active);

  const start = useMutation({
    mutationFn: (action: 'bootstrap' | 'train') => runRouter(action),
    onSuccess: (_data, action) => {
      void queryClient.invalidateQueries({queryKey: ['router-status']});
      toast(action === 'train' ? 'Обучение запущено' : 'Пересчёт меток запущен', 'success');
    },
  });
  const activate = useMutation({
    mutationFn: (version: string) => activateRouterModel({version}),
    onSuccess: () => { refreshRouter(); toast('Версия стала основной', 'success'); },
  });
  const automation = useMutation({
    mutationFn: (settings: {router_auto_train: boolean; router_auto_train_every: number}) => saveSettings(settings),
    onSuccess: () => void queryClient.invalidateQueries({queryKey: ['router-summary']}),
  });
  const restore = useMutation({
    mutationFn: clearRouterSkips,
    onSuccess: result => { refreshRouter(); toast(`Вернули в очередь: ${formatNumber(result.restored)}`); },
  });

  return (
    <div className="models-panel">
      <section className="models-actions">
        <div>
          <b>Пересчитать метки</b>
          <small>Общая модель или активная версия заново оценит все снимки из визуального индекса.</small>
          <Button disabled={busy || !canEdit} onClick={() => start.mutate('bootstrap')}>Обновить предсказания</Button>
        </div>
        <div>
          <b>Обучить новую версию</b>
          <small>
            {reviewed < MIN_REVIEWS
              ? `Нужно минимум ${MIN_REVIEWS} проверенных снимков, сейчас ${formatNumber(reviewed)}.`
              : `На ${photos(reviewed)}. Основной версия станет только после вашей проверки.`}
          </small>
          <Button variant="primary" disabled={busy || !canEdit || reviewed < MIN_REVIEWS} onClick={() => start.mutate('train')}>
            Обучить
          </Button>
        </div>
        <div>
          <b>Автообучение</b>
          <small>Новая версия-кандидат сама обучится после каждых N проверок.</small>
          <div className="models-auto">
            <ToggleChip
              checked={Boolean(summary.auto_train)}
              disabled={!canEdit}
              onChange={next => automation.mutate({
                router_auto_train: next, router_auto_train_every: summary.auto_train_every ?? 50,
              })}
            >
              Включено
            </ToggleChip>
            {[25, 50, 100, 200].map(value => (
              <Chip
                key={value}
                active={(summary.auto_train_every ?? 50) === value}
                onClick={() => canEdit && automation.mutate({
                  router_auto_train: Boolean(summary.auto_train), router_auto_train_every: value,
                })}
              >
                {value}
              </Chip>
            ))}
          </div>
        </div>
        {(summary.skipped ?? 0) > 0 && (
          <div>
            <b>Пропущенные снимки</b>
            <small>{photos(summary.skipped ?? 0)} помечено «не размечать».</small>
            <Button disabled={!canEdit || restore.isPending} onClick={() => restore.mutate()}>Вернуть в очередь</Button>
          </div>
        )}
      </section>

      <section className="models-list">
        <h3>Версии</h3>
        {(summary.models ?? []).length === 0
          ? <p className="batch-empty">Обученных версий пока нет — метки ставит общая модель.</p>
          : summary.models!.map(model => {
              const f1 = model.metrics?.macro_f1;
              const activeModel = model.status === 'active';
              return (
                <article key={model.version} className={`model-row${activeModel ? ' active' : ''}`}>
                  <div className="model-main">
                    <b>{model.version}{activeModel && <span className="model-badge">основная</span>}</b>
                    <small>
                      {photos(model.dataset_size)} · {model.embedding_model}
                      {model.trained_at ? ` · ${runMoment(model.trained_at)}` : ''}
                    </small>
                  </div>
                  <div className="model-score" title="Средний F1 по меткам на отложенных снимках: 100% — без ошибок">
                    <span>F1</span>
                    <b>{f1 == null ? '—' : `${Math.round(f1 * 100)}%`}</b>
                    <Progress value={f1 ?? 0} className={f1 != null && f1 < .5 ? 'weak' : ''} />
                  </div>
                  {!activeModel && canEdit && (
                    <Button small disabled={activate.isPending} onClick={() => activate.mutate(model.version)}>
                      Сделать основной
                    </Button>
                  )}
                </article>
              );
            })}
      </section>
    </div>
  );
}
