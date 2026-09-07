import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

/**
 * Единственная точка работы с файловой системой для загруженных бинарников
 * (файлы встречи, аватары пользователей — `arch-single-responsibility`).
 * Раскладка плоская: `${UPLOADS_DIR}/${storageKey}`, где `storageKey` — случайный uuid
 * (пользовательский ввод в путь не попадает → нет path traversal).
 * В БД хранится только `storageKey`; абсолютный путь собирается здесь на чтении/удалении.
 * Провайдится через `StorageModule`, который импортируют и `meeting-file`, и `profile`.
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
    // каталог гарантирован `onModuleInit`
    await writeFile(this.resolvePath(storageKey), data);
  }

  /** Есть ли бинарник на диске — запись в БД может пережить пропавший файл. */
  async exists(storageKey: string): Promise<boolean> {
    try {
      await access(this.resolvePath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  createReadStream(storageKey: string): ReadStream {
    return createReadStream(this.resolvePath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.resolvePath(storageKey), { force: true });
  }

  /**
   * Абсолютный путь к бинарнику по ключу — для потребителей, которым нужен путь на диске
   * (STT-движок отдаёт файл внешнему процессу). Барьер: `storageKey` должен быть одиночным
   * сегментом (как `randomUUID`) — пустой ключ, `..`, разделители пути и абсолютный путь
   * отклоняются, даже если сейчас все вызывающие стороны передают uuid (defense-in-depth).
   */
  absolutePath(storageKey: string): string {
    const rejected =
      storageKey.length === 0 ||
      storageKey === '..' ||
      storageKey.includes('/') ||
      storageKey.includes('\\') ||
      storageKey.includes(sep) ||
      isAbsolute(storageKey);
    const full = rejected ? '' : resolve(this.baseDir, storageKey);
    if (rejected || (full !== this.baseDir && !full.startsWith(this.baseDir + sep))) {
      throw new BadRequestException('Некорректный ключ файла');
    }
    return full;
  }

  private resolvePath(storageKey: string): string {
    return join(this.baseDir, storageKey);
  }
}
