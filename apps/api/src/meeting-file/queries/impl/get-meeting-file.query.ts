export class GetMeetingFileQuery {
  constructor(
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {}
}
