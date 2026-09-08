# Plan: plan-meeting-transcript-summary

**PRD:** @docs/prd-meeting-transcript-summary.md
**Дата:** 2026-09-07

## Фазы реализации

### Фаза 1: API — схема, stub-движок и авто-суммаризация end-to-end (Tracer Bullet)

**Цель:** у `MeetingFile` появляются поля `summaryStatus` / `summary`; после транскрибации `recording`-файла in-process конвейер автоматически проставляет stub-резюме, и оба поля отдаются в `GET /meetings/:id/files[...]`.
**Затрагивает:** database + backend

**Задачи:**

- [ ] Написать e2e `apps/api/test/meeting-summary.e2e-spec.ts` (`SUMMARY_ENGINE=stub`, по образцу `meeting-files.e2e-spec.ts` с временным `UPLOADS_DIR`): загрузка `recording` → после `status=done` поллинг `GET /meetings/:id/files/:fileId` показывает `summaryStatus` `pending|processing → done` и непустое `summary` формы `{ summary: string, decisions: string[], actionItems: string[] }`; `GET /meetings/:id/files` содержит те же поля; для `attachment` — `summaryStatus === null`, `summary === null`; повторная доставка события по тому же `fileId` (юнит-тест обработчика/очереди) не плодит дублей и не ломает `done`.
- [ ] Prisma: в модель `MeetingFile` добавить `summaryStatus MeetingFileStatus?` (переиспользовать enum) и `summary Json?`; `pnpm exec prisma migrate dev --name meeting_file_summary_fields` + `prisma generate`.
- [ ] Env-движок: `SUMMARY_ENGINE` (`stub` | `claude`, в этой фазе дефолт `stub`) в `.env.example` + `turbo.json → globalPassThroughEnv` + `.github/workflows/ci.yml → env`; `test/setup-e2e.ts` — `process.env.SUMMARY_ENGINE ??= 'stub'`. Токен `SUMMARY_SERVICE` + интерфейс `SummaryService`/`SummaryInput` (`transcriptText`, `originalName`, `signal?`); `StubSummaryService` — детерминированное резюме из метаданных; провайдер через `useFactory` по `SUMMARY_ENGINE` (по образцу `STT_SERVICE` в `meeting-file.module.ts`).
- [ ] Доменное событие `MeetingFileTranscribedEvent { fileId }` — публикуется из `MeetingFileProcessingQueue` (инжект `EventBus`) при переходе в `done`; `MeetingFileTranscribedHandler` кладёт файл в новый `MeetingFileSummaryQueue` — in-process воркер `concurrency = 1`: `summaryStatus pending → processing → done` + запись `summary`; обрабатывает только `recording` с непустым `transcriptText`, иначе выходит без изменений; `OnModuleDestroy` рвёт активную задачу и ждёт «догорания» (как STT-очередь).
- [ ] `toMeetingFileDto` (`dto/meeting-file.dto.ts`): добавить `summaryStatus` и `summary`; обновить `src/meeting-file/CLAUDE.md` и `apps/api/CLAUDE.md` (новые поля, событие, `MeetingFileSummaryQueue`, `SUMMARY_ENGINE`); прогнать `pnpm --filter api lint && typecheck && test && test:e2e`.

**Когда готова:** `apps/api/test/meeting-summary.e2e-spec.ts` зелёный; `prisma migrate deploy` проходит на чистой БД; после `status=done` у `recording` `summaryStatus` доходит до `done` и `GET /meetings/:id/files/:fileId` возвращает непустое `summary` формы `{ summary, decisions[], actionItems[] }`; у `attachment` оба поля `null`; `GET /meetings/:id/files` содержит `summaryStatus` и `summary`; `pnpm --filter api lint && typecheck && test && test:e2e` зелёные.

### Фаза 2: API — движок Claude, русский промпт и обработка сбоев

**Цель:** при `SUMMARY_ENGINE=claude` резюме собирается реальным вызовом `ClaudeAgentService` на русском в строгой JSON-форме; любой сбой переводит файл в `summaryStatus=failed` без частичных данных и не залипает очередь.
**Затрагивает:** backend

**Задачи:**

- [ ] Юнит-тесты (до реализации): в `apps/api/src/claude-agent/claude-agent.service.spec.ts` добавить блок с `vi.mock('@anthropic-ai/claude-agent-sdk')` — `run()` мапит `subtype:'success'` → `{ text, isError:false, subtype, numTurns, costUsd }`; error-subtype и брошенное `…returned an error result: …` → `isError:true` (префикс срезан); стрим без `result` → `ClaudeAgentError`. Новый `src/meeting-file/processing/claude-summary.service.spec.ts` с мок `ClaudeAgentService`: валидный JSON-ответ → `{ summary, decisions[], actionItems[] }`; не-JSON / неверная форма (не массив строк, нет поля) → throw. Опциональный интеграционный `*.integration-spec.ts` (`skipIf` без аутентификации, как живой тест `claude-agent`): реальное резюме мини-фикстуры → непустые поля и наличие кириллицы.
- [ ] `ClaudeSummaryService implements SummaryService` — фиксированный системный промпт (по-русски, требует вернуть строго JSON `{ "summary": string, "decisions": string[], "actionItems": string[] }` без пояснений), вызов `claudeAgent.run(transcriptText, { systemPrompt, model })` с моделью из `CLAUDE_AGENT_MODEL` (дефолт `claude-haiku-4-5`); `signal` из `SummaryInput` пробрасывается.
- [ ] Парсинг + валидация ответа модели: извлечь JSON, проверить типы (`summary` — непустая строка, `decisions`/`actionItems` — массивы строк); при `run()` `isError` или невалидной форме — throw (частичное `summary` не собираем).
- [ ] `MeetingFileSummaryQueue`: любой throw из `SUMMARY_SERVICE` (нет аутентификации / невалидный ответ / превышен контекст) → `summaryStatus = failed`, `summary` не трогаем, воркер переходит к следующему файлу; `P2025` (файл удалён во время обработки) — молча.
- [ ] `SUMMARY_ENGINE` дефолт → `claude`; фабрика `SUMMARY_SERVICE`: `claude` → `ClaudeSummaryService`, `stub` → `StubSummaryService`; `ci.yml` оставляет `SUMMARY_ENGINE: stub`; поправить комментарии в `.env.example` / `turbo.json`; обновить `src/meeting-file/CLAUDE.md` и `apps/api/CLAUDE.md` (движок Claude, ветка `failed`, промпт); прогнать `pnpm --filter api lint && typecheck && test && test:e2e`.

**Когда готова:** новые юнит-тесты (`claude-agent.service.spec.ts` mocked-блок, `claude-summary.service.spec.ts`) зелёные; при `SUMMARY_ENGINE=claude` и доступной аутентификации успешный прогон даёт `summaryStatus=done` и `summary` на русском (проверяется опциональным `*.integration-spec.ts`); когда `SUMMARY_SERVICE` бросает или ответ невалиден — `summaryStatus=failed`, `summary` пуст, следующий файл в очереди обрабатывается; `pnpm --filter api lint && typecheck && test && test:e2e` зелёные.

### Фаза 3: API — ручной resummarize и сброс резюме при reprocess

**Цель:** резюме можно пересобрать вручную (`POST .../resummarize`), а перезапуск обработки записи (`reprocess`) сбрасывает резюме и пересобирает его после новой транскрибации.
**Затрагивает:** backend

**Задачи:**

- [ ] Дописать в `apps/api/test/meeting-summary.e2e-spec.ts` (`SUMMARY_ENGINE=stub`): `POST /meetings/:id/files/:fileId/resummarize` без токена → 401; для `recording` `status=done` с транскриптом → 200, `summaryStatus` `processing → done`, `summary` перезаписан (stub включает маркер прогона); несуществующая встреча/файл → 404; файл не `done` / пустой `transcriptText` / `summaryStatus=processing` → 409, `summary` без изменений; `POST .../reprocess` записи → `summaryStatus`/`summary` сброшены, после нового `done` `summary` пересобран; `DELETE .../files/:fileId` → последующий `GET` файла → 404.
- [ ] `ResummarizeMeetingFileCommand { meetingId, fileId }` + хендлер: 404 через `GetMeetingFileQuery`; 409 (`ConflictException`), если `type !== recording` / `status !== done` / пустой `transcriptText` / `summaryStatus === processing`; иначе `summaryStatus = pending` и `EventBus.publish` события, ведущего в `MeetingFileSummaryQueue` (переиспользовать вход очереди из Фазы 1).
- [ ] `meeting-file.controller.ts`: `POST /:fileId/resummarize` (`@HttpCode(200)`, контроллер под `@UseGuards(JwtAuthGuard)`) → `CommandBus.execute(new ResummarizeMeetingFileCommand(...))`.
- [ ] `ReprocessMeetingFileHandler`: при атомарном переводе записи в `pending` также сбрасывать `summaryStatus = null` и `summary = null` (новый `done` затриггерит `MeetingFileTranscribedEvent` → суммаризацию).
- [ ] Обновить `src/meeting-file/CLAUDE.md` и `apps/api/CLAUDE.md` (эндпоинт `resummarize`, порядок отказов 401 → 404 → 409, `reprocess` сбрасывает резюме); прогнать `pnpm --filter api lint && typecheck && test && test:e2e`.

**Когда готова:** e2e-блок `resummarize`/`reprocess` зелёный: `POST .../resummarize` → 401 без токена, 200 для `done`+транскрипт с перезаписью `summary`, 404 для неизвестного, 409 для не-`done`/без транскрипта/`processing` без изменения `summary`; `POST .../reprocess` записи сбрасывает `summaryStatus` и после нового `done` даёт новый `summary`; `DELETE` файла убирает резюме (последующий `GET` → 404); `pnpm --filter api lint && typecheck && test && test:e2e` зелёные.

### Фаза 4: Веб — отображение резюме, поллинг и повтор

**Цель:** на `/meetings/:id` у записи виден блок «Резюме»: индикатор при обработке, сворачиваемое резюме при готовности, сообщение об ошибке с кнопкой «Повторить»; список автообновляется, пока резюме готовится.
**Затрагивает:** frontend

**Задачи:**

- [ ] `src/lib/api.ts`: тип `MeetingFileSummary { summary: string; decisions: string[]; actionItems: string[] }`; в `MeetingFile` — `summaryStatus: MeetingFileStatus | null` и `summary: MeetingFileSummary | null`; функция `resummarizeMeetingFile(meetingId, fileId, accessToken)` → `POST /meetings/:id/files/:fileId/resummarize` (по образцу `reprocessMeetingFile`).
- [ ] `src/components/meeting-files.tsx` `FileRow` для `recording`: `summaryStatus ∈ {pending, processing}` → строка «Резюме готовится…» со `Spinner`; `summaryStatus === 'done'` → сворачиваемая секция (по образцу «Показать транскрипт»): абзац `summary.summary`, список «Решения» (`summary.decisions`), список «Задачи» (`summary.actionItems`); пустые списки скрываются.
- [ ] `FileRow`: `summaryStatus === 'failed'` → текст «Не удалось собрать резюме» + кнопка «Повторить» → `runRowAction('resummarize', () => resummarizeMeetingFile(...), { refreshAfter: true })`.
- [ ] Поллинг: расширить `hasActive` — истинно также, пока у любого файла `summaryStatus ∈ {pending, processing}` (в дополнение к текущему условию по `status`).
- [ ] Проверка Playwright MCP (светлая/тёмная тема, мобильная/десктопная ширина, чистая консоль) + ревью по скиллу `ui-ux-pro-max`; `pnpm --filter web lint && typecheck && build`; обновить `apps/web/CLAUDE.md` (поля `summaryStatus`/`summary`, `resummarizeMeetingFile`, блок «Резюме», поллинг).

**Когда готова (проверка Playwright MCP):** на `/meetings/:id` у записи со `summaryStatus='processing'` виден индикатор «Резюме готовится…», список сам обновляется и без перезагрузки показывает готовое резюме; при `summaryStatus='done'` — сворачиваемый блок «Резюме» с кратким содержанием, списком «Решения» и списком «Задачи»; при `summaryStatus='failed'` — сообщение об ошибке и кнопка «Повторить», нажатие переводит блок в «готовится»; ошибок в консоли нет; `pnpm --filter web lint && typecheck && build` зелёные.
