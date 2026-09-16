import {afterEach, expect, it} from 'vitest';
import {closeAppDialog, confirmAction, promptText, showProgressDialog, useAppDialogs} from './dialogs';

afterEach(() => {
  for (const item of useAppDialogs.getState().queue) closeAppDialog(item.id);
});

it('очередь не теряет подтверждения, повторное закрытие не затрагивает следующее окно', async () => {
  const first = confirmAction('Удалить?');
  const second = confirmAction('Перенести?');
  const [a, b] = useAppDialogs.getState().queue;
  closeAppDialog(a.id, true);
  closeAppDialog(a.id);
  expect(useAppDialogs.getState().queue[0].id).toBe(b.id);
  closeAppDialog(b.id);
  expect(await first).toBe(true);
  expect(await second).toBe(false);
});

it('ввод возвращает текст, отмена — null', async () => {
  const accepted = promptText('Название', 'Семья');
  closeAppDialog(useAppDialogs.getState().queue[0].id, 'Отпуск');
  expect(await accepted).toBe('Отпуск');
  const canceled = promptText('Название');
  closeAppDialog(useAppDialogs.getState().queue[0].id);
  expect(await canceled).toBeNull();
});

it('отмена поиска прерывает запрос; завершение поиска не вызывает abort', () => {
  const canceled = showProgressDialog('Поиск', 'Загрузка');
  canceled.update('Проверено 10', 0.5);
  expect(useAppDialogs.getState().queue[0].progress).toBe(0.5);
  closeAppDialog(useAppDialogs.getState().queue[0].id);
  expect(canceled.signal.aborted).toBe(true);
  const completed = showProgressDialog('Поиск', 'Загрузка');
  completed.close();
  expect(completed.signal.aborted).toBe(false);
  expect(useAppDialogs.getState().queue).toEqual([]);
});
