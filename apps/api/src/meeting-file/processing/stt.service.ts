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
 * Подстрока в имени файла, по которой заглушка детерминированно бросает ошибку.
 * Нужна e2e для проверки `reprocess` (получить статус `failed` без спец-эндпоинтов).
 */
export const STT_FAIL_MARKER = '__stt_fail__';

/**
 * Единственная реализация STT в этой итерации (реальный движок — вне скоупа PRD).
 * Детерминированная: транскрипт выводится из метаданных файла, без чтения содержимого и
 * без ветвления по `NODE_ENV` (локальный pre-commit идёт с `NODE_ENV=development`, CI — с `test`).
 */
@Injectable()
export class StubSttService implements SttService {
  transcribe(input: SttInput): Promise<string> {
    if (input.originalName.includes(STT_FAIL_MARKER)) {
      return Promise.reject(
        new Error(
          `STT stub: имитация сбоя по маркеру «${STT_FAIL_MARKER}» в имени «${input.originalName}»`,
        ),
      );
    }
    return Promise.resolve(`Транскрипт файла «${input.originalName}» (${input.size} байт).`);
  }
}
