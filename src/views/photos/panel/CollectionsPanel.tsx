import {useMemo} from 'react';
import './CollectionsPanel.scss';
import {useKeyboardShortcuts} from '../../../hooks/useKeyboardShortcuts';
import {useStore} from '../../../store';
import type {SidepageTab} from '../../../store/slices/prefs';
import {SidePanel, type SidePanelTab} from '../../../ui/SidePanel/SidePanel';
import {AlbumsSection} from './AlbumsSection';
import {FiltersSection} from './FiltersSection';
import {FoldersSection} from './FoldersSection';
import {PeopleBubbles} from './PeopleBubbles';

const TABS: Array<SidePanelTab<SidepageTab>> = [
  {id: 'people', label: 'Люди'},
  {id: 'folders', label: 'Папки'},
  {id: 'albums', label: 'Альбомы'},
  {id: 'filters', label: 'Фильтры'},
];

/** «Подборки и фильтры» галереи: люди, папки, альбомы и фильтры содержимого. */
export function CollectionsPanel() {
  const open = useStore(state => state.sidepageOpen);
  const close = useStore(state => state.closeSidepage);
  const tab = useStore(state => state.prefs.sidepageTab);
  const setTab = useStore(state => state.setSidepageTab);

  const escape = useMemo(() => ({Escape: close}), [close]);
  useKeyboardShortcuts(escape, open);

  return (
    <SidePanel open={open} title="Фильтры" onClose={close} tabs={TABS} activeTab={tab} onTab={setTab}>
      <section key={tab} className="sidepage-panel active">
        {tab === 'people' && <PeopleBubbles />}
        {tab === 'folders' && <FoldersSection />}
        {tab === 'albums' && <AlbumsSection />}
        {tab === 'filters' && <FiltersSection />}
      </section>
    </SidePanel>
  );
}
