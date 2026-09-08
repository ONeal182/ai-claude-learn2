/**
 * Файл встречи успешно транскрибирован. Публикуется `MeetingFileProcessingQueue`
 * при переходе в `status=done`. Триггерит суммаризацию через `MeetingFileSummaryQueue`.
 */
export class MeetingFileTranscribedEvent {
  constructor(public readonly fileId: string) {}
}
