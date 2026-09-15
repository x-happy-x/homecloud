import {useStore} from '../store';

/** Показать сообщение. Отдельный хук, чтобы не тащить весь стор в компонент. */
export const useToast = () => useStore(state => state.toast);
