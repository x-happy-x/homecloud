import './FeaturePicker.scss';
import {FEATURE_INFO, withFeatureDeps} from '../../lib/jobs';
import {
  KIND_FEATURES, KIND_NOTES, KIND_TITLES, MEDIA_KINDS,
  type FeatureFlags, type MediaKind,
} from '../../store/slices/scan';
import {ToggleCard} from '../../ui/ToggleCard/ToggleCard';

export interface FeaturePickerProps {
  /** Наборы этапов по видам файлов. */
  value: Record<MediaKind, FeatureFlags>;
  onChange(kind: MediaKind, features: FeatureFlags): void;
  /** Что умеет устройство; не задано — доступно всё. */
  capabilities?: Record<string, boolean>;
}

/**
 * Выбор этапов порознь для снимков и для роликов. Прежде набор был один и шёл
 * на всё найденное сразу: включил описания — их считали и для видео, хотя это
 * в разы дороже, а речь из окна задания было вообще не запустить.
 */
export function FeaturePicker({value, onChange, capabilities}: FeaturePickerProps) {
  return (
    <div className="feature-picker">
      {MEDIA_KINDS.map(kind => {
        const features = value[kind];
        const keys = KIND_FEATURES[kind];
        const chosen = keys.filter(key => features[key]).length;
        return (
          <section key={kind} className="feature-group">
            <header>
              <b>{KIND_TITLES[kind]}</b>
              <span>{chosen ? `выбрано: ${chosen}` : 'ничего не выбрано'}</span>
              <small>{KIND_NOTES[kind]}</small>
            </header>
            <div className="feature-cards">
              {keys.map(key => {
                const [title, text] = FEATURE_INFO[key];
                const available = !capabilities || Boolean(capabilities[key]);
                return (
                  <ToggleCard
                    key={key}
                    title={title}
                    note={available ? text : 'На этом устройстве компонент не установлен'}
                    checked={available && features[key]}
                    disabled={!available}
                    onChange={checked => onChange(kind, withFeatureDeps(features, key, checked))}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
