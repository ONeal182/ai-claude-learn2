# Meeting Tools for Claude Agent SDK

MCP tools that wrap Prisma services and TaskService into agent-callable tools.

## Tools

### `find_tasks(query)`
- **Type**: Read-only (`readOnlyHint: true`)
- **Description**: Search for tasks by text in title (case-insensitive)
- **Input**: `{ query: string }`
- **Returns**: Array of tasks with their source meeting details
- **Uses**: `TaskService.search()`

### `upsert_task(title, status, sourceMeetingId, id?)`
- **Description**: Create a new task or update an existing one
- **Input**: 
  - `title: string` (required)
  - `status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'`
  - `sourceMeetingId: string` (required)
  - `id?: string` (optional, for updates)
- **Returns**: Created or updated task with source meeting
- **Uses**: `TaskService.upsert()`

### `update_meeting(meetingId, summary?, decisions?)`
- **Description**: Update meeting with summary and decisions
- **Input**:
  - `meetingId: string` (required)
  - `summary?: string` (optional)
  - `decisions?: string[]` (optional)
- **Returns**: Updated meeting record
- **Uses**: `PrismaService.meeting.update()`

## Usage

```typescript
import { createMeetingMcpServer } from './meeting-tools.js';
import { ClaudeAgentService } from './claude-agent.service.js';

// In a service or handler:
const mcpServer = await createMeetingMcpServer(prisma, taskService);

const result = await claudeAgentService.run(
  'Find all pending tasks related to the Q4 planning meeting',
  {
    tools: [mcpServer],
    maxTurns: 5, // Allow the agent to use tools
  }
);
```

## Implementation Details

- All tools use Zod schemas for input validation
- Tools are bound to service instances via `createMeetingMcpServer()`
- The MCP server is created lazily using `@anthropic-ai/claude-agent-sdk`
- If the SDK is not installed, tool creation throws an error

## Database Schema

Tools operate on:
- `Task` model: `id`, `title`, `sourceMeetingId`, `status`, `createdAt`, `updatedAt`
- `Meeting` model: `id`, `title`, `startsAt`, `summary`, `decisions`, `createdAt`, `updatedAt`

`Meeting.summary` is `Text`, `Meeting.decisions` is `Json` (array of strings).
