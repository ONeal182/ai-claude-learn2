import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

/** DI-токен: потребители (STT-движок) зависят от интерфейса запуска процессов, не от `child_process`. */
export const PROCESS_RUNNER = Symbol('PROCESS_RUNNER');

export interface ProcessRunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ProcessRunOptions {
  /** Прерывание запущенного процесса (таймаут / остановка приложения — задействуется в Фазе 3). */
  signal?: AbortSignal;
  /** Пауза перед добивающим `SIGKILL` после `abort` (Фаза 3). */
  killGraceMs?: number;
}

export interface ProcessRunner {
  run(
    command: string,
    args: readonly string[],
    options?: ProcessRunOptions,
  ): Promise<ProcessRunResult>;
}

/**
 * Единственная реализация `ProcessRunner` поверх `node:child_process.spawn` — без внешних пакетов.
 * Контракт: код завершения `0` → resolve `{ stdout, stderr, code }`; ненулевой код или ошибка
 * запуска (`ENOENT` и т.п.) → reject `Error`. Вывод собирается по кускам и декодируется в UTF-8.
 * Проброс `signal` в `spawn` уже включён; grace-`SIGKILL` — Фаза 3.
 */
@Injectable()
export class SpawnProcessRunner implements ProcessRunner {
  run(
    command: string,
    args: readonly string[],
    options: ProcessRunOptions = {},
  ): Promise<ProcessRunResult> {
    return new Promise<ProcessRunResult>((resolve, reject) => {
      const child = spawn(command, [...args], { signal: options.signal });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));

      child.on('error', (error) => reject(error));

      child.on('close', (code) => {
        const result: ProcessRunResult = {
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          code: code ?? 0,
        };
        if (result.code === 0) {
          resolve(result);
          return;
        }
        const tail = result.stderr.trim();
        reject(
          new Error(
            `Команда «${command}» завершилась с кодом ${result.code}${tail ? `: ${tail}` : ''}`,
          ),
        );
      });
    });
  }
}
