# Logs Directory

Structured logs for meeting file processing.

## Structure

```
logs/
├── transcription/        # Transcription logs (whisper.cpp processing)
│   └── YYYY-MM-DD-transcription.log
└── summarization/        # Summarization logs (Claude API calls)
    ├── YYYY-MM-DD-summarization.log        # Meeting-level summarization
    └── YYYY-MM-DD-claude-api.log           # Claude API call details
```

## Log Format

Each log file contains newline-delimited JSON entries:

```json
{
  "timestamp": "2026-09-09T13:20:00.000Z",
  "message": "Transcription started",
  "data": {
    "fileId": "uuid",
    "meetingId": "uuid",
    "fileName": "recording.m4a",
    "fileSize": 1234567,
    "mimeType": "audio/x-m4a"
  }
}
```

## Transcription Logs

### Events

- **Transcription started**: File processing begins
  - `fileId`, `meetingId`, `fileName`, `fileSize`, `mimeType`
  
- **Transcription completed**: File successfully transcribed
  - `fileId`, `meetingId`, `fileName`, `durationMs`, `transcriptLength`, `status: "success"`
  
- **Transcription failed**: Error during processing
  - `fileId`, `durationMs`, `error`, `status: "failed"`

## Summarization Logs

### Meeting-level (`summarization.log`)

- **Summarization started**: Meeting summarization begins
  - `meetingId`, `meetingTitle`, `filesCount`, `fileNames`
  
- **Summarization completed**: Summary generated
  - `meetingId`, `meetingTitle`, `durationMs`, `transcriptLength`, `summaryLength`, `decisionsCount`, `actionItemsCount`, `status: "success"`
  
- **Summarization failed**: Error during summarization
  - `meetingId`, `meetingTitle`, `durationMs`, `transcriptLength`, `error`, `status: "failed"`
  
- **Summarization skipped**: No transcripts available
  - `meetingId`, `meetingTitle`

### Claude API (`claude-api.log`)

- **Claude API call started**: Request to Claude begins
  - `meetingId`, `transcriptLength`
  
- **Claude API call completed**: Response received
  - `meetingId`, `durationMs`, `decisionsCount`, `actionItemsCount`, `summaryLength`, `responseLength`
  
- **Claude API call failed**: API error
  - `meetingId`, `durationMs`, `error`

## Retention

Logs are not automatically rotated. Manual cleanup recommended:

```bash
# Keep last 30 days
find apps/api/logs -name "*.log" -mtime +30 -delete
```

## Viewing Logs

```bash
# Watch transcription logs in real-time
tail -f apps/api/logs/transcription/$(date +%Y-%m-%d)-transcription.log | jq

# Find all failed transcriptions today
grep '"status":"failed"' apps/api/logs/transcription/$(date +%Y-%m-%d)-transcription.log | jq

# Show summarization durations
grep 'completed' apps/api/logs/summarization/$(date +%Y-%m-%d)-summarization.log | jq '.data.durationMs'
```
