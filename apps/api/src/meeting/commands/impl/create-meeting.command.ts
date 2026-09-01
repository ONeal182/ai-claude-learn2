export class CreateMeetingCommand {
  constructor(
    public readonly title: string,
    public readonly startsAt: string,
  ) {}
}
