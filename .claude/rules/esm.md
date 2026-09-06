# ESM rules (apps/api)

`apps/api` is **pure ESM** (`package.json` → `"type": "module"`), `tsconfig` `module` /
`moduleResolution` = `nodenext`. Get these wrong and `typecheck` / `build` fails.

## Imports

- **Relative imports carry a `.js` extension**, even though the source file is `.ts`:
  ```ts
  import { AppModule } from './app.module.js';
  import { PrismaService } from '../../../prisma/prisma.service.js';
  import { CommandHandlers } from './commands/handlers/index.js';   // barrels too
  ```
  Never write `'./app.module'` or `'./app.module.ts'`.
- Package imports are bare as usual (`@nestjs/common`, `@prisma/client`).
- Type-only imports use `import type { User } from '@prisma/client'` (`isolatedModules` is on).

## No CommonJS globals

- No `__dirname` / `__filename` / `require`. Use `new URL('.', import.meta.url)` /
  `import.meta.dirname` when a path is genuinely needed (rare here — file paths go through
  `FileStorageService`).
- `main.ts` uses top-level `await` (`await bootstrap()`), which is fine under ESM.

## Config side-effect import

- `prisma.config.ts` starts with `import 'dotenv/config';` **before** any other import, so
  `env('DATABASE_URL')` is populated. Keep side-effect imports first.

## New file checklist

- Added a file under `src/`? Every relative import in it ends in `.js`.
- Added it to a barrel `index.ts`? That import ends in `.js` too.
- `oxlint` and `tsc --noEmit -p tsconfig.json` both pass before committing.
