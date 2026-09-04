import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MeetingFileProcessingQueue } from '../../processing/meeting-file-processing.queue.js';
import { MeetingFileUploadedEvent } from '../impl/meeting-file-uploaded.event.js';

/** Автозапуск фоновой обработки для загруженных записей (`recording`); вложения не обрабатываются. */
@Injectable()
@EventsHandler(MeetingFileUploadedEvent)
export class MeetingFileUploadedHandler implements IEventHandler<MeetingFileUploadedEvent> {
  constructor(private readonly queue: MeetingFileProcessingQueue) {}

  handle(event: MeetingFileUploadedEvent): void {
    if (event.type === 'recording') {
      this.queue.enqueue(event.fileId);
    }
  }
}
