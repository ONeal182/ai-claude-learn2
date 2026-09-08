export class ResummarizeMeetingFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {}
}
