import { SpawnProcessRunner } from './process-runner.js';

/**
 * `SpawnProcessRunner` — тонкая обёртка над `node:child_process.spawn`: запускает внешнюю
 * команду, копит `stdout`/`stderr` и резолвит `{ stdout, stderr, code }` по завершению.
 * Контракт: код `0` → resolve; ненулевой код и ошибка запуска (`ENOENT`) → reject.
 * Тест гоняет реальный короткий `node -e` — мокать тут нечего.
 */
describe('SpawnProcessRunner', () => {
  const runner = new SpawnProcessRunner();

  it('захватывает stdout в UTF-8 и код завершения 0', async () => {
    const result = await runner.run('node', ['-e', 'process.stdout.write("привет-мир")']);

    expect(result.stdout).toBe('привет-мир');
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('раздельно копит stdout и stderr', async () => {
    const result = await runner.run('node', [
      '-e',
      'process.stderr.write("шум"); process.stdout.write("итог")',
    ]);

    expect(result.stdout).toBe('итог');
    expect(result.stderr).toBe('шум');
    expect(result.code).toBe(0);
  });

  it('ненулевой код завершения → reject', async () => {
    await expect(runner.run('node', ['-e', 'process.exit(3)'])).rejects.toThrow();
  });

  it('неизвестная команда (ENOENT) → reject', async () => {
    await expect(runner.run('definitely-not-a-real-binary-xyzzy', [])).rejects.toThrow();
  });

  it('abort сигнала прерывает запущенный процесс → reject', async () => {
    await expect(
      runner.run('node', ['-e', 'setInterval(() => {}, 1000)'], {
        signal: AbortSignal.timeout(50),
      }),
    ).rejects.toThrow();
  });

  it('добивает SIGKILL процесс, игнорирующий SIGTERM, после grace-таймера', async () => {
    const startedAt = Date.now();

    await expect(
      runner.run('node', ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], {
        signal: AbortSignal.timeout(50),
        killGraceMs: 150,
      }),
    ).rejects.toThrow();

    // без добивающего SIGKILL процесс пережил бы SIGTERM и висел до таймаута теста
    expect(Date.now() - startedAt).toBeLessThan(3000);
  });
});
