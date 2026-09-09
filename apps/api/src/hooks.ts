import { Logger } from '@nestjs/common';
import type {
  HookCallback,
  PreToolUseHookInput,
  PostToolUseHookInput,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * Hooks for Claude Agent SDK query() calls.
 * Register via `options.hooks` in ClaudeAgentService.run().
 */

/**
 * Maximum number of tool calls allowed per agent run (configurable).
 * Set to 10 to prevent excessive API usage - most operations (meeting summary,
 * task extraction) should complete within a few tool calls.
 */
export const DEFAULT_CALL_BUDGET = 10;

/**
 * PreToolUse guard: validates `mcp__meeting__upsert_task` title field.
 * Returns deny + reason when title is empty or shorter than 3 characters.
 */
export const preToolUseGuard: HookCallback = async (hookInput) => {
  const preToolInput = hookInput as PreToolUseHookInput;

  const { tool_name, tool_input } = preToolInput;

  // Only guard upsert_task tool
  if (tool_name !== 'mcp__meeting__upsert_task') return {};

  const title = (tool_input as any)?.title;

  // Validate title: must be non-empty and at least 3 characters
  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: 'deny' as const,
        permissionDecisionReason:
          'Task title must be at least 3 characters long. Please provide a meaningful task title.',
      },
    };
  }

  return {};
};

/**
 * PreToolUse budget tracker: counts total tool calls and denies when limit exceeded.
 * Limit defaults to {@link DEFAULT_CALL_BUDGET}, override via `callBudget.limit`.
 */
export function createCallBudgetHook(limit: number = DEFAULT_CALL_BUDGET): HookCallback {
  let callCount = 0;

  return async (_hookInput) => {
    callCount++;

    if (callCount > limit) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse' as const,
          permissionDecision: 'deny' as const,
          permissionDecisionReason: `Tool call budget exceeded (${limit} calls per run). Please reduce the number of operations.`,
        },
      };
    }

    return {};
  };
}

/**
 * PostToolUse audit logger: logs tool_name, arguments, and result via Nest Logger.
 */
export function createAuditLogHook(logger: Logger): HookCallback {
  return async (hookInput) => {
    const postToolInput = hookInput as PostToolUseHookInput;

    const { tool_name, tool_input } = postToolInput;
    const tool_result = (postToolInput as any).tool_result;

    // Log tool execution with all relevant details
    logger.log({
      message: 'Tool executed',
      tool: tool_name,
      input: tool_input,
      result: tool_result,
    });

    return {};
  };
}

/**
 * Example: Register hooks in ClaudeAgentService.run()
 *
 * ```typescript
 * import { preToolUseGuard, createCallBudgetHook, createAuditLogHook } from './hooks.js';
 *
 * const query = await loadClaudeAgentQuery();
 * const queryOptions = {
 *   model,
 *   maxTurns: 10,
 *   tools: [mcpServer],
 *   hooks: [
 *     preToolUseGuard,
 *     createCallBudgetHook(20), // custom limit or use DEFAULT_CALL_BUDGET
 *     createAuditLogHook(this.logger),
 *   ],
 * };
 *
 * for await (const message of query({ prompt, options: queryOptions })) {
 *   // ...
 * }
 * ```
 */
