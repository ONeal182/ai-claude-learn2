export class GetMeetingByIdQuery {
  constructor(
    public readonly id: string,
    public readonly userId: string,
  ) {}
}
