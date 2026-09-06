---
name: issues
description: Create GitHub issues and milestones from a plan file. Use when a phased plan is ready and the backlog needs to be created on GitHub.
---

# Issues-from-plan generator

Read the plan from the file: $ARGUMENTS

For each phase of the plan, create a milestone and one issue per task in that phase. Work through
the `gh` CLI.

**Milestone and issue text stays in Russian** (titles and bodies) — see the formats below.

## Steps

1. Read the plan file and list the phases and their tasks.
2. For each phase create a milestone (title — `Фаза N: название`):
   `gh api repos/{owner}/{repo}/milestones -f title="Фаза N: название"`
3. For each task in the phase create an issue linked to that phase's milestone:
   `gh issue create --title "..." --body "..." --milestone "Фаза N: название"`
4. No duplicates: before creating, check the existing milestones
   (`gh api repos/{owner}/{repo}/milestones`) and issues (`gh issue list`).

## Issue format

- **Title**: the task text from the plan (without `- [ ]`).
- **Body**: the task description + a line `Фаза: N — название` + a link to the plan file.
- **Labels**: optional; add `--label` only if the label already exists in the repo (otherwise
  `gh issue create` fails) — create it first with `gh label create` if needed.
