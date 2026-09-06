# CQRS rules (apps/api)

`@nestjs/cqrs` is the pattern for every module with business logic (`auth`, `users`,
`meeting`, `meeting-file`, `profile`). Follow the shape below for a new one.

## Folder layout

```
<module>/
├── <module>.module.ts
├── <module>.controller.ts
├── commands/
│   ├── impl/       # one file per command: plain class, readonly ctor params
│   └── handlers/   # one file per handler + index.ts barrel → `export const CommandHandlers = [...]`
├── queries/
│   ├── impl/
│   └── handlers/   # index.ts barrel → `export const QueryHandlers = [...]`
└── events/         # only if the module emits events
    ├── impl/
    └── handlers/   # index.ts barrel → `export const EventHandlers = [...]`
```

## Rules

- **Controller has no business logic.** It builds a Command/Query from the DTO and calls
  `commandBus.execute(...)` / `queryBus.execute(...)`. Nothing else.
  ```ts
  @Post()
  create(@Body() dto: CreateMeetingDto): Promise<Meeting> {
    return this.commandBus.execute(new CreateMeetingCommand(dto.title, dto.startsAt));
  }
  ```
- **Command / Query impl** = a plain class with `public readonly` constructor params, no decorators.
- **Handler** = `@Injectable()` + `@CommandHandler(X)` / `@QueryHandler(X)` / `@EventsHandler(X)`,
  implements `ICommandHandler<X, R>` etc.
- **Reads go through the `QueryBus`**, even from inside a command handler — so each read model has a
  single source of truth. Don't reach into Prisma for another module's entity; call its query
  (e.g. `meeting-file` gets a meeting via `GetMeetingByIdQuery`, not `prisma.meeting`).
- **Side effects after a successful command** go through `EventBus.publish(...)` + an
  `@EventsHandler`, not inline in the command handler.
- **Module wiring**: register the barrels in `providers`, nothing more:
  ```ts
  @Module({
    imports: [AuthModule],           // only if the controller needs JwtAuthGuard
    controllers: [MeetingController],
    providers: [...CommandHandlers, ...QueryHandlers, ...EventHandlers],
  })
  ```
- **One `CqrsModule.forRoot()` for the whole app** — it lives in `AuthModule` (`global: true`).
  A new CQRS module does **not** call `forRoot()` again; the explorer finds its handlers anyway.
- Cross-module calls go over the shared bus only — modules don't import each other except to pull
  `AuthModule` for the guard. See `apps/api/CLAUDE.md` → "Границы модулей `auth`/`users`".

## Errors

- Not-found → throw `NotFoundException` from the query handler (`GetMeetingByIdQuery` → 404).
- Conflict / wrong state → `ConflictException` (409), e.g. reprocess of a non-`failed` file.

New module with non-trivial behaviour also gets its own `src/<module>/CLAUDE.md` (layout + rules),
with a one-line row added to the "Модули" table in `apps/api/CLAUDE.md`.
