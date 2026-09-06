# Testing rules (apps/api)

vitest. Two configs, two file suffixes:

| Kind | File | Config | Command |
| ---- | ---- | ------ | ------- |
| unit | `src/**/*.spec.ts` | `vitest.config.ts` | `pnpm api test` |
| e2e  | `test/**/*.e2e-spec.ts` | `vitest.config.e2e.ts` | `pnpm api test:e2e` (needs Postgres) |

- `globals: true` — use `describe` / `it` / `expect` / `beforeEach` **without importing them**
  (types via `tsconfig` `types: ["vitest/globals", "node"]`).
- `vite-tsconfig-paths` resolves the `tsconfig` path aliases in both configs.
- ESM: import app code with the `.js` extension (`./../src/app.module.js`). See
  [`esm.md`](esm.md).

## TDD

Red test first, then the implementation (ralph loop rule). After each final change run the
tests; if still red after ~5 attempts, stop and write the problem into the issue.

## e2e shape

- Boot the real app: `Test.createTestingModule({ imports: [AppModule] }).compile()` →
  `moduleFixture.createNestApplication()` → `await app.init()`. `afterEach` → `await app.close()`.
- HTTP via `supertest` against `app.getHttpServer()`.
- Auth: `POST /auth/register` → `201 { accessToken }`; send `Authorization: Bearer <accessToken>`.
  Use a unique email per test (`randomUUID()` + `@example.com`).
- The global `ValidationPipe` (`APP_PIPE` in `AppModule`) is active in e2e too — 400s are real.

## Swapping a provider (stub)

```ts
Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(STT_SERVICE)
  .useValue(new E2eSttService())
  .compile();
```
Prod code carries **no** test branches — the failing double keys off a marker in the input
(`__stt_fail__` in the file name).

## Env-dependent e2e (uploads)

`@nestjs/config` does not overwrite an already-set `process.env`, so set the vars **before** the
app is loaded, then `import()` `AppModule` dynamically inside `beforeEach`:

```ts
beforeAll(async () => {
  uploadsDir = await mkdtemp(join(tmpdir(), '<name>-e2e-'));
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.MAX_UPLOAD_SIZE_BYTES = String(8 * 1024); // small → cheap 413
});
afterAll(() => rm(uploadsDir, { recursive: true, force: true }));
beforeEach(async () => {
  const { AppModule } = await import('./../src/app.module.js');
  // ...createTestingModule
});
```
A static top-of-file `import { AppModule }` would bind config before the swap — don't use it in
these specs. Use a temp `UPLOADS_DIR` so tests never litter the real `uploads/`.
