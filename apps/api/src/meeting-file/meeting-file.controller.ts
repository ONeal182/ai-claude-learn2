import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateMeetingFileCommand } from './commands/impl/create-meeting-file.command.js';
import { DeleteMeetingFileCommand } from './commands/impl/delete-meeting-file.command.js';
import { ReprocessMeetingFileCommand } from './commands/impl/reprocess-meeting-file.command.js';
import { ResummarizeMeetingFileCommand } from './commands/impl/resummarize-meeting-file.command.js';
import { ListMeetingFilesQuery } from './queries/impl/list-meeting-files.query.js';
import { GetMeetingFileQuery } from './queries/impl/get-meeting-file.query.js';
import { GetMeetingFileContentQuery } from './queries/impl/get-meeting-file-content.query.js';
import { attachmentDisposition } from './attachment-disposition.js';
import type { MeetingFileContent } from './dto/meeting-file-content.js';
import type { MeetingFileDto } from './dto/meeting-file.dto.js';
import type { UploadedFilePart } from './dto/uploaded-file-part.js';
import { UploadMeetingFileDto } from './dto/upload-meeting-file.dto.js';

/**
 * Вложенный ресурс `/meetings/:meetingId/files` — под `JwtAuthGuard` (нет/битый токен → 401).
 * Лимит размера тела (→ 413) и белый список mime (→ 400) задаёт `MulterModule` в `MeetingFileModule`;
 * 404 несуществующей встречи / файла — в CQRS-хендлерах.
 */
@Controller('meetings/:meetingId/files')
@UseGuards(JwtAuthGuard)
export class MeetingFileController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('meetingId') meetingId: string,
    @Body() dto: UploadMeetingFileDto,
    @UploadedFile() file: UploadedFilePart | undefined,
    @CurrentUser('userId') userId: string,
  ): Promise<MeetingFileDto> {
    if (!file) {
      throw new BadRequestException('Файл обязателен (поле «file»)');
    }
    // multer отдаёт имя файла из multipart как latin1 — возвращаем в utf-8 (кириллица и пр.)
    const part: UploadedFilePart = {
      originalname: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    };
    return this.commandBus.execute(new CreateMeetingFileCommand(meetingId, dto.type, part, userId));
  }

  @Get()
  list(
    @Param('meetingId') meetingId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<MeetingFileDto[]> {
    return this.queryBus.execute(new ListMeetingFilesQuery(meetingId, userId));
  }

  @Get(':fileId/content')
  async content(
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
  ): Promise<StreamableFile> {
    const { stream, mimeType, originalName }: MeetingFileContent = await this.queryBus.execute(
      new GetMeetingFileContentQuery(meetingId, fileId),
    );
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: attachmentDisposition(originalName),
    });
  }

  @Get(':fileId')
  get(
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
  ): Promise<MeetingFileDto> {
    return this.queryBus.execute(new GetMeetingFileQuery(meetingId, fileId));
  }

  @Post(':fileId/reprocess')
  @HttpCode(HttpStatus.OK)
  reprocess(
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
  ): Promise<MeetingFileDto> {
    return this.commandBus.execute(new ReprocessMeetingFileCommand(meetingId, fileId));
  }

  @Post(':fileId/resummarize')
  @HttpCode(HttpStatus.OK)
  resummarize(
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
  ): Promise<MeetingFileDto> {
    return this.commandBus.execute(new ResummarizeMeetingFileCommand(meetingId, fileId));
  }

  @Delete(':fileId')
  remove(@Param('meetingId') meetingId: string, @Param('fileId') fileId: string): Promise<void> {
    return this.commandBus.execute(new DeleteMeetingFileCommand(meetingId, fileId));
  }
}
