import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import type { PreToolUseHookInput, PostToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import {
  preToolUseGuard,
  createCallBudgetHook,
  createAuditLogHook,
  DEFAULT_CALL_BUDGET,
} from './hooks.js';

describe('preToolUseGuard', () => {
  it('should allow valid title with 3 or more characters', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: { title: 'Valid task title' },
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toEqual({});
  });

  it('should allow title with exactly 3 characters', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: { title: 'ABC' },
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toEqual({});
  });

  it('should deny empty title', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: { title: '' },
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'Task title must be at least 3 characters long. Please provide a meaningful task title.',
      },
    });
  });

  it('should deny title with less than 3 characters', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: { title: 'AB' },
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'Task title must be at least 3 characters long. Please provide a meaningful task title.',
      },
    });
  });

  it('should deny title with only whitespace', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: { title: '   ' },
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'Task title must be at least 3 characters long. Please provide a meaningful task title.',
      },
    });
  });

  it('should deny when title is missing', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: {},
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'Task title must be at least 3 characters long. Please provide a meaningful task title.',
      },
    });
  });

  it('should deny when title is not a string', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: { title: 123 },
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'Task title must be at least 3 characters long. Please provide a meaningful task title.',
      },
    });
  });

  it('should only guard mcp__meeting__upsert_task tool', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: { title: 'AB' },
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toHaveProperty('hookSpecificOutput');
  });

  it('should return empty object for other tools', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'some_other_tool',
      tool_input: { title: 'AB' },
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toEqual({});
  });

  it('should return empty object for tools without title', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'some_other_tool',
      tool_input: {},
    };

    const result = await preToolUseGuard(hookInput);

    expect(result).toEqual({});
  });

  it('should return correct hookEventName and permissionDecision on deny', async () => {
    const hookInput: PreToolUseHookInput = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: { title: '' },
    };

    const result = await preToolUseGuard(hookInput);

    expect(result.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });
});

describe('createCallBudgetHook', () => {
  it('should allow calls within budget', async () => {
    const hook = createCallBudgetHook(3);
    const hookInput: PreToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: {},
    };

    const result1 = await hook(hookInput);
    const result2 = await hook(hookInput);
    const result3 = await hook(hookInput);

    expect(result1).toEqual({});
    expect(result2).toEqual({});
    expect(result3).toEqual({});
  });

  it('should deny after exceeding limit', async () => {
    const hook = createCallBudgetHook(2);
    const hookInput: PreToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: {},
    };

    await hook(hookInput); // 1st call
    await hook(hookInput); // 2nd call
    const result = await hook(hookInput); // 3rd call - should exceed

    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'Tool call budget exceeded (2 calls per run). Please reduce the number of operations.',
      },
    });
  });

  it('should track call count correctly across multiple calls', async () => {
    const hook = createCallBudgetHook(5);
    const hookInput: PreToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: {},
    };

    // Make 5 calls (all should succeed)
    for (let i = 0; i < 5; i++) {
      const result = await hook(hookInput);
      expect(result).toEqual({});
    }

    // 6th call should be denied
    const result = await hook(hookInput);
    expect(result).toHaveProperty('hookSpecificOutput');
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('should respect custom limit parameter', async () => {
    const customLimit = 15;
    const hook = createCallBudgetHook(customLimit);
    const hookInput: PreToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: {},
    };

    // Make customLimit calls (all should succeed)
    for (let i = 0; i < customLimit; i++) {
      const result = await hook(hookInput);
      expect(result).toEqual({});
    }

    // Next call should be denied with correct limit in message
    const result = await hook(hookInput);
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain(
      `${customLimit} calls per run`,
    );
  });

  it('should use DEFAULT_CALL_BUDGET when no limit provided', async () => {
    const hook = createCallBudgetHook();
    const hookInput: PreToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: {},
    };

    // Make DEFAULT_CALL_BUDGET calls
    for (let i = 0; i < DEFAULT_CALL_BUDGET; i++) {
      const result = await hook(hookInput);
      expect(result).toEqual({});
    }

    // Next call should be denied
    const result = await hook(hookInput);
    expect(result).toHaveProperty('hookSpecificOutput');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain(
      `${DEFAULT_CALL_BUDGET} calls per run`,
    );
  });

  it('should return correct hookEventName on deny', async () => {
    const hook = createCallBudgetHook(1);
    const hookInput: PreToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: {},
    };

    await hook(hookInput); // 1st call
    const result = await hook(hookInput); // 2nd call - denied

    expect(result.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
  });

  it('should increment count even after exceeding limit', async () => {
    const hook = createCallBudgetHook(1);
    const hookInput: PreToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: {},
    };

    await hook(hookInput); // 1st call - allowed
    const result1 = await hook(hookInput); // 2nd call - denied
    const result2 = await hook(hookInput); // 3rd call - still denied

    expect(result1).toHaveProperty('hookSpecificOutput');
    expect(result2).toHaveProperty('hookSpecificOutput');
  });
});

describe('createAuditLogHook', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      log: vi.fn(),
    } as unknown as Logger;
  });

  it('should log tool execution with all details', async () => {
    const hook = createAuditLogHook(mockLogger);
    const hookInput: PostToolUseHookInput & { tool_result?: any } = {
      tool_name: 'test_tool',
      tool_input: { param1: 'value1', param2: 42 },
      tool_result: { success: true, data: 'result data' },
    };

    await hook(hookInput);

    expect(mockLogger.log).toHaveBeenCalledTimes(1);
    expect(mockLogger.log).toHaveBeenCalledWith({
      message: 'Tool executed',
      tool: 'test_tool',
      input: { param1: 'value1', param2: 42 },
      result: { success: true, data: 'result data' },
    });
  });

  it('should handle missing tool_result gracefully', async () => {
    const hook = createAuditLogHook(mockLogger);
    const hookInput: PostToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: { param1: 'value1' },
    };

    await hook(hookInput);

    expect(mockLogger.log).toHaveBeenCalledTimes(1);
    expect(mockLogger.log).toHaveBeenCalledWith({
      message: 'Tool executed',
      tool: 'test_tool',
      input: { param1: 'value1' },
      result: undefined,
    });
  });

  it('should call logger.log with correct structure', async () => {
    const hook = createAuditLogHook(mockLogger);
    const hookInput: PostToolUseHookInput & { tool_result?: any } = {
      tool_name: 'mcp__meeting__upsert_task',
      tool_input: { title: 'Test task', description: 'Test description' },
      tool_result: { id: '123', created: true },
    };

    await hook(hookInput);

    const callArgs = (mockLogger.log as any).mock.calls[0][0];
    expect(callArgs).toHaveProperty('message');
    expect(callArgs).toHaveProperty('tool');
    expect(callArgs).toHaveProperty('input');
    expect(callArgs).toHaveProperty('result');
    expect(callArgs.message).toBe('Tool executed');
    expect(callArgs.tool).toBe('mcp__meeting__upsert_task');
  });

  it('should log empty tool_input', async () => {
    const hook = createAuditLogHook(mockLogger);
    const hookInput: PostToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: {},
    };

    await hook(hookInput);

    expect(mockLogger.log).toHaveBeenCalledWith({
      message: 'Tool executed',
      tool: 'test_tool',
      input: {},
      result: undefined,
    });
  });

  it('should return empty object after logging', async () => {
    const hook = createAuditLogHook(mockLogger);
    const hookInput: PostToolUseHookInput = {
      tool_name: 'test_tool',
      tool_input: {},
    };

    const result = await hook(hookInput);

    expect(result).toEqual({});
  });

  it('should log multiple tool executions independently', async () => {
    const hook = createAuditLogHook(mockLogger);

    await hook({
      tool_name: 'tool1',
      tool_input: { a: 1 },
    } as PostToolUseHookInput);

    await hook({
      tool_name: 'tool2',
      tool_input: { b: 2 },
    } as PostToolUseHookInput);

    expect(mockLogger.log).toHaveBeenCalledTimes(2);
    expect((mockLogger.log as any).mock.calls[0][0].tool).toBe('tool1');
    expect((mockLogger.log as any).mock.calls[1][0].tool).toBe('tool2');
  });

  it('should handle complex nested tool_input', async () => {
    const hook = createAuditLogHook(mockLogger);
    const complexInput = {
      nested: {
        deep: {
          value: 'test',
          array: [1, 2, 3],
        },
      },
      topLevel: true,
    };

    await hook({
      tool_name: 'complex_tool',
      tool_input: complexInput,
    } as PostToolUseHookInput);

    expect(mockLogger.log).toHaveBeenCalledWith({
      message: 'Tool executed',
      tool: 'complex_tool',
      input: complexInput,
      result: undefined,
    });
  });

  it('should handle complex nested tool_result', async () => {
    const hook = createAuditLogHook(mockLogger);
    const complexResult = {
      status: 'success',
      data: {
        items: [{ id: 1 }, { id: 2 }],
        meta: { count: 2 },
      },
    };

    await hook({
      tool_name: 'complex_tool',
      tool_input: {},
      tool_result: complexResult,
    } as PostToolUseHookInput & { tool_result?: any });

    expect(mockLogger.log).toHaveBeenCalledWith({
      message: 'Tool executed',
      tool: 'complex_tool',
      input: {},
      result: complexResult,
    });
  });
});
