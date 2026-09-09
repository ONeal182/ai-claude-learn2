import { Injectable } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Сервис для записи логов в файлы с временными метками.
 * Каждый лог записывается в отдельный файл с префиксом даты.
 */
@Injectable()
export class FileLoggerService {
  /**
   * Записать лог в файл.
   * @param logPath - путь к файлу лога относительно корня проекта
   * @param message - сообщение для записи
   * @param data - дополнительные данные для записи (будут сериализованы в JSON)
   */
  async log(logPath: string, message: string, data?: Record<string, unknown>): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        message,
        ...(data && { data }),
      };

      const logLine = JSON.stringify(logEntry) + '\n';

      // Создать директорию если не существует
      await mkdir(dirname(logPath), { recursive: true });

      // Записать лог
      await appendFile(logPath, logLine, 'utf-8');
    } catch (error) {
      // Не падаем если логирование не удалось
      console.error(`Failed to write log to ${logPath}:`, error);
    }
  }

  /**
   * Получить путь к файлу лога с префиксом даты.
   * @param baseDir - базовая директория (например, 'logs/transcription')
   * @param fileName - имя файла (например, 'transcription.log')
   * @returns путь вида 'logs/transcription/2026-09-09-transcription.log'
   */
  getLogPath(baseDir: string, fileName: string): string {
    const date = new Date().toISOString().split('T')[0];
    return `${baseDir}/${date}-${fileName}`;
  }
}
