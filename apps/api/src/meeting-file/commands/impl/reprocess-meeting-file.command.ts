export class ReprocessMeetingFileCommand {
  constructor(
    public readonly ownerId: string,
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {}
}
