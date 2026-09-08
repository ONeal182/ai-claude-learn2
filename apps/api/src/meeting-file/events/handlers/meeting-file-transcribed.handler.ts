import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MeetingFileSummaryQueue } from '../../processing/meeting-file-summary.queue.js';
import { MeetingFileTranscribedEvent } from '../impl/meeting-file-transcribed.event.js';

/** Ставит файл в in-process очередь суммаризации после транскрибации. */
@Injectable()
@EventsHandler(MeetingFileTranscribedEvent)
export class MeetingFileTranscribedHandler implements IEventHandler<MeetingFileTranscribedEvent> {
  constructor(private readonly queue: MeetingFileSummaryQueue) {}

  handle(event: MeetingFileTranscribedEvent): void {
    this.queue.enqueue(event.fileId);
  }
}
