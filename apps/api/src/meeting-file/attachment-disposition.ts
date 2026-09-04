/**
 * Значение заголовка `Content-Disposition` для отдачи файла на скачивание (RFC 5987/6266).
 * `filename*` несёт настоящее имя в UTF-8 (в т.ч. кириллицу); `filename` — ASCII-фолбэк для
 * старых клиентов: не-ASCII и спецсимволы заменены на `_`, расширение сохранено.
 */
export function attachmentDisposition(originalName: string): string {
  const asciiFallback =
    originalName
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_')
      .trim() || 'file';
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}
