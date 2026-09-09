import { Injectable, Logger } from '@nestjs/common';
import { ClaudeAgentService } from '../../claude-agent/claude-agent.service.js';
import { createMeetingMcpServer } from '../../claude-agent/meeting-tools.js';
import { FileLoggerService } from '../../common/file-logger.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TaskService } from '../../task/task.service.js';
import type { SummaryInput, SummaryService, MeetingFileSummary } from './summary.service.js';

/**
 * Реальная суммаризация транскриптов встреч через Claude Agent SDK.
 * Промпт на русском, строгий формат JSON-ответа.
 * Использует MCP-тулы для работы с задачами и встречами.
 */
@Injectable()
export class ClaudeSummaryService implements SummaryService {
  private readonly logger = new Logger(ClaudeSummaryService.name);

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    private readonly prisma: PrismaService,
    private readonly taskService: TaskService,
    private readonly fileLogger: FileLoggerService,
  ) {}

  async summarize(input: SummaryInput): Promise<MeetingFileSummary> {
    const startTime = Date.now();
    const logPath = this.fileLogger.getLogPath('logs/summarization', 'claude-api.log');

    await this.fileLogger.log(logPath, 'Claude API call started', {
      meetingId: input.meetingId,
      transcriptLength: input.transcriptText.length,
    });

    const systemPrompt = `Ты — ассистент по суммаризации транскриптов встреч.

КРИТИЧЕСКИ ВАЖНО: Твой ПЕРВЫЙ и ПОСЛЕДНИЙ ответ должен быть ТОЛЬКО валидный JSON в следующем формате:
{
  "summary": "Краткое резюме встречи (1-2 абзаца на русском языке)",
  "decisions": ["Решение 1", "Решение 2"],
  "actionItems": ["Задача 1", "Задача 2"]
}

ЗАПРЕЩЕНО:
- Приветствия, вопросы или любой текст до/после JSON
- Markdown code blocks (никаких \`\`\`json)
- Комментарии или пояснения
- Любой текст кроме валидного JSON объекта

Если в транскрипте нет решений или задач - используй пустые массивы: [], а не null.

ВАЖНО: Генерируй ТОЛЬКО русский текст. Не используй символы из других языков (китайский, японский, корейский и т.д.).

Транскрипт может содержать несколько файлов одной встречи с заголовками "=== Файл N: название ===".
Проанализируй ВСЕ файлы вместе как единую встречу.

У тебя есть доступ к инструментам:
- find_tasks(query) — поиск существующих задач
- upsert_task(title, status, id?) — создание или обновление задачи
- update_meeting(summary, decisions) — сохранение итогов встречи

Алгоритм работы:
1. Проанализируй весь транскрипт
2. Для каждой задачи из actionItems: вызови find_tasks, затем upsert_task (с id если найдена, без id если новая)
3. Вызови update_meeting с summary и decisions
4. Верни ТОЛЬКО JSON с полями summary, decisions, actionItems

НАЧИНАЙ ОТВЕТ СРАЗУ С { и ЗАКАНЧИВАЙ НА }`;

    try {
      // Создать MCP-сервер с тулами, ограниченными текущей встречей
      const mcpServer = await createMeetingMcpServer(
        this.prisma,
        this.taskService,
        input.meetingId,
      );

      // Добавим явное указание вернуть JSON в начале промпта пользователя
      const userPrompt = `Проанализируй следующий транскрипт и верни ТОЛЬКО валидный JSON объект (начинающийся с { и заканчивающийся на }) с полями summary, decisions, actionItems.

Транскрипт:
${input.transcriptText}

Помни: никакого текста до или после JSON, только сам JSON объект.`;

      const responseText = await this.claudeAgent.ask(userPrompt, {
        systemPrompt,
        signal: input.signal,
        tools: [mcpServer],
        maxTurns: 10, // Разрешить агенту использовать тулы
      });

      // Извлечь JSON из ответа (модель может обернуть его в markdown-блок)
      let jsonText = responseText.trim();
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }

      // Парсинг и валидация
      const parsed = JSON.parse(jsonText);

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof parsed.summary !== 'string' ||
        !Array.isArray(parsed.decisions) ||
        !Array.isArray(parsed.actionItems)
      ) {
        throw new Error(
          'Claude Agent вернул невалидную структуру: ожидается { summary: string, decisions: string[], actionItems: string[] }',
        );
      }

      // Проверка, что все элементы массивов — строки
      if (
        !parsed.decisions.every((item: unknown) => typeof item === 'string') ||
        !parsed.actionItems.every((item: unknown) => typeof item === 'string')
      ) {
        throw new Error(
          'Claude Agent вернул невалидные массивы: элементы decisions и actionItems должны быть строками',
        );
      }

      // Проверка, что summary не пустая
      if (parsed.summary.trim() === '') {
        throw new Error('Claude Agent вернул пустое резюме');
      }

      // Валидация: проверка на китайские символы (CJK Unified Ideographs)
      const validateNoChineseChars = async (text: string, fieldName: string): Promise<void> => {
        if (/[一-鿿]/.test(text)) {
          const validationLogPath = this.fileLogger.getLogPath(
            'logs/summarization',
            'validation-failures.log',
          );

          const excerpt = text.substring(0, 100);
          await this.fileLogger.log(validationLogPath, 'Chinese characters detected', {
            meetingId: input.meetingId,
            timestamp: new Date().toISOString(),
            fieldName,
            textExcerpt: excerpt,
          });

          throw new Error(
            `${fieldName} содержит китайские символы. Ожидается текст только на русском языке.`,
          );
        }
      };

      await validateNoChineseChars(parsed.summary, 'Summary');
      for (let index = 0; index < parsed.decisions.length; index++) {
        await validateNoChineseChars(parsed.decisions[index], `Decision[${index}]`);
      }
      for (let index = 0; index < parsed.actionItems.length; index++) {
        await validateNoChineseChars(parsed.actionItems[index], `ActionItem[${index}]`);
      }

      const summary: MeetingFileSummary = {
        summary: parsed.summary,
        decisions: parsed.decisions,
        actionItems: parsed.actionItems,
      };

      const duration = Date.now() - startTime;

      await this.fileLogger.log(logPath, 'Claude API call completed', {
        meetingId: input.meetingId,
        durationMs: duration,
        decisionsCount: summary.decisions.length,
        actionItemsCount: summary.actionItems.length,
        summaryLength: summary.summary.length,
        responseLength: responseText.length,
      });

      this.logger.log(
        `Суммаризация завершена: ${summary.decisions.length} решений, ${summary.actionItems.length} задач (${duration}ms)`,
      );

      return summary;
    } catch (error) {
      const duration = Date.now() - startTime;
      const reason = error instanceof Error ? error.message : String(error);

      await this.fileLogger.log(logPath, 'Claude API call failed', {
        meetingId: input.meetingId,
        durationMs: duration,
        error: reason,
      });

      this.logger.error(`Ошибка суммаризации: ${reason}`);
      throw new Error(`Не удалось суммаризировать транскрипт: ${reason}`);
    }
  }
}
