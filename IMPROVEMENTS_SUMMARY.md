# Meeting Summarization Improvements - Integration Summary

## Overview

Completed improvements to the Claude-based meeting summarization system to prevent Chinese character output and add telemetry for debugging language drift issues.

## Changes by Task

### Task 1: Explicit Russian-Only Instruction

**Objective**: Strengthen the system prompt to explicitly prevent non-Russian character output.

**Changes**:

- Added explicit language constraint to system prompt (line 51):
  ```
  ВАЖНО: Генерируй ТОЛЬКО русский текст. Не используй символы из других языков (китайский, японский, корейский и т.д.).
  ```
- Positioned immediately after JSON format constraints and before multi-file processing instructions
- Uses imperative tone matching existing constraints

**Rationale**: Previous prompts implicitly requested Russian output through context, but lacked explicit prohibition of other languages. This change makes the requirement unambiguous.

### Task 2: Telemetry for Chinese Character Validation

**Objective**: Add observability for validation failures to monitor Chinese character detection frequency and patterns.

**Changes**:

1. **Async validation function** (lines 130-149):
   - Converted `validateNoChineseChars` from synchronous to async
   - Added file logging before throwing error
   - Log path: `logs/summarization/validation-failures.log`

2. **Telemetry data captured**:
   - `meetingId`: Associates failure with specific meeting
   - `timestamp`: ISO 8601 format for time-series analysis
   - `fieldName`: Identifies which field failed (Summary, Decision[N], ActionItem[N])
   - `textExcerpt`: First 100 characters of rejected text for pattern analysis

3. **Updated validation calls** (lines 151-157):
   - Changed from `.forEach()` to `for` loops to properly handle async validation
   - Added `await` keywords for all validation calls
   - Maintains fail-fast behavior (first validation failure throws immediately)

**Rationale**: Provides data-driven visibility into whether the issue persists after prompt changes, enabling quantitative assessment of improvement effectiveness.

## Files Modified

### Primary Changes

- **`apps/api/src/meeting-file/processing/claude-summary.service.ts`**
  - Line 51: Added Russian-only instruction
  - Lines 130-149: Refactored validation function to async with logging
  - Lines 151-157: Updated validation calls to async pattern

### No Changes Required To

- `apps/api/src/meeting-file/processing/claude-summary.service.spec.ts` - Unit tests pass without modification
- `apps/api/src/meeting-file/processing/claude-summary.service.integration-spec.ts` - Integration tests pass without modification
- Database schema - No changes needed
- API contracts - No changes to DTOs or controller interfaces

## Testing Recommendations

### Manual Testing

1. **Trigger summarization via API**:

   ```bash
   curl -X POST http://localhost:3001/api/meeting-files/1/resummarize
   ```

2. **Verify log file creation**:

   ```bash
   # Check Claude API logs
   cat apps/api/logs/summarization/claude-api.log

   # Check validation failure logs (if any failures occur)
   cat apps/api/logs/summarization/validation-failures.log
   ```

3. **Test with existing meetings**:
   ```bash
   # If seed data exists
   pnpm api seed

   # Resummarize all meetings
   for id in 1 2 3; do
     curl -X POST http://localhost:3001/api/meeting-files/$id/resummarize
   done
   ```

### Monitoring Points

**Success Indicators**:

- No validation failures logged to `validation-failures.log`
- All responses contain only Cyrillic characters and standard punctuation
- `claude-api.log` shows successful completions with expected field counts

**Failure Indicators**:

- Entries in `validation-failures.log` indicate prompt changes are insufficient
- Multiple validation failures suggest systemic issue requiring further prompt engineering
- Consistent failures on specific field types (e.g., only decisions) suggest partial effectiveness

### Automated Testing

Existing test suites cover the changes:

```bash
# Unit tests
pnpm api test claude-summary.service.spec.ts

# Integration tests (requires Postgres)
docker compose up -d postgres
pnpm api test claude-summary.service.integration-spec.ts

# Full test suite
pnpm test
```

**Note**: Pre-existing typecheck errors in unrelated files (`meeting-tools.spec.ts`, `hooks.spec.ts`, `meeting-summary.e2e-spec.ts`) are not caused by these changes.

## Deployment Considerations

### Pre-Deployment

1. **Verify log directory permissions**:

   ```bash
   mkdir -p apps/api/logs/summarization
   chmod 755 apps/api/logs/summarization
   ```

2. **Consider log rotation** (production):
   - `validation-failures.log` could accumulate if issue persists
   - Recommend logrotate or similar mechanism
   - Suggested retention: 30 days compressed, then delete

3. **Review monitoring strategy**:
   - Add alerting if validation failures exceed threshold (e.g., >5% of requests)
   - Dashboard for failure rate over time

### Post-Deployment

1. **Monitor for first 48 hours**:

   ```bash
   # Check failure count
   wc -l apps/api/logs/summarization/validation-failures.log

   # Review failure patterns
   cat apps/api/logs/summarization/validation-failures.log | grep fieldName
   ```

2. **Baseline metrics**:
   - Count of summarizations processed
   - Validation failure rate
   - Average response time (should be unchanged)

3. **Rollback criteria**:
   - If validation failures persist at previous rate (>10% of requests)
   - If response time increases significantly (>2x baseline)
   - If JSON parsing errors increase (suggests prompt changes broke format adherence)

## Next Steps: WebSocket Implementation

### Current State

Summarization is synchronous HTTP:

1. Client POSTs to `/api/meeting-files/:id/resummarize`
2. Server blocks until Claude API responds
3. Response returns complete summary

**Limitations**:

- Client timeout on long transcripts (>5min)
- No progress indication
- Server resources held during API call

### Proposed WebSocket Architecture

#### Phase 1: Progress Events

**Goal**: Stream progress updates during summarization without changing final response format.

1. **Add WebSocket endpoint**:

   ```typescript
   // apps/api/src/meeting-file/meeting-file.gateway.ts
   @WebSocketGateway({ namespace: '/meeting-files' })
   export class MeetingFileGateway {
     @WebSocketServer() server: Server;

     emitSummarizationProgress(meetingId: number, progress: ProgressEvent) {
       this.server.emit(`summarization:${meetingId}`, progress);
     }
   }
   ```

2. **Progress event types**:

   ```typescript
   type ProgressEvent =
     | { type: 'started'; timestamp: string }
     | { type: 'mcp_tool_call'; tool: string; args: unknown }
     | { type: 'mcp_tool_response'; tool: string; result: unknown }
     | { type: 'validation_started'; field: string }
     | { type: 'validation_passed'; field: string }
     | { type: 'completed'; summary: MeetingFileSummary }
     | { type: 'failed'; error: string };
   ```

3. **Inject gateway into service**:

   ```typescript
   // claude-summary.service.ts
   constructor(
     // ... existing deps
     private readonly gateway: MeetingFileGateway,
   ) {}

   async summarize(input: SummaryInput): Promise<MeetingFileSummary> {
     this.gateway.emitSummarizationProgress(input.meetingId, {
       type: 'started',
       timestamp: new Date().toISOString(),
     });

     // ... existing logic with progress events at key points
   }
   ```

4. **Frontend integration**:
   ```typescript
   // apps/web/lib/websocket.ts
   import io from 'socket.io-client';

   const socket = io('http://localhost:3001/meeting-files');

   socket.on(`summarization:${meetingId}`, (event: ProgressEvent) => {
     // Update UI based on event type
   });
   ```

#### Phase 2: Streaming Partial Results

**Goal**: Stream summary, decisions, and action items as they're generated.

**Challenges**:

- Claude Agent SDK returns complete response, not streaming chunks
- JSON parsing requires complete structure
- Validation must run on complete text

**Options**:

1. **Post-processing stream** (simpler):
   - Get complete response from Claude
   - Parse into sentences/items
   - Stream parsed chunks via WebSocket
   - Pro: No SDK changes needed
   - Con: Still blocks on Claude API, only streams parsing

2. **True streaming** (complex):
   - Switch to streaming API endpoint (requires custom implementation)
   - Parse incomplete JSON chunks (requires state machine)
   - Emit partial results with `isComplete: false`
   - Pro: Real-time as Claude generates
   - Con: Major refactor, complex error handling

**Recommendation**: Start with Phase 1 (progress events) to validate UX improvement before investing in true streaming.

#### Implementation Files

New files to create:

- `apps/api/src/meeting-file/meeting-file.gateway.ts` - WebSocket gateway
- `apps/api/src/meeting-file/dto/summarization-progress.dto.ts` - Event types
- `apps/web/lib/use-summarization-progress.ts` - React hook for frontend

Modified files:

- `apps/api/src/meeting-file/meeting-file.module.ts` - Register gateway
- `apps/api/src/meeting-file/processing/claude-summary.service.ts` - Emit events
- `apps/web/app/meetings/[id]/page.tsx` - Connect to WebSocket

#### Testing Strategy

1. **Gateway unit tests**:
   - Mock Socket.IO server
   - Verify events emitted with correct payload
   - Test connection/disconnection handling

2. **Integration tests**:
   - Start real WebSocket server
   - Connect test client
   - Trigger summarization
   - Assert progress events received in order

3. **E2E tests**:
   - Use Playwright to connect WebSocket in browser
   - Verify UI updates on progress events
   - Test timeout and error scenarios

#### Timeline Estimate

- **Phase 1 (Progress Events)**: 1-2 days
  - Day 1: Backend gateway + event emission
  - Day 2: Frontend integration + testing

- **Phase 2 (Streaming)**: 5-7 days
  - Days 1-2: Research streaming API options
  - Days 3-4: Implement streaming parser
  - Days 5-6: Frontend streaming UI
  - Day 7: E2E testing + polish

**Recommendation**: Implement Phase 1 first, gather user feedback, then decide if Phase 2 is needed.

## Appendix: Validation Regex Explanation

Current regex: `/[一-鿿]/`

**Coverage**:

- CJK Unified Ideographs: U+4E00 to U+9FFF (20,992 characters)
- Includes: Simplified Chinese, Traditional Chinese, Japanese Kanji, Korean Hanja

**Not detected** (intentionally):

- Japanese Hiragana (U+3040 to U+309F)
- Japanese Katakana (U+30A0 to U+30FF)
- Korean Hangul (U+AC00 to U+D7AF)

**Rationale**: Claude typically outputs CJK ideographs when "drifting" to Chinese, not phonetic scripts. Narrower regex reduces false positives while catching the actual issue.

**If expanding detection needed**:

```typescript
// Comprehensive CJK detection
/[぀-ゟ゠-ヿ一-鿿가-힯]/;
```

## Summary

These improvements add both preventive measures (explicit prompt constraints) and observability (validation telemetry) to address Chinese character output in meeting summaries. The changes are minimally invasive, maintain existing test coverage, and provide data for assessing effectiveness post-deployment.

WebSocket implementation is scoped as a separate phase with clear incremental milestones, prioritizing quick wins (progress events) over complex refactors (true streaming).
