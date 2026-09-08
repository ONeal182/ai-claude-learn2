# PRD: Авто-резюме встречи по транскрипту

**Дата**: 2026-09-07

**Статус**: Draft

## Цель

После того как запись встречи (`recording`) транскрибирована, автоматически прогнать её `transcriptText` через `ClaudeAgentService` и сохранить структурированное резюме на русском: краткое содержание, список решений, список задач. Резюме отдаётся через API вместе с файлом встречи и показывается на странице встречи в `apps/web`.

## Пользовательский сценарий

- Пользователь загружает запись встречи → после завершения транскрибации у файла автоматически появляется резюме (краткое содержание + решения + задачи) на русском.
- Пользователь открывает `/meetings/:id` и у записи со статусом «Готово» → разворачивает блок «Резюме» и читает краткое содержание, список решений и список задач.
- Резюме ещё готовится → пользователь видит «Резюме готовится…»; список сам обновляется и показывает готовое резюме без перезагрузки страницы.
- Резюме собрать не удалось → пользователь видит «Не удалось собрать резюме» и кнопку «Повторить» → нажимает, резюме пересобирается.
- Пользователь нажимает «Повторить» на обработке записи → после новой транскрибации резюме пересобирается автоматически.

## В скоупе

**Данные**

- Поля Prisma-модели `MeetingFile`:
  - `summaryStatus` — `pending | processing | done | failed`, nullable (у `attachment` — `null`).
  - `summary` — JSON, nullable; форма `{ "summary": string, "decisions": string[], "actionItems": string[] }`.
- Миграция схемы.

**Бэкенд (`apps/api`)**

- Доменное событие о завершении транскрибации `recording`-файла (сейчас `MeetingFileProcessingQueue` пишет `done` напрямую — нужно опубликовать событие).
- Конвейер суммаризации: по событию ставит `summaryStatus = processing`, вызывает `ClaudeAgentService` с фиксированным системным промптом (просит на русском и в структурированном виде), парсит ответ, сохраняет `summary` + `summaryStatus = done`. Любой сбой → `summaryStatus = failed`, `summary` не пишется. Один воркер, `concurrency = 1`, как у STT.
- Суммаризация запускается только для `recording` со `status = done` и непустым `transcriptText`.
- `POST /meetings/:id/files/:fileId/reprocess` для записи дополнительно сбрасывает `summaryStatus`; после нового `done` резюме пересобирается автоматически.
- Новый эндпоинт `POST /meetings/:id/files/:fileId/resummarize` — ручной перезапуск: `200` для `recording` со `status = done` и транскриптом; `summaryStatus` → `processing` → `done | failed`, `summary` перезаписывается.
- `GET /meetings/:id/files` и `GET /meetings/:id/files/:fileId` возвращают `summaryStatus` и `summary`.
- Провайдер `SUMMARY_SERVICE` через `useFactory` по env `SUMMARY_ENGINE` (`claude` | `stub`), по образцу `STT_SERVICE`; `stub` — детерминированное резюме из метаданных (для e2e).

**Фронтенд (`apps/web`)**

- В `src/lib/api.ts`: тип `MeetingFile` расширить полями `summaryStatus`, `summary`; функция `resummarizeMeetingFile()`.
- В `src/components/meeting-files.tsx` (`FileRow`) для `recording`:
  - `summaryStatus = processing` → строка «Резюме готовится…» со спиннером.
  - `summaryStatus = failed` → текст ошибки + кнопка «Повторить» (вызывает `resummarize`).
  - `summaryStatus = done` → сворачиваемый блок «Резюме»: абзац краткого содержания, список «Решения», список «Задачи».
  - Поллинг списка продолжается, пока есть `summaryStatus` в `pending | processing` (аналогично текущему условию по `status`).

**Прочее**

- Новые env-переменные в `.env.example`, `turbo.json → globalPassThroughEnv`, `.github/workflows/ci.yml → env`.
- `test/setup-e2e.ts` выставляет `SUMMARY_ENGINE ??= 'stub'`.
- Юнит-тесты: маппинг успешного/ошибочного ответа `ClaudeAgentService`, парсинг JSON, ветка `failed`, идемпотентность обработчика события.
- e2e: загрузка записи → stub-транскрипт → stub-резюме → `GET` показывает `summary`; отдельные сценарии `failed` и `resummarize`.
- Обновить `CLAUDE.md` (корневой, `apps/api`, модульный) в том же PR.

## Не в скоупе

- Общее резюме на уровне встречи (агрегация транскриптов нескольких записей).
- Резюме для `attachment`-файлов.
- Ручное редактирование резюме и перегенерация с произвольной инструкцией/промптом от пользователя.
- Стриминг резюме в UI, показ частичных результатов.
- Обработка транскриптов длиннее контекстного окна модели (чанкинг / map-reduce) — такой случай завершается `failed`.
- Выбор языка вывода (всегда русский).
- Уведомления (email/пуш) о готовности резюме.
- Экспорт/скачивание резюме (PDF, markdown).
- Автоматические ретраи с backoff для `failed` (только ручной `resummarize`).
- Учёт стоимости, квоты, отдельная обработка rate-limit (кроме перевода в `failed`).
- История версий резюме.

## Технические ограничения

- `ClaudeAgentService` запускает Claude Code CLI как подпроцесс и требует аутентификации (`ANTHROPIC_API_KEY` или ambient-логин `claude`). Без аутентификации суммаризация → `failed`.
- Ответ модели недетерминирован и может не быть валидным JSON — парсер обязан валидировать форму; невалидный ответ → `failed`, без частичных данных.
- Контекстное окно модели ограничивает длину транскрипта (Haiku ~200K токенов); превышение → `failed`.
- Конвейер in-process, `concurrency = 1`, без внешнего брокера; durability между рестартами не гарантируется — зависшие `pending | processing` не возобновляются.
- Каждый реальный прогон суммаризации тратит кредиты Anthropic API или лимиты подписки; поэтому e2e идут на `SUMMARY_ENGINE = stub` (как `STT_ENGINE = stub`), а реальный путь покрыт юнит-тестами с мок-SDK и опциональной интеграционной проверкой.
- `summary` хранится как JSON-колонка со строго заданной формой `{ summary: string; decisions: string[]; actionItems: string[] }`.
- Модель для суммаризации берётся из `CLAUDE_AGENT_MODEL` (дефолт `claude-haiku-4-5`).
- Новая env-переменная должна появиться сразу в трёх местах: `.env.example`, `turbo.json`, `ci.yml` (правило проекта).

## Критерии готовности

- [ ] Модель `MeetingFile` имеет `summaryStatus` (`pending|processing|done|failed`, nullable) и `summary` (JSON, nullable); миграция применяется на чистой БД.
- [ ] После перехода `recording`-файла в `status = done` с непустым `transcriptText` `summaryStatus` проходит `pending|processing → done`, и `GET /meetings/:id/files/:fileId` возвращает `summary` вида `{ "summary": string, "decisions": string[], "actionItems": string[] }` с непустым полем `summary`.
- [ ] Текст `summary`, элементы `decisions` и `actionItems` — на русском независимо от языка транскрипта.
- [ ] Для `attachment`-файла `summaryStatus === null` и `summary === null`; событие суммаризации для него не публикуется.
- [ ] При сбое суммаризации (нет аутентификации / невалидный ответ модели / превышен контекст) `summaryStatus === 'failed'`, `summary === null`, очередь обработки не залипает (следующий файл обрабатывается).
- [ ] `GET /meetings/:id/files` и `GET /meetings/:id/files/:fileId` содержат поля `summaryStatus` и `summary` для каждого файла.
- [ ] `POST /meetings/:id/files/:fileId/resummarize` без заголовка `Authorization` → `401`.
- [ ] `POST .../resummarize` для `recording` со `status = done` и непустым `transcriptText` → `200`; `summaryStatus` переходит в `processing`, затем в `done | failed`, `summary` перезаписывается результатом нового прогона.
- [ ] `POST .../resummarize` для несуществующей встречи или файла → `404`; для файла не в `status = done`, без транскрипта или с `summaryStatus = 'processing'` → `409`, `summary` не меняется.
- [ ] `POST /meetings/:id/files/:fileId/reprocess` для записи сбрасывает `summaryStatus`, и после нового `done` `summary` пересобирается автоматически (значение отличается от прежнего прогона на другом транскрипте).
- [ ] `DELETE /meetings/:id/files/:fileId` удаляет файл вместе с резюме; повторный `GET` этого файла → `404`.
- [ ] На `/meetings/:id` у записи со `summaryStatus = 'processing'` виден индикатор «Резюме готовится…»; список сам обновляется поллингом и без перезагрузки показывает готовое резюме.
- [ ] При `summaryStatus = 'done'` в UI есть сворачиваемый блок «Резюме» с абзацем краткого содержания, списком «Решения» и списком «Задачи».
- [ ] При `summaryStatus = 'failed'` в UI показаны сообщение об ошибке и кнопка «Повторить»; нажатие вызывает `resummarize` и переводит блок в состояние «готовится».
- [ ] e2e-набор `apps/api` проходит офлайн при `SUMMARY_ENGINE = stub` (без сетевых обращений к Anthropic) и покрывает сценарии: успешное резюме, `failed`, `resummarize`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` в `apps/api` зелёные; юнит-тесты покрывают маппинг успешного и ошибочного ответа `ClaudeAgentService`, парсинг JSON-ответа и ветку `failed`.
- [ ] Новые env-переменные добавлены в `.env.example`, `turbo.json → globalPassThroughEnv`, `.github/workflows/ci.yml → env`; затронутые `CLAUDE.md` обновлены в том же PR.
