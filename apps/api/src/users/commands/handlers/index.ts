import { CreateUserHandler } from './create-user.handler.js';
import { UpdateUserPasswordHandler } from './update-user-password.handler.js';
import { UpdateUserProfileHandler } from './update-user-profile.handler.js';

export const CommandHandlers = [
  CreateUserHandler,
  UpdateUserProfileHandler,
  UpdateUserPasswordHandler,
];
