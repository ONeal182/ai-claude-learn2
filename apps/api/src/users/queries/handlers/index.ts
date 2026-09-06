import { FindUserByAvatarKeyHandler } from './find-user-by-avatar-key.handler.js';
import { FindUserByEmailHandler } from './find-user-by-email.handler.js';
import { FindUserByIdHandler } from './find-user-by-id.handler.js';

export const QueryHandlers = [
  FindUserByEmailHandler,
  FindUserByIdHandler,
  FindUserByAvatarKeyHandler,
];
