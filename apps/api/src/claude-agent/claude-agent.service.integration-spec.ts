import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ClaudeAgentModule } from './claude-agent.module.js';
import { ClaudeAgentService } from './claude-agent.service.js';

/**
 * Integration tests for ClaudeAgentService — Phase 2 Task 1 (optional).
 * Requires real @anthropic-ai/claude-agent-sdk and valid authentication (ANTHROPIC_API_KEY or
 * ambient Claude Code login). Skipped when SDK is not installed or authentication is unavailable.
 */
describe.skipIf(!process.env.CLAUDE_AGENT_INTEGRATION_TESTS)(
  'ClaudeAgentService (integration)',
  () => {
    let moduleRef: TestingModule;
    let service: ClaudeAgentService;

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true }), ClaudeAgentModule],
      }).compile();

      service = moduleRef.get(ClaudeAgentService);
    });

    afterAll(async () => {
      await moduleRef?.close();
    });

    it('реальный вызов Claude возвращает непустой текст', async () => {
      const result = await service.run('Ответь одним словом: сколько будет 2+2?', {
        maxTurns: 1,
      });

      expect(result.isError).toBe(false);
      expect(result.subtype).toBe('success');
      expect(result.text).toBeTruthy();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.numTurns).toBeGreaterThanOrEqual(1);
      expect(result.costUsd).toBeGreaterThan(0);
    }, 30000);

    it('ask() возвращает строку', async () => {
      const text = await service.ask('Скажи "привет" по-русски.');

      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
      // Базовая проверка кириллицы
      expect(/[а-яА-ЯёЁ]/.test(text)).toBe(true);
    }, 30000);
  },
);
