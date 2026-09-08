import { ClaudeAgentService, ClaudeAgentError } from '../../claude-agent/claude-agent.service.js';
import { ClaudeSummaryService } from './claude-summary.service.js';

/**
 * Unit tests for ClaudeSummaryService — Phase 2 Task 1.
 * Mock ClaudeAgentService to verify JSON parsing and validation without real Claude calls.
 */
describe('ClaudeSummaryService', () => {
  let service: ClaudeSummaryService;
  let mockClaudeAgent: { run: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClaudeAgent = {
      run: vi.fn(),
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

      mockClaudeAgent.run.mockResolvedValue({
        text: validJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 1234,
        costUsd: 0.002,
      });

      const result = await service.summarize(validInput);

      expect(result).toEqual({
        summary: 'Обсуждался план спринта и приоритеты задач.',
        decisions: ['Решили начать с задачи A', 'Отложили задачу B до следующей недели'],
        actionItems: ['Иван: подготовить дизайн', 'Мария: написать тесты'],
      });

      expect(mockClaudeAgent.run).toHaveBeenCalledWith(
        validInput.transcriptText,
        expect.objectContaining({
          systemPrompt: expect.stringContaining('JSON'),
          model: expect.any(String),
        }),
      );
    });

    it('пустые массивы decisions/actionItems валидны', async () => {
      const validJson = JSON.stringify({
        summary: 'Встреча без конкретных решений.',
        decisions: [],
        actionItems: [],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: validJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      const result = await service.summarize(validInput);

      expect(result.summary).toBe('Встреча без конкретных решений.');
      expect(result.decisions).toEqual([]);
      expect(result.actionItems).toEqual([]);
    });

    it('signal пробрасывается в run()', async () => {
      const controller = new AbortController();
      const validJson = JSON.stringify({
        summary: 'Test',
        decisions: [],
        actionItems: [],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: validJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 100,
        costUsd: 0.001,
      });

      await service.summarize({ ...validInput, signal: controller.signal });

      expect(mockClaudeAgent.run).toHaveBeenCalledWith(
        validInput.transcriptText,
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });
  });

  describe('не-JSON ответ', () => {
    it('бросает ошибку при невалидном JSON', async () => {
      mockClaudeAgent.run.mockResolvedValue({
        text: 'This is not JSON at all',
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/невалидный JSON/i);
    });

    it('бросает ошибку при частичном JSON с текстом вокруг', async () => {
      mockClaudeAgent.run.mockResolvedValue({
        text: 'Here is the summary: {"summary": "text", "decisions": [], "actionItems": []} and some more text',
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/невалидный JSON/i);
    });
  });

  describe('невалидная форма JSON', () => {
    it('отсутствует поле summary', async () => {
      const invalidJson = JSON.stringify({
        decisions: ['Решение 1'],
        actionItems: ['Задача 1'],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/summary.*строка/i);
    });

    it('summary пустая строка', async () => {
      const invalidJson = JSON.stringify({
        summary: '',
        decisions: [],
        actionItems: [],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/summary.*непустая строка/i);
    });

    it('summary не строка', async () => {
      const invalidJson = JSON.stringify({
        summary: 123,
        decisions: [],
        actionItems: [],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/summary.*строка/i);
    });

    it('decisions отсутствует', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        actionItems: [],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/decisions.*массив/i);
    });

    it('decisions не массив', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: 'Решение 1, Решение 2',
        actionItems: [],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/decisions.*массив/i);
    });

    it('decisions содержит не-строки', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: ['Решение 1', 123, 'Решение 3'],
        actionItems: [],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/decisions.*строк/i);
    });

    it('actionItems отсутствует', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: [],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/actionItems.*массив/i);
    });

    it('actionItems не массив', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: [],
        actionItems: { task1: 'Подготовить отчёт' },
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/actionItems.*массив/i);
    });

    it('actionItems содержит не-строки', async () => {
      const invalidJson = JSON.stringify({
        summary: 'Резюме встречи.',
        decisions: [],
        actionItems: ['Задача 1', null, 'Задача 3'],
      });

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/actionItems.*строк/i);
    });

    it('JSON не объект (массив)', async () => {
      const invalidJson = JSON.stringify(['summary', 'decisions', 'actionItems']);

      mockClaudeAgent.run.mockResolvedValue({
        text: invalidJson,
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/объект/i);
    });

    it('JSON примитив (строка)', async () => {
      mockClaudeAgent.run.mockResolvedValue({
        text: '"just a string"',
        isError: false,
        subtype: 'success',
        model: 'claude-haiku-4-5',
        numTurns: 1,
        durationMs: 500,
        costUsd: 0.001,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/объект/i);
    });
  });

  describe('ClaudeAgentService возвращает isError:true', () => {
    it('бросает ошибку без частичного summary', async () => {
      mockClaudeAgent.run.mockResolvedValue({
        text: 'Rate limit exceeded',
        isError: true,
        subtype: 'error',
        model: 'claude-haiku-4-5',
        numTurns: 0,
        durationMs: 100,
        costUsd: 0,
      });

      await expect(service.summarize(validInput)).rejects.toThrow(/Claude Agent.*error/i);
      await expect(service.summarize(validInput)).rejects.toThrow(/Rate limit exceeded/i);
    });
  });

  describe('ClaudeAgentService бросает исключение', () => {
    it('пробрасывает ClaudeAgentError', async () => {
      mockClaudeAgent.run.mockRejectedValue(
        new ClaudeAgentError('@anthropic-ai/claude-agent-sdk is not installed'),
      );

      await expect(service.summarize(validInput)).rejects.toThrow(ClaudeAgentError);
      await expect(service.summarize(validInput)).rejects.toThrow(/not installed/i);
    });

    it('пробрасывает прочие исключения', async () => {
      mockClaudeAgent.run.mockRejectedValue(new Error('Network timeout'));

      await expect(service.summarize(validInput)).rejects.toThrow('Network timeout');
    });
  });
});
