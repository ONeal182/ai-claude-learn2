import { Injectable } from '@nestjs/common';

/** DI-токен для реализации распознавания речи — потребители зависят от интерфейса, не от класса. */
export const STT_SERVICE = Symbol('STT_SERVICE');

/** Движок распознавания: `whisper` — реальный whisper.cpp, `stub` — детерминированная заглушка. */
export type SttEngine = 'whisper' | 'stub';

/**
 * Дефолт `STT_ENGINE`, если переменная не задана.
 * Фаза 1: `stub` — безопасно для локалки без установленного whisper.cpp. Фаза 4 → `whisper`.
 */
export const DEFAULT_STT_ENGINE: SttEngine = 'stub';

export interface SttInput {
  originalName: string;
  size: number;
  /** Ключ бинарника в `FileStorageService` — движок берёт файл с диска по нему. */
  storageKey: string;
  /** mime исходного файла — решает, нужна ли конвертация в WAV (Фаза 2). */
  mimeType: string;
  /** Прерывание транскрибации (таймаут / остановка приложения — Фаза 3). */
  signal?: AbortSignal;
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
