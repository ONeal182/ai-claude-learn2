# Plan: plan-user-profile-editing

**PRD:** @docs/prd-user-profile-editing.md
**Дата:** 2026-09-04

## Фазы реализации

### Фаза 1: API — поля профиля, чтение профиля и смена имени (Tracer Bullet)

**Цель:** в БД появляются `User.name` / `User.avatarKey`, а в API — защищённые `GET /users/me` и `PATCH /users/me` (имя).
**Затрагивает:** database + backend

**Задачи:**

- [ ] Написать e2e `apps/api/test/profile.e2e-spec.ts`: `GET /users/me` без токена → 401; под Bearer → 200 и тело `{ id, email, name: null, avatarUrl: null, createdAt }`; `PATCH /users/me` `{ name: "Иван" }` → 200, следующий `GET /users/me` → `name: "Иван"`; `PATCH` с `name` из одних пробелов и с `name` длиной > 50 → 400, значение в БД не меняется.
- [ ] Prisma: добавить в модель `User` `name String?` и `avatarKey String?`; `prisma migrate dev --name user_profile_fields` + `prisma generate`.
- [ ] В модуле `users`: `FindUserByIdQuery` + хендлер (`prisma.user.findUnique`) и `UpdateUserProfileCommand` `{ userId, name }` + хендлер (`prisma.user.update`), зарегистрировать в barrel-массивах.
- [ ] Новый модуль `profile` (`profile.module.ts`, `imports: [AuthModule]`): `profile.controller.ts` под `@UseGuards(JwtAuthGuard)` с `GET /users/me` и `PATCH /users/me`; `UpdateProfileNameDto` (`class-validator`: `@Transform` trim + `@Length(1, 50)`); `GetProfileQuery` + хендлер собирает ответ, `avatarUrl = avatarKey ? '/users/avatars/' + avatarKey : null`; подключить `ProfileModule` в `AppModule`.
- [ ] Обновить `apps/api/CLAUDE.md` (модуль `profile`, эндпоинты `/users/me`, новые поля `User`); прогнать `pnpm api lint && pnpm api typecheck && pnpm api test && pnpm api test:e2e`.

**Когда готова:** `apps/api/test/profile.e2e-spec.ts` зелёный; `prisma migrate deploy` проходит на чистой БД; `GET /users/me` под Bearer → 200 с телом профиля, без токена → 401; `PATCH /users/me` меняет имя (200) и отвергает пустое/длинное (400) без изменения в БД.

### Фаза 2: API — смена пароля

**Цель:** пользователь меняет пароль, подтвердив старый; ранее выданный токен продолжает работать.
**Затрагивает:** backend

**Задачи:**

- [ ] Дописать в `apps/api/test/profile.e2e-spec.ts` блок смены пароля: верный `currentPassword` + валидный `newPassword` → 200, затем `POST /auth/login` со старым паролем → 401, с новым → 200; неверный `currentPassword` → 401/400, `login` со старым паролем всё ещё → 200; `newPassword` короче 8 → 400; после успешной смены тот же `accessToken` на `GET /users/me` → 200.
- [ ] В модуле `users`: `UpdateUserPasswordCommand` `{ userId, passwordHash }` + хендлер (`prisma.user.update`).
- [ ] В модуле `auth`: `ChangePasswordCommand` `{ userId, currentPassword, newPassword }` + хендлер — читает пользователя через `FindUserByIdQuery`, сверяет `currentPassword` (`bcryptjs.compare`, при несовпадении `UnauthorizedException`), хеширует новый (`hash`, 10 rounds), зовёт `UpdateUserPasswordCommand`.
- [ ] В `profile.controller.ts`: `POST /users/me/password` + `ChangePasswordDto` (`class-validator`: `currentPassword` `@IsNotEmpty`, `newPassword` `@MinLength(8)` — как `RegisterDto`); контроллер делегирует в `ChangePasswordCommand`.
- [ ] Обновить `apps/api/CLAUDE.md` (эндпоинт `/users/me/password`, роль `auth` в проверке/хешировании, «смена пароля не отзывает JWT»); прогнать `pnpm api lint && typecheck && test && test:e2e`.

**Когда готова:** блок смены пароля в e2e зелёный; `POST /users/me/password` с верным старым паролем меняет пароль (вход по старому → 401, по новому → 200), с неверным старым → 401/400 без изменения, с коротким новым → 400; старый `accessToken` после смены остаётся валиден (`GET /users/me` → 200).

### Фаза 3: API — загрузка и отдача аватара

**Цель:** пользователь загружает/заменяет аватар; бинарник доступен по публичному неугадываемому URL.
**Затрагивает:** backend

**Задачи:**

- [ ] Написать e2e `apps/api/test/profile-avatar.e2e-spec.ts` (по образцу `meeting-files.e2e-spec.ts`: временный `UPLOADS_DIR`, малый лимит): `PUT /users/me/avatar` без токена → 401; с `image/png` ≤ лимита → 200 и `avatarUrl`, `GET avatarUrl` → 200 с `Content-Type: image/png`, `GET /users/me` возвращает тот же `avatarUrl`; файл > лимита → 413; `application/pdf` → 400 (аватар не изменился); повторный `PUT` → новый `avatarUrl` отдаёт новый файл, старый URL → 404; `GET /users/avatars/:key` с неизвестным ключом → 404.
- [ ] Сделать `FileStorageService` переиспользуемым для аватаров (общий модуль/провайдер или отдельный `AvatarStorageService` с тем же API `save`/`remove`/`createReadStream`/`exists`, ключ — `randomUUID`, каталог — `UPLOADS_DIR`).
- [ ] В модуле `users`: `UpdateUserAvatarCommand` `{ userId, avatarKey }` + хендлер; хендлер `GetProfileQuery` уже отдаёт `avatarUrl` из `avatarKey` (Фаза 1) — проверить.
- [ ] В модуле `profile`: `MulterModule.registerAsync` (memoryStorage, `limits.fileSize` = 5 МБ → 413, `fileFilter` по `image/jpeg|image/png|image/webp` → 400); `PUT /users/me/avatar` (`FileInterceptor('file')`) → `UploadAvatarCommand` + хендлер: пишет новый файл, вызывает `UpdateUserAvatarCommand`, удаляет прежний файл с диска (`storage.remove`); отдельный `AvatarController` **без** `JwtAuthGuard`: `GET /users/avatars/:key` → `StreamableFile` с `Content-Type` (404, если записи или файла на диске нет).
- [ ] Обновить `apps/api/CLAUDE.md` (эндпоинты аватара, хранение в `UPLOADS_DIR`, порядок отказов 401 → 413/400 → 404, замена удаляет старый файл, публичная отдача по ключу) и `.env.example` при появлении новой переменной; прогнать `pnpm api lint && typecheck && test && test:e2e`.

**Когда готова:** `profile-avatar.e2e-spec.ts` зелёный; `PUT /users/me/avatar` принимает png/jpeg/webp ≤ 5 МБ (200 + `avatarUrl`), отдаёт 413 для крупного файла и 400 для не-image, аватар при отказе не меняется; повторная загрузка заменяет файл, старый URL → 404; `GET /users/avatars/:key` отдаёт картинку с корректным `Content-Type`, для неизвестного ключа → 404.

### Фаза 4: Веб — страница профиля и аватар в шапке дашборда

**Цель:** залогиненный пользователь видит `/profile`, а в шапке дашборда — свой аватар и имя, ведущие на профиль.
**Затрагивает:** frontend

**Задачи:**

- [ ] `lib/api.ts`: `getMe(token)` → `GET /users/me` (тип `Me { id; email; name: string | null; avatarUrl: string | null; createdAt: string }`) через `bearerRequest`; хелпер `avatarSrc(avatarUrl)` — дописывает `NEXT_PUBLIC_API_URL` к относительному пути. `session.ts` не трогаем — профиль тянется из API.
- [ ] Компонент `components/avatar.tsx`: `<img>` по `avatarSrc(avatarUrl)` с фолбэком на инициалы из `name` или `email`; размеры пропом.
- [ ] Роут `/profile`: `app/profile/page.tsx` (+ клиентский `components/profile-view.tsx` на `useAuthedResource(getMe)`) — карточка: аватар/инициалы, имя или email, email, дата регистрации (`Intl.DateTimeFormat('ru-RU')`), кнопка-ссылка «Редактировать» → `/profile/edit`; отсутствие сессии → редирект на `/login` (обеспечивает хук).
- [ ] `components/dashboard.tsx`: подгрузить профиль (`getMe`), в шапке вместо «Вы вошли как {email}» — `<Avatar>` + имя (или email) как `next/link` на `/profile`.
- [ ] Проверка Playwright MCP (светлая/тёмная тема, мобильная/десктопная ширина, чистая консоль) + ревью по скиллу `ui-ux-pro-max`; `pnpm web lint && pnpm web typecheck && pnpm web build`; обновить `apps/web/CLAUDE.md` (роут `/profile`, `getMe`, компонент `Avatar`).

**Когда готова (проверка Playwright MCP):** открытие `/profile` без токена → редирект на `/login`; с сессией → на экране аватар-или-инициалы, имя-или-email, email и дата регистрации; клик «Редактировать» открывает `/profile/edit`; в шапке дашборда аватар + имя (инициалы при отсутствии аватара) — ссылка, переход ведёт на `/profile`; ошибок в консоли нет; `lint` / `typecheck` / `build` зелёные.

### Фаза 5: Веб — страница редактирования профиля

**Цель:** на `/profile/edit` пользователь меняет имя, аватар и пароль; изменения имени и аватара видны на `/profile` и в шапке дашборда.
**Затрагивает:** frontend

**Задачи:**

- [ ] `lib/api.ts`: `updateProfileName(token, name)` (`PATCH /users/me`), `changePassword(token, { currentPassword, newPassword })` (`POST /users/me/password`), `uploadAvatar(token, file)` (`PUT /users/me/avatar`, multipart `file`); ошибки `ApiError` (400 / 401 / 413) маппятся в понятный текст.
- [ ] Роут `/profile/edit`: `app/profile/edit/page.tsx` (+ `components/profile-edit.tsx` на `useAuthedResource(getMe)`) — три независимых блока (HeroUI `Card` + `Form`): имя (поле + «Сохранить»); аватар (выбор файла + превью через `URL.createObjectURL` + «Сохранить»); пароль (старый / новый / подтверждение + «Сохранить»); у каждого блока свой статус успеха и ошибки.
- [ ] Клиентская валидация до запроса: имя 1..50 после trim; новый пароль ≥ 8 и равен подтверждению; файл из `image/jpeg|png|webp` и ≤ 5 МБ — иначе ошибка у блока без обращения к API.
- [ ] После успешного сохранения имени/аватара — рефетч `getMe` (или редирект на `/profile`), чтобы новое значение появилось на `/profile` и в шапке дашборда; при неверном старом пароле — ошибка у блока пароля, поля не отправляются повторно автоматически; при успешной смене пароля — сообщение об успехе, пользователь остаётся на сайте (сессия не чистится).
- [ ] Проверка Playwright MCP (светлая/тёмная тема, мобайл/десктоп, состояния фокуса/ошибки/загрузки, чистая консоль) + ревью по скиллу `ui-ux-pro-max`; `pnpm web lint && pnpm web typecheck && pnpm web build`; обновить `apps/web/CLAUDE.md` (роут `/profile/edit`, новые функции `lib/api.ts`).

**Когда готова (проверка Playwright MCP):** смена имени → успех на экране, новое имя на `/profile` и в шапке дашборда без ручной перезагрузки; выбор файла аватара показывает превью до отправки, после сохранения новый аватар на `/profile` и в шапке; смена пароля с неверным старым паролем → ошибка у блока, поля пароля не сбрасываются повторным запросом сами; с верным старым → сообщение об успехе, пользователь не разлогинен; невалидные имя / пароль / файл → ошибка до запроса; `lint` / `typecheck` / `build` зелёные.
