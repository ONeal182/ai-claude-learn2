# Auth rules (apps/api)

JWT bearer auth. Tokens are issued by `auth` (`POST /auth/register` | `/auth/login` →
`{ accessToken }`), signed with the shared `JwtModule` (secret `JWT_SECRET`, TTL
`JWT_EXPIRES_IN`, default `1d`). Payload: `{ sub: userId, email }`.

## Protecting an endpoint

```ts
// module
@Module({ imports: [AuthModule], controllers: [XController], providers: [...] })
// controller
@Controller('x')
@UseGuards(JwtAuthGuard)          // whole controller, or per-route
export class XController { ... }
// handler
create(@Req() req: AuthenticatedRequest) {
  const userId = req.user!.userId;   // { userId, email } — set by the guard
}
```

- `AuthModule` re-exports `JwtAuthGuard` **and** `JwtModule` — importing it is enough, don't
  re-provide either.
- `JwtAuthGuard` (`src/auth/guards/jwt-auth.guard.ts`): no / malformed `Authorization: Bearer <JWT>`
  or a token that fails `verifyAsync` → `401` (`UnauthorizedException`). On success it puts
  `{ userId, email }` (`AuthUser`) on `request.user`.
- Failure order on a protected upload route: guard (401) → multer `limits` / `fileFilter`
  (413 / 400) → handler. See [`file-upload.md`](file-upload.md).

## Public route inside an otherwise-guarded area

Use a separate controller **without** `@UseGuards` (pattern: `AvatarController` serves
`GET /users/avatars/:key` publicly while `ProfileController` is guarded).

## Module boundaries (`auth` ↔ `users`)

- `auth` never touches Prisma `User` directly — only `CommandBus` / `QueryBus` calls to commands
  and queries declared in `users` (`CreateUserCommand`, `FindUserByEmailQuery`, ...).
- `users` does not import `auth` and knows nothing about passwords / JWT — it takes a ready
  `passwordHash`. Hashing / verification (`bcryptjs`) is `auth`'s job (`RegisterHandler` /
  `LoginHandler`).
- Neither module imports the other; `AppModule` wires both independently. They talk only over the
  CQRS bus.

## Client side

Token handling in the browser lives in `apps/web` — see `apps/web/CLAUDE.md`
("Аутентификация на клиенте"). The API does not decode or store sessions beyond the JWT.
