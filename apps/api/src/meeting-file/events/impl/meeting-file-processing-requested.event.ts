/**
 * Файлу встречи требуется фоновая обработка. Публикуется `CreateMeetingFileHandler`
 * (для только что загруженной `recording`) и `ReprocessMeetingFileHandler`.
 * Решение «нужна ли обработка вообще» принимает издатель — обработчик события лишь ставит в очередь.
 */
export class MeetingFileProcessingRequestedEvent {
  constructor(public readonly fileId: string) {}
}
