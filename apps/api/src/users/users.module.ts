import { Module } from '@nestjs/common';
import { CommandHandlers } from './commands/handlers/index.js';
import { QueryHandlers } from './queries/handlers/index.js';

/**
 * CQRS-хендлеры регистрируются как provider'ы модуля, но модуль не импортирует
 * и не экспортирует ничего — с auth-модулем он взаимодействует только через
 * общую шину CommandBus/QueryBus (CqrsModule.forRoot() из AuthModule глобален).
 */
@Module({
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class UsersModule {}
