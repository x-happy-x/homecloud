import {useMemo} from 'react';
import {useMutation, useQuery} from '@tanstack/react-query';
import './TrainingView.scss';
import {formatNumber} from '../../lib/format';
import {saveSettings} from '../../services/endpoints/settings';
import {
  activateRouterModel, getRouterReview, getRouterSummary, runRouter, saveRouterLabel,
} from '../../services/endpoints/training';
import {photoMediaUrl, viewerSize} from '../../services/media';
import {qk} from '../../services/queryKeys';
import {queryClient} from '../../services/queryClient';
import {useStore} from '../../store';
import type {PhotoSummary} from '../../types/api';
import {Button} from '../../ui/Button/Button';
import {CheckRow} from '../../ui/CheckRow/CheckRow';
import {HintLine} from '../../ui/Hint/Hint';
import {Progress} from '../../ui/Progress/Progress';
import {SectionHead} from '../../ui/ViewHeader/ViewHeader';

/** Пока проверок меньше дюжины, обучать не на чем. */
const MIN_REVIEWS = 12;
/** Метка засчитывается предсказанной, если модель уверена сильнее этого. */
const PREDICTION_THRESHOLD = 0.6;

interface RouterLabel {
  id: string;
  title: string;
  group?: string;
}

interface RouterModel {
  version: string;
  status: string;
  dataset_size: number;
  embedding_model: string;
  metrics?: {macro_f1?: number};
}

interface RouterSummary {
  pending?: number;
  embedded?: number;
  predicted?: number;
  reviewed?: number;
  human_reviewed?: number;
  propagated?: number;
  auto_train?: boolean;
  auto_train_every?: number;
  labels?: RouterLabel[];
  models?: RouterModel[];
}

interface QueueItem extends PhotoSummary {
  filename: string;
  folder: string;
  router_scores?: Record<string, number>;
}

interface RouterJob {
  active?: boolean;
  status?: string;
  action?: 'train' | 'bootstrap';
  completed?: number;
  total?: number;
  loss?: number;
  error?: string;
}

export function TrainingView({job}: {job?: RouterJob}) {
  const canEdit = useStore(state => state.session.canEdit);
  const adultMode = useStore(state => state.prefs.adultMode);
  const index = useStore(state => state.training.index);
  const setIndex = useStore(state => state.setTrainingIndex);
  const drafts = useStore(state => state.training.drafts);
  const setDraft = useStore(state => state.setDraft);
  const dropDraft = useStore(state => state.dropDraft);
  const toast = useStore(state => state.toast);

  const summaryQuery = useQuery({queryKey: qk.routerSummary(), queryFn: getRouterSummary});
  const summary = (summaryQuery.data ?? {}) as RouterSummary;

  const reviewQuery = useQuery({
    queryKey: qk.routerReview(adultMode === 'hide'),
    queryFn: () => getRouterReview(adultMode === 'hide'),
  });
  const queue = ((reviewQuery.data as {photos?: QueueItem[]})?.photos ?? []);
  const item = queue[index];

  const start = useMutation({
    mutationFn: (action: 'bootstrap' | 'train') => runRouter(action),
    onSuccess: (_data, action) => {
      queryClient.invalidateQueries({queryKey: ['router-status']});
      toast(action === 'train' ? 'Обучение запущено' : 'Zero-shot расчёт запущен', 'success');
    },
  });

  const save = useMutation({
    mutationFn: ({propagate}: {propagate: boolean}) => {
      const labels = labelValues;
      return saveRouterLabel({path: item!.path, labels, propagate}) as
        Promise<{similar?: string[]; auto_started?: boolean}>;
    },
    onSuccess: result => {
      dropDraft(item!.path);
      const propagated = result.similar?.length ?? 0;
      if (result.auto_started) toast('Разметка сохранена · автоматическое обучение запущено', 'success');
      else if (propagated) {
        toast(`Разметка применена ещё к ${formatNumber(propagated)} похожим кадрам`, 'success');
      }
      setIndex(0);
      queryClient.invalidateQueries({queryKey: ['router-review']});
      queryClient.invalidateQueries({queryKey: ['router-summary']});
    },
  });

  const activate = useMutation({
    mutationFn: (version: string) => activateRouterModel({version}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['router-summary']});
      toast('Новая версия роутера активирована', 'success');
    },
  });

  const automation = useMutation({
    mutationFn: (settings: {router_auto_train: boolean; router_auto_train_every: number}) =>
      saveSettings(settings),
    onSuccess: (_data, settings) => {
      queryClient.invalidateQueries({queryKey: ['router-summary']});
      toast(settings.router_auto_train
        ? 'Автоматическое обучение включено'
        : 'Автоматическое обучение выключено', 'success');
    },
  });

  /**
   * Что сейчас отмечено: черновик пользователя, а если его нет — предсказание
   * модели. Черновик обязан пережить опрос состояния раз в полторы секунды.
   */
  const labelValues = useMemo(() => {
    if (!item) return {};
    const draft = drafts.get(item.path);
    const values: Record<string, boolean> = {};
    for (const label of summary.labels ?? []) {
      values[label.id] = draft
        ? Boolean(draft.includes(label.id))
        : Number(item.router_scores?.[label.id] ?? 0) >= PREDICTION_THRESHOLD;
    }
    return values;
  }, [item, drafts, summary.labels]);

  const grouped = useMemo(() => {
    const result = new Map<string, RouterLabel[]>();
    for (const label of summary.labels ?? []) {
      const group = label.group || 'Другое';
      if (!result.has(group)) result.set(group, []);
      result.get(group)!.push(label);
    }
    return [...result];
  }, [summary.labels]);

  const toggleLabel = (id: string) => {
    if (!item) return;
    const next = {...labelValues, [id]: !labelValues[id]};
    setDraft(item.path, Object.keys(next).filter(key => next[key]));
  };

  const busy = Boolean(job?.active);
  const fraction = job?.total ? (job.completed ?? 0) / job.total : null;
  const reviewed = summary.human_reviewed ?? summary.reviewed ?? 0;

  const stats: Array<[string, number]> = [
    ['Визуальный индекс', summary.embedded ?? 0],
    ['Предсказания', summary.predicted ?? 0],
    ['Проверено вручную', reviewed],
    ['По похожим кадрам', summary.propagated ?? 0],
    ['В очереди', summary.pending ?? 0],
  ];

  return (
    <section className="analysis-panel">
      <SectionHead
        title="Обучение"
        note="Модель раскладывает снимки по типам: портрет, документ, снимок экрана и так
          далее. Сначала метки ставит zero-shot, потом вы правите ошибки, и на этих правках
          обучается своя версия."
        actions={
          <div className="training-actions">
            <Button disabled={busy || !canEdit} onClick={() => start.mutate('bootstrap')}>
              Обновить предсказания
            </Button>
            <Button
              variant="primary"
              disabled={busy || !canEdit || reviewed < MIN_REVIEWS}
              onClick={() => start.mutate('train')}
            >
              Обучить новую версию
            </Button>
          </div>
        }
      />

      {(busy || job?.status === 'error') && (
        <section className="router-progress">
          <div className="processing-head">
            <div>
              <strong>
                {job?.action === 'train' ? 'Обучение новой версии' : 'Расчёт zero-shot меток'}
              </strong>
              <span>{job?.error || (job?.loss != null ? `loss ${job.loss}` : '')}</span>
            </div>
            <b>
              {job?.status === 'error'
                ? 'Ошибка'
                : fraction === null ? '' : `${Math.round(fraction * 100)}%`}
            </b>
          </div>
          <Progress value={fraction} />
        </section>
      )}

      <div className="router-stats">
        {stats.map(([title, value]) => (
          <div key={title} className="router-stat">
            <b>{formatNumber(value)}</b>
            <small>{title}</small>
          </div>
        ))}
      </div>

      <section className="router-automation">
        <CheckRow
          checked={Boolean(summary.auto_train)}
          disabled={!canEdit}
          onChange={next => automation.mutate({
            router_auto_train: next,
            router_auto_train_every: summary.auto_train_every ?? 50,
          })}
        >
          Автоматически создавать новую candidate-версию
        </CheckRow>
        <label>
          каждые
          <select
            value={String(summary.auto_train_every ?? 50)}
            disabled={!canEdit}
            onChange={event => automation.mutate({
              router_auto_train: Boolean(summary.auto_train),
              router_auto_train_every: Number(event.target.value),
            })}
          >
            {[25, 50, 100, 200].map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          новых проверенных или распространённых снимков
        </label>
        <small>Модель обучится в фоне, но основной станет только после ручной активации.</small>
      </section>

      <div className="router-layout">
        <section className="router-review-card">
          <div className="router-photo">
            {item && (
              <img
                src={photoMediaUrl(item, adultMode, Math.min(1600, viewerSize()))}
                alt="Фотография для проверки"
              />
            )}
          </div>
          <div className="router-review-body">
            <div>
              <p className="eyebrow">
                {item ? `${index + 1} из ${queue.length} · ${item.folder}` : 'Очередь проверки'}
              </p>
              <h2>
                {item
                  ? item.filename
                  : summary.predicted
                    ? 'Очередь разобрана'
                    : 'Сначала создайте zero-shot очередь'}
              </h2>
            </div>

            <div className="router-labels">
              {item && grouped.map(([group, labels]) => (
                <div key={group} className="router-label-group">
                  <b>{group}</b>
                  <div>
                    {labels.map(label => (
                      <label key={label.id} className="router-label">
                        <input
                          type="checkbox"
                          checked={Boolean(labelValues[label.id])}
                          onChange={() => toggleLabel(label.id)}
                        />
                        <span>
                          {label.title}{' '}
                          <em>{Math.round(Number(item.router_scores?.[label.id] ?? 0) * 100)}%</em>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="router-review-actions">
              <Button
                disabled={!queue.length}
                onClick={() => setIndex((index + 1) % queue.length)}
              >
                Пропустить
              </Button>
              <Button
                disabled={!item || !canEdit || save.isPending}
                onClick={() => save.mutate({propagate: false})}
              >
                Только этот
              </Button>
              <Button
                variant="primary"
                disabled={!item || !canEdit || save.isPending}
                title="Применить к ещё не проверенным кадрам с визуальным сходством не ниже 98,5%"
                onClick={() => save.mutate({propagate: true})}
              >
                Этот и почти одинаковые
              </Button>
            </div>
          </div>
        </section>

        <section className="router-versions">
          <h2>Версии модели</h2>
          {(summary.models ?? []).length === 0
            ? <HintLine>Обученных версий пока нет.</HintLine>
            : summary.models!.map(model => {
                const f1 = model.metrics?.macro_f1;
                return (
                  <div key={model.version} className="router-version">
                    <div className="router-version-head">
                      <strong>{model.version}</strong>
                      {model.status === 'active' && <span className="active-pill">активна</span>}
                    </div>
                    <p>
                      {formatNumber(model.dataset_size)} проверок · F1{' '}
                      {f1 == null ? '—' : Math.round(f1 * 1000) / 1000}
                      <br />
                      {model.embedding_model}
                    </p>
                    {model.status !== 'active' && (
                      <Button small onClick={() => activate.mutate(model.version)}>
                        Сделать основной
                      </Button>
                    )}
                  </div>
                );
              })}
        </section>
      </div>
    </section>
  );
}
