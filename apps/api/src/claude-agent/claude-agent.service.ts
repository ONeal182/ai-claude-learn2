import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Default model for one-shot completions — cheap and fast, overridable via `CLAUDE_AGENT_MODEL`. */
export const DEFAULT_CLAUDE_AGENT_MODEL = 'claude-haiku-4-5';

/**
 * `@anthropic-ai/claude-agent-sdk` is **not** a dependency of this package — it pulls in the
 * whole Claude Code CLI and platform binaries. This wrapper stays in the tree and loads the
 * SDK on demand; until it is installed (`pnpm --filter api add @anthropic-ai/claude-agent-sdk`)
 * every `run()` / `ask()` throws {@link ClaudeAgentError}. See `src/claude-agent/CLAUDE.md`.
 */
const CLAUDE_AGENT_SDK_MODULE: string = '@anthropic-ai/claude-agent-sdk';

/** Subset of `Options` from `@anthropic-ai/claude-agent-sdk` that this wrapper sets. */
interface SdkQueryOptions {
  model?: string;
  maxTurns?: number;
  systemPrompt?: string;
  tools?: never[];
  settingSources?: never[];
  abortController?: AbortController;
  env?: Record<string, string | undefined>;
}

/** The SDK's terminal `result` message — the only one this wrapper reads. */
interface SdkResultMessage {
  type: 'result';
  subtype: string;
  result: string;
  errors: string[];
  is_error?: boolean;
  num_turns: number;
  duration_ms: number;
  total_cost_usd: number;
}

/** Any non-terminal message the SDK streams before the result (assistant/user/system/...). */
interface SdkProgressMessage {
  type: 'assistant' | 'user' | 'system' | 'stream_event';
}

type SdkMessage = SdkResultMessage | SdkProgressMessage;

type SdkQuery = (args: { prompt: string; options: SdkQueryOptions }) => AsyncIterable<SdkMessage>;

/** Lazily import the optional SDK; a missing package becomes a helpful {@link ClaudeAgentError}. */
async function loadClaudeAgentQuery(): Promise<SdkQuery> {
  try {
    const sdk = (await import(CLAUDE_AGENT_SDK_MODULE)) as { query: SdkQuery };
    return sdk.query;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ClaudeAgentError(
      '@anthropic-ai/claude-agent-sdk is not installed — run ' +
        '`pnpm --filter api add @anthropic-ai/claude-agent-sdk` to enable ClaudeAgentService ' +
        `(${reason}).`,
    );
  }
}

/** Thrown when the SDK cannot run at all (spawn failure, no result) or returns an error to `ask()`. */
export class ClaudeAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeAgentError';
  }
}

export interface ClaudeAgentRunOptions {
  /** Model id or alias; falls back to `CLAUDE_AGENT_MODEL` env, then {@link DEFAULT_CLAUDE_AGENT_MODEL}. */
  model?: string;
  /** Max agentic turns (API round-trips). Default 1 — a single completion. */
  maxTurns?: number;
  /** Custom system prompt for the run. */
  systemPrompt?: string;
  /** Abort the run (also tears down the SDK subprocess). */
  signal?: AbortSignal;
}

export interface ClaudeAgentRunResult {
  /** Final assistant text on success, or the error text when `isError` is true. */
  text: string;
  /** True when Anthropic was reached but the API/execution returned an error (billing, rate limit, ...). */
  isError: boolean;
  /** SDK result subtype: `success` | `error` | `error_during_execution` | `error_max_turns` | ... */
  subtype: string;
  /** Model actually requested for the run. */
  model: string;
  numTurns: number;
  durationMs: number;
  /** Estimated cost in USD for the run (0 on error results). */
  costUsd: number;
}

/**
 * Thin wrapper around `@anthropic-ai/claude-agent-sdk`'s `query()`. Runs single-shot,
 * tool-less completions: no built-in tools, no repo settings/hooks/MCP are loaded.
 *
 * The SDK is loaded lazily and is **not** a package dependency — until it is installed
 * (`pnpm --filter api add @anthropic-ai/claude-agent-sdk`) every call throws
 * {@link ClaudeAgentError}.
 *
 * Auth: if `ANTHROPIC_API_KEY` is set (read through `ConfigService`, from `apps/api/.env`)
 * it is passed explicitly to the SDK subprocess. If it is absent, the subprocess inherits
 * `process.env` and falls back to the ambient Claude Code login (`claude` OAuth creds in
 * `~/.claude`, e.g. a Pro/Max subscription).
 */
@Injectable()
export class ClaudeAgentService {
  private readonly logger = new Logger(ClaudeAgentService.name);

  constructor(private readonly config: ConfigService) {}

  /** Model used when a run does not override it. */
  get model(): string {
    return this.config.get<string>('CLAUDE_AGENT_MODEL')?.trim() || DEFAULT_CLAUDE_AGENT_MODEL;
  }

  /**
   * Run one prompt through the Agent SDK and return the result. Reaching Anthropic but
   * getting an API/account error (e.g. "Credit balance is too low") is reported as a
   * result with `isError: true`, not thrown; only setup/transport failures throw
   * {@link ClaudeAgentError}.
   */
  async run(prompt: string, options: ClaudeAgentRunOptions = {}): Promise<ClaudeAgentRunResult> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY')?.trim();
    const model = options.model?.trim() || this.model;

    const abortController = new AbortController();
    if (options.signal) {
      if (options.signal.aborted) {
        abortController.abort();
      } else {
        options.signal.addEventListener('abort', () => abortController.abort(), {
          once: true,
        });
      }
    }

    const query = await loadClaudeAgentQuery();

    const queryOptions: SdkQueryOptions = {
      model,
      maxTurns: options.maxTurns ?? 1,
      // Pure text completion: disable every built-in tool and skip project
      // settings / hooks / MCP so the run is isolated and deterministic.
      tools: [],
      settingSources: [],
      abortController,
    };
    if (apiKey) {
      // `env` REPLACES the subprocess environment — spread process.env so PATH/HOME
      // survive, then inject the key resolved through ConfigService. When there is no
      // key we leave `env` unset so the subprocess inherits process.env and uses the
      // ambient Claude Code login.
      queryOptions.env = { ...process.env, ANTHROPIC_API_KEY: apiKey };
    }
    if (options.systemPrompt) {
      queryOptions.systemPrompt = options.systemPrompt;
    }

    const startedAt = Date.now();
    try {
      for await (const message of query({ prompt, options: queryOptions })) {
        if (message.type !== 'result') {
          continue;
        }
        return {
          text: message.subtype === 'success' ? message.result : message.errors.join('; '),
          isError: message.subtype !== 'success' || message.is_error === true,
          subtype: message.subtype,
          model,
          numTurns: message.num_turns,
          durationMs: message.duration_ms,
          costUsd: message.total_cost_usd,
        };
      }
      throw new ClaudeAgentError('Claude Agent SDK finished without producing a result message.');
    } catch (error) {
      if (error instanceof ClaudeAgentError) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      // The SDK throws this wrapper when the CLI reached Anthropic but the API or
      // execution returned an error result (billing, rate limit, ...). Report it as
      // a result instead of crashing the caller.
      if (/returned an error result/i.test(reason)) {
        this.logger.warn(`Claude Agent run returned an error result: ${reason}`);
        return {
          text: reason.replace(/^.*returned an error result:\s*/i, ''),
          isError: true,
          subtype: 'error',
          model,
          numTurns: 0,
          durationMs: Date.now() - startedAt,
          costUsd: 0,
        };
      }
      throw new ClaudeAgentError(`Claude Agent SDK failed to run: ${reason}`);
    }
  }

  /**
   * Convenience wrapper over {@link run} that returns the assistant text and throws
   * {@link ClaudeAgentError} on any error result.
   */
  async ask(prompt: string, options: ClaudeAgentRunOptions = {}): Promise<string> {
    const result = await this.run(prompt, options);
    if (result.isError) {
      throw new ClaudeAgentError(
        `Claude Agent returned an error (${result.subtype}): ${result.text}`,
      );
    }
    return result.text;
  }
}
