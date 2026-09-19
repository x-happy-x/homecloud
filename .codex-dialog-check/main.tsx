import React from 'react';
import {createRoot} from 'react-dom/client';
import '../src/styles/index.scss';
import {AppDialogs} from '../src/components/AppDialogs/AppDialogs';
import {confirmAction, promptText, showProgressDialog} from '../src/services/dialogs';
function Check() {
  const [result, setResult] = React.useState('');
  return <><button onClick={async () => setResult(String(await confirmAction('Удалить 250 файлов (2 ГБ)?\nВ каждой группе останется копия в выбранной папке.', {title: 'Удалить дубликаты?', confirmLabel: 'Удалить', danger: true})))}>Подтверждение</button>
  <button onClick={async () => setResult(String(await promptText('Название альбома', 'Семья')))}>Ввод</button>
  <button onClick={() => { const d = showProgressDialog('Ищем все дубликаты…', 'Собираем группы по выбранным фильтрам. После поиска покажем, какие копии будут удалены.'); d.signal.addEventListener('abort', () => setResult('Поиск отменён')); }}>Поиск</button>
  <p>{result}</p><AppDialogs /></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Check /></React.StrictMode>);
