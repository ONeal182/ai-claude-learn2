# CLAUDE.md — src/claude-agent

Thin NestJS wrapper around [`@anthropic-ai/claude-agent-sdk`](https://platform.claude.com/docs/en/agent-sdk/overview).
Not CQRS — a plain `module → service`.

## The SDK is not a dependency

`@anthropic-ai/claude-agent-sdk` is **not** in `apps/api/package.json` — it drags in the whole
Claude Code CLI plus per-platform native binaries. This module stays in the tree as ready-to-use
scaffolding and imports the SDK **lazily** (`await import(...)` behind a `string`-typed specifier,
so `tsc` never tries to resolve it). Until the package is installed, every `run()` / `ask()` throws
`ClaudeAgentError`:

```
@anthropic-ai/claude-agent-sdk is not installed — run
`pnpm --filter api add @anthropic-ai/claude-agent-sdk` to enable ClaudeAgentService (...).
```

To turn it back on: `pnpm --filter api add @anthropic-ai/claude-agent-sdk` — no code change needed,
`loadClaudeAgentQuery()` picks it up. The local `SdkQueryOptions` / `SdkResultMessage` / `SdkMessage`
interfaces in `claude-agent.service.ts` mirror the slice of the SDK surface this wrapper touches.

## Files

```
claude-agent.module.ts        # provides + exports ClaudeAgentService; imports ConfigModule (standalone in tests)
claude-agent.service.ts       # ClaudeAgentService, ClaudeAgentError, DEFAULT_CLAUDE_AGENT_MODEL, lazy SDK loader + local SDK types
claude-agent.service.spec.ts  # unit test — model resolution + run()/ask() throw ClaudeAgentError while the SDK is absent
```

## ClaudeAgentService

- `run(prompt, options?) → ClaudeAgentRunResult` — loads the SDK, then runs one prompt through its `query()`.
  - `{ text, isError, subtype, model, numTurns, durationMs, costUsd }`.
  - Single-shot by design: `maxTurns: 1`, `tools: []` (all built-in tools off), `settingSources: []`
    (no repo `.claude` settings / hooks / MCP loaded).
  - Reaching Anthropic but getting an API/account error (e.g. `Credit balance is too low`, rate limit)
    is returned as a result with `isError: true` — **not** thrown. Only setup/transport failures
    (SDK not installed, spawn failure, no result message) throw `ClaudeAgentError`.
- `ask(prompt, options?) → string` — convenience over `run`; throws `ClaudeAgentError` on any error result.
- `get model` — `CLAUDE_AGENT_MODEL` env, else `DEFAULT_CLAUDE_AGENT_MODEL` (`claude-haiku-4-5`).
- `options`: `model`, `maxTurns`, `systemPrompt`, `signal` (aborts the run and tears down the subprocess).

## Auth

Only relevant once the SDK is installed. Two modes, chosen by whether `ANTHROPIC_API_KEY` is present
(read via `ConfigService`, never `process.env`):

| `ANTHROPIC_API_KEY` | What happens                                                                                                                                                                             | Billing                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| set                 | passed to the SDK subprocess via `options.env` (which **replaces** the child env, so `process.env` is spread first)                                                                      | Anthropic API pay-as-you-go |
| unset               | `options.env` left unset → subprocess inherits `process.env` and uses the ambient Claude Code login (`claude` OAuth creds in `~/.claude/.credentials.json`, e.g. a Pro/Max subscription) | subscription usage limits   |

For CI / servers use an API key with credit — OAuth needs an interactive `claude` login and refreshes on its own.

## Env

| Var                  | Meaning                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | Optional. Unset → ambient Claude Code login is used. Set → explicit API billing. |
| `CLAUDE_AGENT_MODEL` | Optional model override. Empty → `claude-haiku-4-5`.                             |

Both are declared in `.env.example`, `turbo.json → globalPassThroughEnv`, and `.github/workflows/ci.yml → env`.
They are read regardless of whether the SDK is installed (they just have no effect until it is).

## Test

`claude-agent.service.spec.ts` is a plain unit test (vitest `*.spec.ts`, runs under `pnpm test`) — no
network, no subprocess, green everywhere including CI and the Husky pre-commit hook:

- `service.model` is a non-empty string; with no `CLAUDE_AGENT_MODEL` it equals `DEFAULT_CLAUDE_AGENT_MODEL`.
- `run('ping')` / `ask('ping')` reject with `ClaudeAgentError` whose message contains
  `claude-agent-sdk is not installed`.

When the SDK is reinstalled, replace this with an integration test that spawns the real subprocess and
guard it (`describe.skipIf(...)`) on auth availability so keyless runs stay green.
