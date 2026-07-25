---
name: design-polish
description: Make visual/UI tweaks that stay inside this blog's restrained editorial design language — underlines, icons, hover states, dialogs, typography, motion. Use for any request about how the site looks or feels ("add an arrow on hover", "match the design language", "use sans here").
---

# Design polish

Apply UI changes that look like they were always part of the site. The design language is restrained and editorial (inspired by the Anthropic blog research in `research/design-anthropic-blog/`): borders, text-decoration, spacing, and opacity shifts — never flashy effects.

## Design tokens (source of truth: `src/style.css`)

Reuse existing variables before inventing new ones. Key tokens:

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#F9F9F7` | `#141412` | page background |
| `--bg-subtle` | `#F2F2EE` | `#1E1E1B` | cards, wells |
| `--text-main` | `#181818` | `#E8E8E4` | body text |
| `--text-muted` | `#666666` | `#888882` | secondary text |
| `--border` | `#E5E4DF` | `#2E2E2A` | hairlines |
| `--accent` | `#D97757` | `#D97757` | terracotta — decoration only (underlines, hover, focus) |
| `--accent-ink` | `#B85333` | `#E8916F` | link TEXT (WCAG AA against `--bg`) |
| `--measure` | `68ch` | — | golden reading measure; do not widen prose |

Two-voice typography: `--font-sans` (Montserrat/Noto Sans SC) for titles, nav, and UI chrome (including dialogs/confirmation boxes); `--font-serif` (Georgia/Songti SC) for prose body.

## Rules

- Every change must work in **both** light and dark themes (dark overrides its tokens in `src/style.css`); check both before calling it done.
- Motion is subtle and fast: short transitions on opacity/transform, honor `prefers-reduced-motion`.
- Icons are inline SVGs (Lucide / Material-symbols style paths), sized to the text, with `aria-hidden="true"` when decorative. No icon fonts, no external requests.
- Decorative underlines/accents use `--accent`; text that must be readable uses `--accent-ink`.
- Scoped styles in SFCs by default; global `<style>` only for Teleport targets or rendered TipTap HTML.
- Semantic class names + CSS variables, not utility-class blobs (Tailwind is installed but is not the dominant system).
- One declaration per line in longer rule blocks; `clamp()` for fluid type/spacing where nearby code does.
- Preserve accessibility work: visible focus outlines (`2px solid var(--accent)`), keyboard affordances, live regions — don't regress them for looks.

## Workflow

1. Read the component being touched and the relevant token section of `src/style.css` first; mimic the nearest existing pattern (e.g. nav-link chevrons, card open-arrows, hero accent underlines).
2. Make the minimal CSS/markup change; prefer adjusting an existing rule to adding a new one.
3. Verify: `npm run typecheck && npm run build`, then eyeball it in `npm run dev` — light mode, dark mode, hover, and keyboard focus.
