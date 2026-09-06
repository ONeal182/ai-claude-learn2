import { Test, TestingModule } from '@nestjs/testing';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { ChangePasswordHandler } from './change-password.handler.js';
import { ChangePasswordCommand } from '../impl/change-password.command.js';
import { FindUserByIdQuery } from '../../../users/queries/impl/find-user-by-id.query.js';
import { UpdateUserPasswordCommand } from '../../../users/commands/impl/update-user-password.command.js';

describe('ChangePasswordHandler', () => {
  let handler: ChangePasswordHandler;
  let commandBus: { execute: ReturnType<typeof vi.fn> };
  let queryBus: { execute: ReturnType<typeof vi.fn> };

  const userId = 'user-1';
  const currentPassword = 'correct-horse-battery-staple';
  const newPassword = 'brand-new-secret-password';

  beforeEach(async () => {
    commandBus = { execute: vi.fn().mockResolvedValue(undefined) };
    queryBus = { execute: vi.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChangePasswordHandler,
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
      ],
    }).compile();

    handler = moduleRef.get(ChangePasswordHandler);
  });

  it('сверяет старый пароль, хеширует новый и зовёт UpdateUserPasswordCommand', async () => {
    queryBus.execute.mockResolvedValue({
      id: userId,
      email: 'a@example.com',
      password: await hash(currentPassword, 10),
    });

    await handler.execute(new ChangePasswordCommand(userId, currentPassword, newPassword));

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(FindUserByIdQuery));

    const updateCmd = commandBus.execute.mock.calls[0][0] as UpdateUserPasswordCommand;
    expect(updateCmd).toBeInstanceOf(UpdateUserPasswordCommand);
    expect(updateCmd.userId).toBe(userId);
    expect(updateCmd.passwordHash).not.toBe(newPassword);
    await expect(compare(newPassword, updateCmd.passwordHash)).resolves.toBe(true);
  });

  it('бросает UnauthorizedException и не меняет пароль при неверном currentPassword', async () => {
    queryBus.execute.mockResolvedValue({
      id: userId,
      email: 'a@example.com',
      password: await hash(currentPassword, 10),
    });

    await expect(
      handler.execute(new ChangePasswordCommand(userId, 'wrong-password', newPassword)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('бросает UnauthorizedException, если пользователь не найден', async () => {
    queryBus.execute.mockResolvedValue(null);

    await expect(
      handler.execute(new ChangePasswordCommand('missing', currentPassword, newPassword)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
