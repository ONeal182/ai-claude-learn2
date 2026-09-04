import { GetMeetingFileHandler } from './get-meeting-file.handler.js';
import { GetMeetingFileContentHandler } from './get-meeting-file-content.handler.js';
import { ListMeetingFilesHandler } from './list-meeting-files.handler.js';

export const QueryHandlers = [
  ListMeetingFilesHandler,
  GetMeetingFileHandler,
  GetMeetingFileContentHandler,
];
