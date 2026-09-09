export class ListMeetingFilesQuery {
  constructor(
    public readonly meetingId: string,
    public readonly userId: string,
  ) {}
}
