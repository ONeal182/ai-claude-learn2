import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

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
   * Собирает абсолютный путь и проверяет, что он не вышел за пределы `baseDir`
   * (defense-in-depth: сейчас `storageKey` всегда генерируется как uuid, но
   * барьер не должен зависеть от вызывающей стороны — `..`, абсолютный путь,
   * разделители в ключе отклоняются).
   */
  private resolvePath(storageKey: string): string {
    const full = resolve(this.baseDir, storageKey);
    if (full !== this.baseDir && !full.startsWith(this.baseDir + sep)) {
      throw new BadRequestException('Некорректный ключ файла');
    }
    return full;
  }
}
