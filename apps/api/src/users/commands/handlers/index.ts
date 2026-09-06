import { CreateUserHandler } from './create-user.handler.js';
import { UpdateUserAvatarHandler } from './update-user-avatar.handler.js';
import { UpdateUserProfileHandler } from './update-user-profile.handler.js';

export const CommandHandlers = [
  CreateUserHandler,
  UpdateUserProfileHandler,
  UpdateUserAvatarHandler,
];
