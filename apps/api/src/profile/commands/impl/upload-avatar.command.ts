import type { UploadedAvatarPart } from '../../dto/uploaded-avatar-part.js';

export class UploadAvatarCommand {
  constructor(
    public readonly userId: string,
    public readonly file: UploadedAvatarPart,
  ) {}
}
