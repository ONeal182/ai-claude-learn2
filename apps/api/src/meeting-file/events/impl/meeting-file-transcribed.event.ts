/**
 * Файл встречи успешно транскрибирован. Публикуется `MeetingFileProcessingQueue`
 * при переходе в `status=done`. Триггерит суммаризацию всей встречи через `MeetingSummaryQueue`.
 */
export class MeetingFileTranscribedEvent {
  constructor(
    public readonly fileId: string,
    public readonly meetingId: string,
  ) {}
}
