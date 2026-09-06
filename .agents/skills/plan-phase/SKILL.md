---
name: plan-phase
description: Break a PRD into implementation phases. Use when a PRD is ready and a development plan with independent phases is needed.
---

# Plan generator

Read the PRD from the file: $ARGUMENTS

Save the result to `plan/plan-<slug>.md`, where `<slug>` is the PRD file name without the path,
extension, and `prd-` prefix (e.g. PRD `docs/prd-meeting-file-upload.md` -> plan
`plan/plan-meeting-file-upload.md`). The slug is already English kebab-case — do not change it,
only swap the `prd-` prefix for `plan-`.

Create the `plan` folder if it does not exist.

**Write the plan itself in Russian**, using the template below verbatim (headings unchanged) —
the `issues` skill parses these exact Russian headings.

## Plan template

```markdown
# Plan: {имя файла плана}

**PRD:** $ARGUMENTS
**Дата:** {текущая дата}

## Фазы реализации

### Фаза 1: {название}
**Цель:** что даёт эта фаза
**Затрагивает:** backend / frontend / database

**Задачи:**
- [ ] Задача 1
- [ ] Задача 2

**Когда готова:** наблюдаемый проверяемый результат (запрос -> код ответа, действие -> видимое состояние экрана, тесты фазы зелёные)

### Фаза 2: {название}
...
```

## Phase-splitting rules

- Every phase must deliver a working result.
- Phases are independent — you can stop after any of them.
- The first phase is the minimal working path (Tracer Bullet).
- No more than five tasks per phase.
- Backend and frontend of one feature are separate phases.
- Every phase has planned tests covering its functionality; tests are written before the phase is
  implemented, and the acceptance criterion includes them passing.

## Rules

- Read the PRD carefully — the plan must cover every acceptance criterion.
- Do not add tasks that are not in the PRD.
- If the PRD is incomplete, ask clarifying questions before creating the plan.
