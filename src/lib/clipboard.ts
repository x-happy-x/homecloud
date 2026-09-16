/**
 * Копирование в буфер. По HTTP в локальной сети Clipboard API недоступен —
 * тогда старый путь через скрытое поле и execCommand.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Ниже запасной путь.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.setAttribute('readonly', '');
  document.body.append(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy failed');
}
