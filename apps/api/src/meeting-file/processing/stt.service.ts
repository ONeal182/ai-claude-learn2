import { Injectable } from '@nestjs/common';

/** DI-токен для реализации распознавания речи — потребители зависят от интерфейса, не от класса. */
export const STT_SERVICE = Symbol('STT_SERVICE');

export interface SttInput {
  originalName: string;
  size: number;
}

export interface SttService {
  transcribe(input: SttInput): Promise<string>;
}

/**
 * Единственная реализация STT в этой итерации (реальный движок — вне скоупа PRD).
 * Детерминированная: транскрипт выводится из метаданных файла, без чтения содержимого и
 * без ветвления по `NODE_ENV` (локальный pre-commit идёт с `NODE_ENV=development`, CI — с `test`).
 * Путь ошибки STT в e2e проверяется через `.overrideProvider(STT_SERVICE)` — в проде тестовых веток нет.
 */
@Injectable()
export class StubSttService implements SttService {
  transcribe(input: SttInput): Promise<string> {
    return Promise.resolve(`Транскрипт файла «${input.originalName}» (${input.size} байт).`);
  }
}
