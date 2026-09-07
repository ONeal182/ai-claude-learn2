export class ListMeetingFilesQuery {
  constructor(
    public readonly ownerId: string,
    public readonly meetingId: string,
  ) {}
}
