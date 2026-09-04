import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MeetingFileProcessingQueue } from '../../processing/meeting-file-processing.queue.js';
import { MeetingFileProcessingRequestedEvent } from '../impl/meeting-file-processing-requested.event.js';

/** Ставит файл в in-process очередь обработки. Оба входа (загрузка recording и reprocess) идут сюда. */
@Injectable()
@EventsHandler(MeetingFileProcessingRequestedEvent)
export class MeetingFileProcessingRequestedHandler implements IEventHandler<MeetingFileProcessingRequestedEvent> {
  constructor(private readonly queue: MeetingFileProcessingQueue) {}

  handle(event: MeetingFileProcessingRequestedEvent): void {
    this.queue.enqueue(event.fileId);
  }
}
