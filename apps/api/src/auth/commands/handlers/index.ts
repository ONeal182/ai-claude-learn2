import { RegisterHandler } from './register.handler.js';
import { LoginHandler } from './login.handler.js';
import { ChangePasswordHandler } from './change-password.handler.js';

export const CommandHandlers = [RegisterHandler, LoginHandler, ChangePasswordHandler];
