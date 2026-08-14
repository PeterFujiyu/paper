# CLAUDE.md

Paper — personal essay/blog platform. Vue 3 + Vite frontend, Vercel-style serverless API, MongoDB (Mongoose), TipTap rich text. Editorial design: serif type, muted tones, subtle borders, restrained motion — preserve it.

## Commands

```bash
npm run typecheck && npm run lint && npm test   # validate after most changes
npx vitest run tests/api/post.test.ts           # single file; -t "pattern" by name
npm run build            # required when touching Vite config, deps, or deploy-sensitive code
npm run dev              # Vite frontend (proxies /api → :3001) — user runs this
npm run api:dev          # local API server on :3001 — user runs this
npm run mcp:stdio        # local MCP server; requires MCP_AUTHOR_ID
```

Verify with the typecheck/lint/test command above — that is the whole verification loop. Do not start dev servers, open the browser preview, or drive the app in a browser; `npm run dev` and `npm run api:dev` are for the user. When a change really needs eyes in a browser (auth/DB/cookie flows, visual polish), finish the code and tests, then say what the user should exercise.

Setup: `cp .env.example .env`; set `MONGODB_URI`, `JWT_SECRET` (≥ 32 chars, enforced). `INVITE_CODE` unset disables registration. `MCP_AUTHOR_ID` is required only for local MCP authoring. Keep `VITE_API_BASE=/api`.

## Layout

- `api/` — one function per route group (`auth`, `admin`, `content`, `metrics`, `shell`), each one line: `createDispatcher(<group>Routes)`. `mcp.ts` is the sole standalone fetch-handler exception and intentionally has no `allRoutes` or rewrite entry. Vercel Hobby caps 12 functions, hence grouping; only add a new group here.
- `server/routes/` — one thin route per file (method guard, auth gate, validation, shaping), default async `handler`. `index.ts` is the single route table read by both `server/dev.ts` and `api/`, so dev/prod can't drift.
- `server/lib/` — shared server logic (new reusable server code goes here, not `api/`).
- `server/mcp/` — shared MCP factory/tools; remote `/api/mcp` is public read-only (origin-checked, rate-limited), while local stdio alone registers authoring tools. Everything MCP writes stays a draft: `publish_essay` and the admin UI are the only ways content goes live.
- `src/` — Vue app; `admin/store.ts` is the auth store. `src/types/content.ts` = shared API payload types; update with any response-shape change.
- `tests/` — mirrors source tree; `tests/setup.ts` sets `JWT_SECRET` before modules load.
- `research/` — plan/audit docs (see `research-audit` skill). `design-anthropic-blog/design.html` is a typographic reference, not a page — nothing builds or serves it; `src/style.css` cites it for `--measure`. `vercel.json` — build/rewrites/headers. Never hand-edit `dist/`.

## API handler pattern

For route-table APIs, copy an existing file in `server/routes/`: new route = file here + line in `server/routes/index.ts` + rewrite in `vercel.json` (contract test enforces pairing). The standalone MCP fetch handler is the documented exception and must stay outside that route table.

## Security invariants

- Sanitize TipTap JSON via `sanitizePostContent` (posts) / `note-content` helpers (notes) before storing or returning; preserve safe-link/safe-image validation.
- Cookies only via `server/lib/auth.ts` helpers — never hand-rolled strings.
- Keep CSP/headers aligned between `server/lib/security.ts` and `vercel.json`.
- Never expose stack traces, raw JWT errors, or DB internals — return `Unauthorized`, `Not found`, `Request failed`.
- Keep `runValidators: true` on `findByIdAndUpdate`; preserve duplicate-slug handling in post routes.

## Code style

- 2-space indent, single quotes, no semicolons, trailing commas multiline. ESM; `api/`/`server/` local imports keep `.js` suffix, frontend omits extensions; relative imports only, no aliases.
- `import type` for types; explicit return types on exports; `unknown` in catch, then narrow.
- Vue: `<script setup lang="ts">`, scoped styles, fetch in `onMounted`, loading/saving/error refs up top. Use `apiFetch` from `src/admin/store.ts` for auth-aware requests (owns the admin 401 redirect).
- CSS: reuse design tokens in `src/style.css`; favor borders/spacing/opacity/text-decoration over flashy effects. Tailwind v4 installed but not dominant — prefer semantic classes + CSS variables.
- Naming: PascalCase components/types, camelCase functions/refs, `UPPER_SNAKE_CASE` constants, kebab-case route names.

## Working here

- Small, convention-following changes over rewrites.
- Response shape → update `src/types/content.ts`. Auth → check `src/admin/store.ts`, login/register routes, cookie helpers together. Content rules → check admin editing and public rendering.
- Use project skills in `.claude/skills/` when a task matches: `fullstack-feature`, `design-polish`, `security-audit`, `research-audit`, `commit-and-ship`.
