import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ClaudeAgentModule } from './claude-agent.module.js';
import {
  ClaudeAgentError,
  ClaudeAgentService,
  DEFAULT_CLAUDE_AGENT_MODEL,
} from './claude-agent.service.js';

// `@anthropic-ai/claude-agent-sdk` is intentionally not a dependency of this package
// (see src/claude-agent/CLAUDE.md). The wrapper stays in the tree and loads the SDK
// lazily; until it is installed every run() / ask() surfaces a helpful ClaudeAgentError.
describe('ClaudeAgentService', () => {
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

  it('отдаёт непустую строку модели (CLAUDE_AGENT_MODEL или дефолт)', () => {
    expect(typeof service.model).toBe('string');
    expect(service.model.length).toBeGreaterThan(0);
    if (!process.env.CLAUDE_AGENT_MODEL?.trim()) {
      expect(service.model).toBe(DEFAULT_CLAUDE_AGENT_MODEL);
    }
  });

  it('run() бросает ClaudeAgentError, пока SDK не установлен', async () => {
    await expect(service.run('ping')).rejects.toBeInstanceOf(ClaudeAgentError);
    await expect(service.run('ping')).rejects.toThrow(/claude-agent-sdk is not installed/i);
  });

  it('ask() отдаёт тот же ClaudeAgentError', async () => {
    await expect(service.ask('ping')).rejects.toBeInstanceOf(ClaudeAgentError);
  });
});

/**
 * Mocked unit tests for ClaudeAgentService — Phase 2 Task 1.
 * Mock `@anthropic-ai/claude-agent-sdk` to verify run() result mapping without real SDK dependency.
 */
describe('ClaudeAgentService (mocked SDK)', () => {
  let moduleRef: TestingModule;
  let service: ClaudeAgentService;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    // Mock the SDK module before any import
    mockQuery = vi.fn();
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: mockQuery,
    }));

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ClaudeAgentModule],
    }).compile();

    service = moduleRef.get(ClaudeAgentService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    vi.doUnmock('@anthropic-ai/claude-agent-sdk');
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  describe('успешный subtype: success', () => {
    it('возвращает {text, isError:false, subtype, numTurns, costUsd}', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Hello from Claude',
          errors: [],
          num_turns: 1,
          duration_ms: 1234,
          total_cost_usd: 0.001,
        };
      });

      const result = await service.run('test prompt');

      expect(result).toEqual({
        text: 'Hello from Claude',
        isError: false,
        subtype: 'success',
        model: DEFAULT_CLAUDE_AGENT_MODEL,
        numTurns: 1,
        durationMs: 1234,
        costUsd: 0.001,
      });
    });

    it('is_error:true переопределяет subtype — isError:true даже при subtype:success', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Partial result',
          errors: ['Internal error'],
          is_error: true,
          num_turns: 1,
          duration_ms: 500,
          total_cost_usd: 0,
        };
      });

      const result = await service.run('test');

      expect(result.isError).toBe(true);
      // When subtype='success', text comes from result, not errors
      expect(result.text).toBe('Partial result');
      expect(result.subtype).toBe('success');
    });
  });

  describe('error subtypes', () => {
    it('subtype:error → isError:true, text из errors[]', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'error',
          result: '',
          errors: ['Rate limit exceeded', 'Retry after 60s'],
          num_turns: 0,
          duration_ms: 100,
          total_cost_usd: 0,
        };
      });

      const result = await service.run('test');

      expect(result.isError).toBe(true);
      expect(result.text).toBe('Rate limit exceeded; Retry after 60s');
      expect(result.subtype).toBe('error');
      expect(result.costUsd).toBe(0);
    });

    it('subtype:error_during_execution → isError:true', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          result: '',
          errors: ['Tool execution failed'],
          num_turns: 2,
          duration_ms: 2000,
          total_cost_usd: 0.002,
        };
      });

      const result = await service.run('test');

      expect(result.isError).toBe(true);
      expect(result.subtype).toBe('error_during_execution');
      expect(result.text).toBe('Tool execution failed');
    });

    it('subtype:error_max_turns → isError:true', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'error_max_turns',
          result: '',
          errors: ['Max turns reached'],
          num_turns: 10,
          duration_ms: 5000,
          total_cost_usd: 0.05,
        };
      });

      const result = await service.run('test');

      expect(result.isError).toBe(true);
      expect(result.subtype).toBe('error_max_turns');
    });
  });

  describe('брошенное исключение "...returned an error result: ..."', () => {
    it('перехватывается и превращается в isError:true с обрезанным префиксом', async () => {
      mockQuery.mockImplementation(async function* () {
        throw new Error('Claude Agent returned an error result: Credit balance too low');
      });

      const result = await service.run('test');

      expect(result.isError).toBe(true);
      expect(result.subtype).toBe('error');
      expect(result.text).toBe('Credit balance too low');
      expect(result.numTurns).toBe(0);
      expect(result.costUsd).toBe(0);
    });

    it('игнорирует регистр префикса', async () => {
      mockQuery.mockImplementation(async function* () {
        throw new Error('RETURNED AN ERROR RESULT: Account suspended');
      });

      const result = await service.run('test');

      expect(result.isError).toBe(true);
      expect(result.text).toBe('Account suspended');
    });
  });

  describe('стрим без result', () => {
    it('бросает ClaudeAgentError', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: 'assistant' };
        yield { type: 'user' };
        // No result message
      });

      await expect(service.run('test')).rejects.toThrow(ClaudeAgentError);
      await expect(service.run('test')).rejects.toThrow(/finished without producing a result/i);
    });
  });

  describe('прочие исключения', () => {
    it('не содержащие "returned an error result" — обёрнуты в ClaudeAgentError', async () => {
      mockQuery.mockImplementation(async function* () {
        throw new Error('Network timeout');
      });

      await expect(service.run('test')).rejects.toThrow(ClaudeAgentError);
      await expect(service.run('test')).rejects.toThrow(/failed to run.*Network timeout/i);
    });

    it('ClaudeAgentError пробрасывается без обёртки', async () => {
      mockQuery.mockImplementation(async function* () {
        throw new ClaudeAgentError('SDK spawn failed');
      });

      await expect(service.run('test')).rejects.toThrow(ClaudeAgentError);
      await expect(service.run('test')).rejects.toThrow('SDK spawn failed');
    });
  });

  describe('ask() — удобная обёртка', () => {
    it('success → возвращает text', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Answer 42',
          errors: [],
          num_turns: 1,
          duration_ms: 500,
          total_cost_usd: 0.001,
        };
      });

      const text = await service.ask('question');
      expect(text).toBe('Answer 42');
    });

    it('isError:true → бросает ClaudeAgentError', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'error',
          result: '',
          errors: ['Billing issue'],
          num_turns: 0,
          duration_ms: 100,
          total_cost_usd: 0,
        };
      });

      await expect(service.ask('question')).rejects.toThrow(ClaudeAgentError);
      await expect(service.ask('question')).rejects.toThrow(
        /returned an error.*error.*Billing issue/i,
      );
    });
  });
});
