import { Injectable, Logger } from '@nestjs/common';
import { ClaudeAgentService } from '../../claude-agent/claude-agent.service.js';
import type { SummaryInput, SummaryService, MeetingFileSummary } from './summary.service.js';

/**
 * Реальная суммаризация транскриптов встреч через Claude Agent SDK.
 * Промпт на русском, строгий формат JSON-ответа.
 */
@Injectable()
export class ClaudeSummaryService implements SummaryService {
  private readonly logger = new Logger(ClaudeSummaryService.name);

  constructor(private readonly claudeAgent: ClaudeAgentService) {}

  async summarize(input: SummaryInput): Promise<MeetingFileSummary> {
    const systemPrompt = `Ты — ассистент по суммаризации транскриптов встреч. Проанализируй транскрипт и верни результат СТРОГО в формате JSON без дополнительных пояснений, комментариев или markdown-разметки.

Формат ответа:
{
  "summary": "Краткое резюме встречи (1-2 абзаца на русском языке)",
  "decisions": ["Решение 1", "Решение 2", ...],
  "actionItems": ["Задача 1", "Задача 2", ...]
}

Требования:
- summary: краткое содержание встречи, основные темы и результаты
- decisions: список всех принятых решений (пустой массив, если решений не было)
- actionItems: список задач и действий, которые нужно выполнить (пустой массив, если задач не было)
- Все тексты на русском языке
- Только валидный JSON, без markdown code blocks, без текста до или после JSON`;

    try {
      const responseText = await this.claudeAgent.ask(input.transcriptText, {
        systemPrompt,
        signal: input.signal,
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

      const summary: MeetingFileSummary = {
        summary: parsed.summary,
        decisions: parsed.decisions,
        actionItems: parsed.actionItems,
      };

      this.logger.log(
        `Суммаризация завершена: ${summary.decisions.length} решений, ${summary.actionItems.length} задач`,
      );

      return summary;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ошибка суммаризации: ${reason}`);
      throw new Error(`Не удалось суммаризировать транскрипт: ${reason}`);
    }
  }
}
