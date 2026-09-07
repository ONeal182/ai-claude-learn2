export class GetMeetingFileQuery {
  constructor(
    public readonly ownerId: string,
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {}
}
