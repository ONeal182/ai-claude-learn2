export class MeetingCreatedEvent {
  constructor(
    public readonly meetingId: string,
    public readonly title: string,
  ) {}
}
