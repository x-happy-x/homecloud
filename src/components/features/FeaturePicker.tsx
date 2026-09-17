import './FeaturePicker.scss';
import {formatNumber, plural} from '../../lib/format';
import {FEATURE_INFO, withFeatureDeps} from '../../lib/jobs';
import {
  KIND_FEATURES, MEDIA_KINDS, type FeatureFlags, type MediaKind, type ScanFeature,
} from '../../store/slices/scan';
import {Icon} from '../../ui/Icon/Icon';

export interface FeaturePickerProps {
  /** Наборы этапов по видам файлов. */
  value: Record<MediaKind, FeatureFlags>;
  onChange(kind: MediaKind, features: FeatureFlags): void;
  /** Что умеет устройство; не задано — доступно всё. */
  capabilities?: Record<string, boolean>;
}

const ORDER: ScanFeature[] = [
  'faces', 'visual', 'ocr', 'caption', 'adult', 'speech', 'diarize', 'authenticity', 'curation', 'highlights',
];
const KIND_LABELS: Record<MediaKind, string> = {photos: 'Фото', videos: 'Видео'};

/**
 * Этапы одним списком. На карточке — чипы видов файлов, к которым этап
 * применим (речь бывает только у роликов): щелчок по чипу включает этап для
 * этого вида, по самой карточке — для всех сразу. Ролик стоит в разы дороже
 * снимка, поэтому виды по-прежнему выбираются порознь.
 */
export function FeaturePicker({value, onChange, capabilities}: FeaturePickerProps) {
  const setKinds = (key: ScanFeature, kinds: MediaKind[], on: boolean) => {
    for (const kind of kinds) onChange(kind, withFeatureDeps(value[kind], key, on));
  };
  const chosen = ORDER.filter(key => MEDIA_KINDS.some(kind => value[kind][key])).length;

  return (
    <div className="feature-picker">
      <p className="feature-summary">
        {chosen
          ? `Выбрано ${formatNumber(chosen)} ${plural(chosen, 'этап', 'этапа', 'этапов')}`
          : 'Ничего не выбрано'}
        {' · '}нажмите на карточку, чтобы включить этап для всех файлов, или на «Фото» и «Видео» по отдельности
      </p>
      <div className="feature-cards">
        {ORDER.map(key => {
          const [title, text] = FEATURE_INFO[key];
          const kinds = MEDIA_KINDS.filter(kind => KIND_FEATURES[kind].includes(key));
          const available = !capabilities || Boolean(capabilities[key]);
          const onKinds = kinds.filter(kind => available && value[kind][key]);
          const all = onKinds.length === kinds.length;
          return (
            <div
              key={key}
              className={`feature-card${onKinds.length ? ' on' : ''}${available ? '' : ' unavailable'}`}
            >
              <button
                type="button"
                className="feature-card-main"
                aria-pressed={onKinds.length ? (all ? true : 'mixed') : false}
                disabled={!available}
                onClick={() => setKinds(key, kinds, !all)}
              >
                <b>{title}</b>
                <small>{available ? text : 'На этом устройстве компонент не установлен'}</small>
              </button>
              {available && (
                <div className="feature-card-kinds">
                  {kinds.map(kind => {
                    const on = value[kind][key];
                    return (
                      <button
                        key={kind}
                        type="button"
                        role="switch"
                        aria-checked={on}
                        className={`kind-chip${on ? ' on' : ''}`}
                        onClick={() => setKinds(key, [kind], !on)}
                      >
                        {on && <Icon name="check" size={14} />}
                        {KIND_LABELS[kind]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
