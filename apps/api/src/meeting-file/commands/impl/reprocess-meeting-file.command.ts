export class ReprocessMeetingFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {}
}
