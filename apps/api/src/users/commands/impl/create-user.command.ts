export class CreateUserCommand {
  constructor(
    public readonly email: string,
    public readonly passwordHash: string,
  ) {}
}
