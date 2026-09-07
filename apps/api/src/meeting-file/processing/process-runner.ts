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
  /** Прерывание запущенного процесса (таймаут / остановка приложения). */
  signal?: AbortSignal;
  /** Пауза перед добивающим `SIGKILL` после `abort`, мс. Дефолт — `DEFAULT_KILL_GRACE_MS`. */
  killGraceMs?: number;
}

export interface ProcessRunner {
  run(
    command: string,
    args: readonly string[],
    options?: ProcessRunOptions,
  ): Promise<ProcessRunResult>;
}

/** Сколько ждать после `SIGTERM` (его шлёт `spawn` по `abort`) перед добивающим `SIGKILL`. */
export const DEFAULT_KILL_GRACE_MS = 3000;

/**
 * Единственная реализация `ProcessRunner` поверх `node:child_process.spawn` — без внешних пакетов.
 * Контракт: код завершения `0` → resolve `{ stdout, stderr, code }`; ненулевой код или ошибка
 * запуска (`ENOENT` и т.п.) → reject `Error`. Вывод собирается по кускам и декодируется в UTF-8.
 *
 * Отмена: `signal` пробрасывается в `spawn` (Node сам шлёт процессу `SIGTERM` по `abort` и
 * реджектит промис `AbortError`). Если процесс игнорирует `SIGTERM`, по grace-таймеру
 * (`killGraceMs`) ему прилетает `SIGKILL` — иначе зависший `ffmpeg`/whisper удержал бы очередь.
 */
@Injectable()
export class SpawnProcessRunner implements ProcessRunner {
  run(
    command: string,
    args: readonly string[],
    options: ProcessRunOptions = {},
  ): Promise<ProcessRunResult> {
    const { signal, killGraceMs = DEFAULT_KILL_GRACE_MS } = options;

    return new Promise<ProcessRunResult>((resolve, reject) => {
      const child = spawn(command, [...args], { signal });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      let killTimer: NodeJS.Timeout | undefined;
      const onAbort = (): void => {
        killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
        killTimer.unref();
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
      const cleanup = (): void => {
        if (killTimer) clearTimeout(killTimer);
        signal?.removeEventListener('abort', onAbort);
      };

      child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));

      child.on('error', (error) => {
        cleanup();
        reject(error);
      });

      child.on('close', (code) => {
        cleanup();
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
