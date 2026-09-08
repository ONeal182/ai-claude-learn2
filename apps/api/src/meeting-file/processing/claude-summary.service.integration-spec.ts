import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ClaudeAgentModule } from '../../claude-agent/claude-agent.module.js';
import { ClaudeSummaryService } from './claude-summary.service.js';

/**
 * Integration tests for ClaudeSummaryService — Phase 2 Task 1 (optional).
 * Requires real @anthropic-ai/claude-agent-sdk and valid authentication.
 * Skipped when SDK is not installed or authentication is unavailable.
 */
describe.skipIf(!process.env.CLAUDE_AGENT_INTEGRATION_TESTS)(
  'ClaudeSummaryService (integration)',
  () => {
    let moduleRef: TestingModule;
    let service: ClaudeSummaryService;

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true }), ClaudeAgentModule],
        providers: [ClaudeSummaryService],
      }).compile();

      service = moduleRef.get(ClaudeSummaryService);
    });

    afterAll(async () => {
      await moduleRef?.close();
    });

    it('реальная суммаризация мини-транскрипта возвращает валидную структуру с кириллицей', async () => {
      const miniTranscript = `[00:00] Александр: Добрый день, коллеги! Давайте начнём встречу.
[00:15] Мария: Привет! Я хотела обсудить прогресс по проекту.
[00:30] Иван: Да, у меня есть обновления. Мы завершили разработку модуля авторизации.
[00:45] Александр: Отлично! Какие следующие шаги?
[01:00] Мария: Нужно провести code review и написать тесты.
[01:15] Иван: Согласен. Я возьму на себя тесты.
[01:30] Александр: Хорошо, тогда решено. Мария сделает review, Иван — тесты.
[01:45] Мария: До встречи на следующей неделе!`;

      const result = await service.summarize({
        transcriptText: miniTranscript,
        originalName: 'test-meeting-2026-09-08.wav',
      });

      // Валидная структура
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('decisions');
      expect(result).toHaveProperty('actionItems');

      // Типы полей
      expect(typeof result.summary).toBe('string');
      expect(Array.isArray(result.decisions)).toBe(true);
      expect(Array.isArray(result.actionItems)).toBe(true);

      // Непустое содержимое
      expect(result.summary.length).toBeGreaterThan(0);

      // Кириллица в summary (модель должна отвечать по-русски)
      expect(/[а-яА-ЯёЁ]/.test(result.summary)).toBe(true);

      // Если есть decisions/actionItems, проверяем что это строки
      result.decisions.forEach((d) => expect(typeof d).toBe('string'));
      result.actionItems.forEach((a) => expect(typeof a).toBe('string'));

      // Логируем для ручной проверки качества
      console.log('Summary:', result.summary);
      console.log('Decisions:', result.decisions);
      console.log('Action Items:', result.actionItems);
    }, 60000);

    it('пустой транскрипт возвращает резюме без сбоев', async () => {
      const result = await service.summarize({
        transcriptText: '',
        originalName: 'empty.wav',
      });

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('decisions');
      expect(result).toHaveProperty('actionItems');
      expect(typeof result.summary).toBe('string');
    }, 30000);
  },
);
