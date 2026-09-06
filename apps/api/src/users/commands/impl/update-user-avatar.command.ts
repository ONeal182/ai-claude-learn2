export class UpdateUserAvatarCommand {
  constructor(
    public readonly userId: string,
    public readonly avatarKey: string,
  ) {}
}
