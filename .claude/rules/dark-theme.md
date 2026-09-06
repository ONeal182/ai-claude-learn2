# Dark theme rules (apps/web)

One switch, one selector: **`.dark` class on `<html>`** drives both Tailwind `dark:` and the
HeroUI v3 design tokens.

- `src/app/globals.css` redefines the Tailwind dark variant as class-based:
  `@custom-variant dark (&:where(.dark, .dark *));` — there is no media-query dark mode.
- The class is set in `src/app/layout.tsx` by `next/script` `<Script id="theme-init"
  strategy="beforeInteractive">` running a tiny `themeScript` string that reads
  `prefers-color-scheme` and adds `.dark` **before first paint** (no flash). `<html>` has
  `suppressHydrationWarning`. Keep the script string tiny and `beforeInteractive` — do not move
  this into a component effect.
- Colours are oklch tokens in `globals.css` (`--background`, `--foreground`, `--success`,
  `--warning`, `--danger`, ...). Both light and dark values live there.

## Contrast

- Minimum 4.5:1 for text.
- Vivid state tokens (`--success`, `--warning`, `--danger`) as **small text** fail 4.5:1 on light
  backgrounds (HeroUI's default `--danger` on white is only ~3.6:1). Carry the meaning with an
  icon or a coloured dot and keep the label at `text-foreground`. `globals.css` already overrides
  `--danger` to a darker oklch for this reason.

Any UI change is verified in **both** themes — see `apps/web/CLAUDE.md` → "Проверка UI-изменений".
