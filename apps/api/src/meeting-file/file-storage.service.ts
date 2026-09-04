import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Единственная точка работы с файловой системой для файлов встречи (`arch-single-responsibility`).
 * Раскладка плоская: `${UPLOADS_DIR}/${storageKey}`, где `storageKey` — случайный uuid
 * (пользовательский ввод в путь не попадает → нет path traversal).
 * В БД хранится только `storageKey`; абсолютный путь собирается здесь на чтении/удалении.
 */
@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    const dir = config.get<string>('UPLOADS_DIR', './uploads');
    this.baseDir = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  async save(storageKey: string, data: Buffer): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.resolvePath(storageKey), data);
  }

  createReadStream(storageKey: string): ReadStream {
    return createReadStream(this.resolvePath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.resolvePath(storageKey), { force: true });
  }

  private resolvePath(storageKey: string): string {
    return join(this.baseDir, storageKey);
  }
}
