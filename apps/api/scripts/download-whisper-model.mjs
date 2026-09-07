#!/usr/bin/env node
/**
 * Разовая загрузка ggml-модели whisper.cpp `tiny` в `WHISPER_MODEL_PATH`
 * (дефолт `./.whisper/ggml-tiny.bin` относительно cwd `apps/api`).
 *
 * Идемпотентно: если файл уже есть и непустой — выходит без сети. Докачка на лету в рантайме
 * API — вне скоупа (см. PRD), это именно setup-шаг. Чистый ESM, без внешних пакетов.
 *
 *   pnpm --filter api whisper:model
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin?download=true';

const modelPath = resolve(process.env.WHISPER_MODEL_PATH || './.whisper/ggml-tiny.bin');

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function main() {
  const existing = await fileSize(modelPath);
  if (existing > 0) {
    console.log(`Модель уже на месте (${existing} байт): ${modelPath}`);
    return;
  }

  await mkdir(dirname(modelPath), { recursive: true });

  console.log(`Качаю ggml-tiny → ${modelPath}`);
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Загрузка не удалась: HTTP ${response.status} ${response.statusText}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(modelPath));

  const size = await fileSize(modelPath);
  if (size === 0) {
    throw new Error('Скачан пустой файл модели');
  }
  console.log(`Готово: ${size} байт → ${modelPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
