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
   * Абсолютный путь к бинарнику по ключу — для потребителей, которым нужен путь на диске
   * (STT-движок отдаёт файл внешнему процессу). Тонкая обёртка над тем же барьером
   * `resolvePath`, что и у `save`/`exists`/`createReadStream`/`remove`.
   */
  absolutePath(storageKey: string): string {
    return this.resolvePath(storageKey);
  }

  /**
   * Единственная точка построения пути. `storageKey` обязан быть одиночным сегментом
   * (как `randomUUID` — так его и формируют все вызывающие стороны): пустой ключ, `..`,
   * разделители пути и абсолютный путь отклоняются, а собранный путь не должен выходить
   * за пределы `baseDir` (defense-in-depth — барьер не зависит от вызывающей стороны).
   */
  private resolvePath(storageKey: string): string {
    if (
      storageKey.length === 0 ||
      storageKey === '..' ||
      storageKey.includes('/') ||
      storageKey.includes('\\') ||
      isAbsolute(storageKey)
    ) {
      throw new BadRequestException('Некорректный ключ файла');
    }
    const full = resolve(this.baseDir, storageKey);
    if (full !== this.baseDir && !full.startsWith(this.baseDir + sep)) {
      throw new BadRequestException('Некорректный ключ файла');
    }
    return full;
  }
}
