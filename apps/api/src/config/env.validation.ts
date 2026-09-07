import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { resolveSttEngine } from '../meeting-file/processing/stt-engine.js';

/**
 * Валидатор окружения для `ConfigModule.forRoot({ validate })` — выполняется один раз на старте.
 *
 * Сейчас проверяет только конфигурацию STT-движка: при `STT_ENGINE=whisper` (в т.ч. по дефолту)
 * `WHISPER_BIN_PATH` и `WHISPER_MODEL_PATH` должны указывать на существующие файлы. В `production`
 * пропуск — фатальный (`throw`, приложение не стартует), вне production — `Logger.warn` и старт
 * продолжается (локальный dev / CI на stub-override не должны падать). Конфиг возвращается как есть.
 *
 * `existsSync` здесь допустим: разовая boot-time проверка, не горячий путь и не конструктор сервиса.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const problems: string[] = [];

  const engine = resolveSttEngine(
    typeof config.STT_ENGINE === 'string' ? config.STT_ENGINE : undefined,
  );

  if (engine === 'whisper') {
    const bin = typeof config.WHISPER_BIN_PATH === 'string' ? config.WHISPER_BIN_PATH.trim() : '';
    const model =
      typeof config.WHISPER_MODEL_PATH === 'string' ? config.WHISPER_MODEL_PATH.trim() : '';

    if (!bin || !existsSync(bin)) {
      problems.push('WHISPER_BIN_PATH is missing or does not point to an existing file');
    }
    if (!model || !existsSync(model)) {
      problems.push('WHISPER_MODEL_PATH is missing or does not point to an existing file');
    }
  }

  if (problems.length > 0) {
    const details = problems.map((p) => `  - ${p}`).join('\n');
    const message = `STT_ENGINE=whisper, но движок не сконфигурирован:\n${details}\nЗапустите \`pnpm --filter api whisper:model\` и укажите WHISPER_BIN_PATH, либо выставьте STT_ENGINE=stub.`;

    if (config.NODE_ENV === 'production') {
      throw new Error(message);
    }
    new Logger('EnvValidation').warn(`${message}\n(допустимо только вне production)`);
  }

  return config;
}
