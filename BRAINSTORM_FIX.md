# Брейншторм: Исправление транскрипции и суммаризации

## Диагностика

### ✅ Что работает:

- Логирование установлено и настроено
- FileLoggerService интегрирован в код
- SUMMARY_ENGINE=claude (правильно)
- ANTHROPIC_API_KEY присутствует

### ❌ Проблема 1: Транскрипция возвращает только метаданные

**Причина**: `STT_ENGINE=stub` в `.env`

**Текущее поведение:**

```typescript
// StubSttService.transcribe()
return Promise.resolve(`Транскрипт файла «${input.originalName}» (${input.size} байт).`);
```

**Решение:**

1. **Вариант A (быстрый)**: Оставить `STT_ENGINE=stub` для разработки, но улучшить stub:
   - Генерировать реалистичный транскрипт (несколько предложений с таймстемпами)
   - Добавить вариативность на основе имени файла или размера

2. **Вариант B (полный)**: Установить whisper.cpp:
   ```bash
   # Установить whisper.cpp
   cd apps/api
   pnpm whisper:model  # Скачает модель

   # В .env изменить:
   STT_ENGINE=whisper
   WHISPER_BIN_PATH=/путь/к/whisper-cli
   WHISPER_MODEL_PATH=./.whisper/ggml-tiny.bin
   ```

**Рекомендация**: Вариант A для быстрого исправления, затем B для production.

---

### ❌ Проблема 2: Суммаризация не работает

**Возможные причины:**

1. **Транскрипт пустой/короткий** - из-за stub он содержит только метаданные (1 строка)
2. **EventBus не публикует MeetingFileTranscribedEvent** - нужна проверка
3. **MeetingSummaryQueue не обрабатывает событие** - нужна проверка логов
4. **ClaudeSummaryService падает на коротком тексте** - возможно, модель отказывается

**Проверка:**

```bash
# 1. Проверить логи транскрипции
ls -lah apps/api/logs/transcription/
cat apps/api/logs/transcription/$(date +%Y-%m-%d)-transcription.log | jq

# 2. Проверить логи суммаризации
ls -lah apps/api/logs/summarization/
cat apps/api/logs/summarization/$(date +%Y-%m-%d)-*.log | jq

# 3. Проверить БД (если Postgres запущен)
psql $DATABASE_URL -c "SELECT id, title, \"summaryStatus\" FROM \"Meeting\" LIMIT 5;"
psql $DATABASE_URL -c "SELECT id, \"originalName\", status, LENGTH(\"transcriptText\") FROM \"MeetingFile\" LIMIT 5;"
```

---

## План исправления

### Этап 1: Улучшить StubSttService (быстрое решение)

**Цель**: Генерировать реалистичные транскрипты для тестирования

```typescript
// apps/api/src/meeting-file/processing/stt.service.ts
transcribe(input: SttInput): Promise<string> {
  const name = input.originalName.replace(/\.[^.]+$/, '');
  return Promise.resolve(`[00:00] Участник 1: Добрый день, коллеги! Начинаем встречу по теме "${name}".
[00:15] Участник 2: Привет! Давайте обсудим текущие задачи и приоритеты.
[00:30] Участник 1: Согласен. Первый вопрос - завершение модуля авторизации.
[00:45] Участник 2: По авторизации у нас прогресс - основная функциональность готова.
[01:00] Участник 1: Отлично! Какие следующие шаги?
[01:15] Участник 2: Нужно провести code review и написать unit-тесты.
[01:30] Участник 1: Хорошо, решено. Кто возьмется за тесты?
[01:45] Участник 2: Я могу взять на себя тесты на этой неделе.
[02:00] Участник 1: Договорились. Встречу можно завершать.`);
}
```

### Этап 2: Добавить детальное логирование событий

**Цель**: Понять, почему EventBus не триггерит суммаризацию

```typescript
// apps/api/src/meeting-file/processing/meeting-file-processing.queue.ts
// После успешной транскрипции, перед публикацией события:
this.logger.log(
  `Публикуем MeetingFileTranscribedEvent для файла ${fileId}, встреча ${file.meetingId}`,
);
this.eventBus.publish(new MeetingFileTranscribedEvent(fileId, file.meetingId));
this.logger.log(`MeetingFileTranscribedEvent опубликован`);
```

```typescript
// apps/api/src/meeting-file/events/handlers/meeting-file-transcribed.handler.ts
// В начале метода handle:
this.logger.log(
  `MeetingFileTranscribedHandler получил событие: fileId=${event.fileId}, meetingId=${event.meetingId}`,
);
```

```typescript
// apps/api/src/meeting-file/processing/meeting-summary.queue.ts
// В методе enqueue:
this.logger.log(`MeetingSummaryQueue.enqueue вызван для встречи ${meetingId}`);
if (this.pending.includes(meetingId)) {
  this.logger.log(`Встреча ${meetingId} уже в очереди, пропускаем`);
  return;
}
this.logger.log(`Встреча ${meetingId} добавлена в очередь`);
```

### Этап 3: Проверить RegenerateMeetingSummaryHandler

**Цель**: Убедиться, что ручная регенерация работает

```typescript
// Добавить логирование в начало execute():
this.logger.log(`Начинаем регенерацию суммаризации для встречи ${command.meetingId}`);
```

### Этап 4: Тестирование

1. Перезапустить API сервер
2. Загрузить тестовый файл через POST `/meetings/:id/files`
3. Проверить логи транскрипции: `tail -f apps/api/logs/transcription/*.log | jq`
4. Проверить логи суммаризации: `tail -f apps/api/logs/summarization/*.log | jq`
5. Проверить консоль API на наличие логов EventBus
6. Проверить БД: статус файла и встречи

---

## Приоритет задач

1. **ВЫСОКИЙ**: Улучшить StubSttService (15 мин)
2. **ВЫСОКИЙ**: Добавить логи EventBus и очередей (20 мин)
3. **СРЕДНИЙ**: Протестировать полный флоу (10 мин)
4. **СРЕДНИЙ**: Исправить найденные проблемы (время зависит от проблемы)
5. **НИЗКИЙ**: Установить whisper.cpp для production (опционально)

---

## Ожидаемые результаты после исправления

### Транскрипция:

```json
{
  "timestamp": "2026-09-09T14:00:00.000Z",
  "message": "Transcription completed",
  "data": {
    "fileId": "...",
    "meetingId": "...",
    "fileName": "meeting.m4a",
    "durationMs": 150,
    "transcriptLength": 450,
    "status": "success"
  }
}
```

### Суммаризация:

```json
{
  "timestamp": "2026-09-09T14:00:05.000Z",
  "message": "Summarization completed",
  "data": {
    "meetingId": "...",
    "meetingTitle": "Brainstorm",
    "durationMs": 3000,
    "transcriptLength": 450,
    "summaryLength": 200,
    "decisionsCount": 2,
    "actionItemsCount": 3,
    "status": "success"
  }
}
```

### БД:

- `MeetingFile.status = "done"`
- `MeetingFile.transcriptText` содержит реалистичный транскрипт
- `Meeting.summaryStatus = "done"`
- `Meeting.summary` содержит резюме
- `Meeting.decisions` содержит массив решений
