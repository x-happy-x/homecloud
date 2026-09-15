import {FEATURE_INFO, withFeatureDeps} from '../../lib/jobs';
import {useStore} from '../../store';
import {SCAN_DIALOG_FEATURES} from '../../store/slices/scan';

/** Этапы задания; недоступное на устройстве видно, но не включается. */
export function FeatureList({capabilities}: {capabilities: Record<string, boolean>}) {
  const features = useStore(state => state.scan.features);
  const setFeatures = useStore(state => state.setFeatures);

  return (
    <div className="feature-list">
      {SCAN_DIALOG_FEATURES.map(key => {
        const [title, text] = FEATURE_INFO[key];
        const available = Boolean(capabilities[key]);
        return (
          <label key={key} className={`feature-option${available ? '' : ' disabled'}`}>
            <input
              type="checkbox"
              checked={available && features[key]}
              disabled={!available}
              onChange={event => setFeatures(withFeatureDeps(features, key, event.target.checked))}
            />
            <span>
              <b>{title}</b>
              <small>{available ? text : 'На этом устройстве компонент не установлен'}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}
