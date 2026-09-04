import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import type { MeetingFile } from '@prisma/client';
import type { MeetingFileContent } from '../../dto/meeting-file-content.js';
import { FileStorageService } from '../../file-storage.service.js';
import { GetMeetingFileQuery } from '../impl/get-meeting-file.query.js';
import { GetMeetingFileContentQuery } from '../impl/get-meeting-file-content.query.js';

@Injectable()
@QueryHandler(GetMeetingFileContentQuery)
export class GetMeetingFileContentHandler implements IQueryHandler<
  GetMeetingFileContentQuery,
  MeetingFileContent
> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly storage: FileStorageService,
  ) {}

  async execute(query: GetMeetingFileContentQuery): Promise<MeetingFileContent> {
    // чтение записи — через единый источник (404, если файла нет / он у другой встречи)
    const file = await this.queryBus.execute<GetMeetingFileQuery, MeetingFile>(
      new GetMeetingFileQuery(query.meetingId, query.fileId),
    );

    // запись есть, а бинарник на диске пропал — это 404, а не 500 от упавшего потока
    if (!(await this.storage.exists(file.storageKey))) {
      throw new NotFoundException(`Файл ${query.fileId} не найден`);
    }

    return {
      stream: this.storage.createReadStream(file.storageKey),
      mimeType: file.mimeType,
      originalName: file.originalName,
    };
  }
}
