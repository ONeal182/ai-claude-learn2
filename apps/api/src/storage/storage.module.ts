import { Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service.js';

/**
 * Переиспользуемое файловое хранилище: провайдит и экспортирует `FileStorageService`
 * (плоская раскладка в `UPLOADS_DIR`, ключ — случайный uuid). Импортируется всеми
 * модулями, которым нужно писать/читать загруженные бинарники: `meeting-file`, `profile` (аватары).
 */
@Module({
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class StorageModule {}
