export class RegenerateMeetingSummaryCommand {
  constructor(
    public readonly meetingId: string,
    public readonly userId: string,
  ) {}
}
