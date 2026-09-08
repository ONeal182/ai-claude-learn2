import { ClaudeAgentService, ClaudeAgentError } from '../../claude-agent/claude-agent.service.js';
import { ClaudeSummaryService } from './claude-summary.service.js';

/**
 * Unit tests for ClaudeSummaryService — Phase 2 Task 1.
 * Mock ClaudeAgentService to verify JSON parsing and validation without real Claude calls.
 */
describe('ClaudeSummaryService', () => {
  let service: ClaudeSummaryService;
  let mockClaudeAgent: { ask: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClaudeAgent = {
      ask: vi.fn(),
    };
    service = new ClaudeSummaryService(mockClaudeAgent as unknown as ClaudeAgentService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const validInput = {
    transcriptText: '[00:00] Участник 1: Начинаем встречу.\n[00:15] Участник 2: Обсудим план.',
    originalName: 'meeting-2026-09-08.wav',
  };

  describe('валидный JSON-ответ', () => {
    it('возвращает {summary, decisions[], actionItems[]}', async () => {
      const validJson = JSON.stringify({
        summary: 'Обсуждался план спринта и приоритеты задач.',
        decisions: ['Решили начать с задачи A', 'Отложили задачу B до следующей недели'],
        actionItems: ['Иван: подготовить дизайн', 'Мария: написать тесты'],
      });

      mockClaudeAgent.ask.mockResolvedValue(validJson);

      const result = await service.summarize(validInput);

      expect(result).toEqual({
        summary: 'Обсуждался план спринта и приоритеты задач.',
        decisions: ['Решили начать с задачи A', 'Отложили задачу B до следующей недели'],
        actionItems: ['Иван: подготовить дизайн', 'Мария: написать тесты'],
      });

      expect(mockClaudeAgent.ask).toHaveBeenCalledWith(
        validInput.transcriptText,
        expect.objectContaining({
          systemPrompt: expect.stringContaining('JSON'),
        }),
      );
    });

    it('пустые массивы decisions/actionItems валидны', async () => {
      const validJson = JSON.stringify({
        summary: 'Встреча без конкретных решений.',
        decisions: [],
        actionItems: [],
      });

      mockClaudeAgent.ask.mockResolvedValue(validJson);

      const result = await service.summarize(validInput);

      expect(result.summary).toBe('Встреча без конкретных решений.');
      expect(result.decisions).toEqual([]);
      expect(result.actionItems).toEqual([]);
    });

    it('signal пробрасывается в ask()', async () => {
      const controller = new AbortController();
      const validJson = JSON.stringify({
        summary: 'Test',
        decisions: [],
        actionItems: [],
      });

      mockClaudeAgent.ask.mockResolvedValue(validJson);

      await service.summarize({ ...validInput, signal: controller.signal });

      expect(mockClaudeAgent.ask).toHaveBeenCalledWith(
        validInput.transcriptText,
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });
  });

  describe('не-JSON ответ', () => {
    it('бросает ошибку при невалидном JSON', async () => {
      mockClaudeAgent.ask.mockResolvedValue('This is not JSON at all');

      await expect(service.summarize(validInput)).rejects.toThrow(/JSON/i);
    });

    it('бросает ошибку при частичном JSON с текстом вокруг', async () => {
      mockClaudeAgent.ask.mockResolvedValue(
        'Here is the summary: {"summary": "text", "decisions": [], "actionItems": []} and some more text',
      );

      await expect(service.summarize(validInput)).rejects.toThrow(/JSON/i);
    });
  });

  describe('невалидная форма JSON', () => {
    it('отсутствует поле summary', async () => {
      const invalidJson = JSON.stringify({
        decisions: ['Решение 1'],
        actionItems: ['Задача 1'],
      });

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/summary/i);
    });

    it('summary пустая строка', async () => {
      const invalidJson = JSON.stringify({
        summary: '',
        decisions: [],
        actionItems: [],
      });

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/пустое резюме/i);
    });

    it('summary не строка', async () => {
      const invalidJson = JSON.stringify({
        summary: 123,
        decisions: [],
        actionItems: [],
      });

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/summary/i);
    });

    it('decisions отсутствует', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        actionItems: [],
      });

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/decisions/i);
    });

    it('decisions не массив', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: 'Решение 1, Решение 2',
        actionItems: [],
      });

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/decisions/i);
    });

    it('decisions содержит не-строки', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: ['Решение 1', 123, 'Решение 3'],
        actionItems: [],
      });

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/decisions/i);
    });

    it('actionItems отсутствует', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: [],
      });

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/actionItems/i);
    });

    it('actionItems не массив', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: [],
        actionItems: { task1: 'Подготовить отчёт' },
      });

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/actionItems/i);
    });

    it('actionItems содержит не-строки', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: [],
        actionItems: ['Задача 1', null, 'Задача 3'],
      });

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/actionItems/i);
    });

    it('JSON не объект (массив)', async () => {
      const invalidJson = JSON.stringify(['summary', 'decisions', 'actionItems']);

      mockClaudeAgent.ask.mockResolvedValue(invalidJson);

      await expect(service.summarize(validInput)).rejects.toThrow(/невалидную структуру/i);
    });

    it('JSON примитив (строка)', async () => {
      mockClaudeAgent.ask.mockResolvedValue('"just a string"');

      await expect(service.summarize(validInput)).rejects.toThrow(/невалидную структуру/i);
    });
  });

  describe('ClaudeAgentService бросает исключение', () => {
    it('пробрасывает ClaudeAgentError', async () => {
      mockClaudeAgent.ask.mockRejectedValue(
        new ClaudeAgentError('@anthropic-ai/claude-agent-sdk is not installed'),
      );

      await expect(service.summarize(validInput)).rejects.toThrow(/not installed/i);
    });

    it('пробрасывает прочие исключения', async () => {
      mockClaudeAgent.ask.mockRejectedValue(new Error('Network timeout'));

      await expect(service.summarize(validInput)).rejects.toThrow('Network timeout');
    });
  });
});
