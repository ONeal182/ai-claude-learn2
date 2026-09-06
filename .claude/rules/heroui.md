# HeroUI rules (apps/web)

UI library is **HeroUI v3** (`@heroui/react` + `@heroui/styles`, on top of Tailwind v4 and
React Aria). For component APIs use the `heroui-react` skill; this file is the project fit.

- **No provider** needed. `@import "@heroui/styles"` in `src/app/globals.css` comes **after**
  `@import "tailwindcss"` — order matters.
- Components are **compound** (`Card.Header`, `Card.Body`, ...).
- Event handlers are **`onPress`**, not `onClick` (React Aria).
- Interactive HeroUI components render inside `"use client"` wrappers in `src/components/`; pages
  in `src/app/` stay server components and import those wrappers.
- **Destructive actions** (delete, anything irreversible) go through a HeroUI `AlertDialog`
  confirmation naming the target — never fire on the first click (pattern: `MeetingFiles` delete).
- Contrast: keep body/label text at `text-foreground`. Vivid tokens (`--success`, `--warning`,
  `--danger`) as small text fail the 4.5:1 ratio — carry meaning with an icon / coloured dot +
  a `text-foreground` label. See [`dark-theme.md`](dark-theme.md).

Styling is Tailwind v4 via `@tailwindcss/postcss` (`postcss.config.mjs`); directives live in
`src/app/globals.css`, there is **no** `tailwind.config`.
