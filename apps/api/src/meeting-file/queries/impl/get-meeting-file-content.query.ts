export class GetMeetingFileContentQuery {
  constructor(
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {}
}
