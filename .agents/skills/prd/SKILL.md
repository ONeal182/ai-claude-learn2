---
name: prd
description: Create PRD documentation for a feature following the project's standard structure. Use when a new feature's requirements need to be described before implementation.
---

# PRD generator

Create a PRD (Product Requirements Document) for the following feature:
$ARGUMENTS

Save the result to `docs/prd-<slug>.md`, where `<slug>` is the feature name translated to
English, in kebab-case, without punctuation (e.g. `docs/prd-meeting-file-upload.md`).

Create the `docs` folder if it does not exist.

**Write the document itself in Russian**, using the template below verbatim (headings unchanged).

## Document template

```markdown
# PRD: {название фичи}

**Дата**: {текущая дата}

**Статус**: Draft

## Цель
Одно-два предложения: что это и зачем нужно.

## Пользовательский сценарий
- Пользователь {действие} -> {результат}

## В скоупе
Что входит в фичу — конкретный список.

## Не в скоупе
Что явно не делаем в этой итерации — конкретный список.

## Технические ограничения
- Известное ограничение, которое нужно учесть

## Критерии готовности
- [ ] Критерий 1
- [ ] Критерий 2
```

## Rules

- Be concrete — no filler.
- Phrase every acceptance criterion as an observable, checkable outcome: request -> response code,
  action -> visible screen state, event -> stored data.
- Do not describe how to implement — only what and why.
- If the description is short, ask clarifying questions until you fully understand it, before
  creating the file.
