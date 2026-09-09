import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MeetingSummaryQueue } from '../../processing/meeting-summary.queue.js';
import { MeetingFileTranscribedEvent } from '../impl/meeting-file-transcribed.event.js';

/** Ставит встречу в in-process очередь суммаризации после транскрибации любого её файла. */
@Injectable()
@EventsHandler(MeetingFileTranscribedEvent)
export class MeetingFileTranscribedHandler implements IEventHandler<MeetingFileTranscribedEvent> {
  private readonly logger = new Logger(MeetingFileTranscribedHandler.name);

  constructor(private readonly queue: MeetingSummaryQueue) {}

  handle(event: MeetingFileTranscribedEvent): void {
    this.logger.log(
      `Получено MeetingFileTranscribedEvent: fileId=${event.fileId}, meetingId=${event.meetingId}`,
    );
    // Триггерим суммаризацию всей встречи, а не отдельного файла
    this.queue.enqueue(event.meetingId);
    this.logger.log(`Встреча ${event.meetingId} передана в MeetingSummaryQueue`);
  }
}
