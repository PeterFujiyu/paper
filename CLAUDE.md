# CLAUDE.md

Paper — personal essay/blog platform. Vue 3 + Vite frontend, Vercel-style serverless API, MongoDB (Mongoose), TipTap rich text. Editorial design: serif type, muted tones, subtle borders, restrained motion — preserve it.

## Commands

```bash
npm run dev              # Vite frontend (proxies /api → :3001)
npm run api:dev          # local API server on :3001
npm run typecheck && npm run lint && npm test   # validate after most changes
npx vitest run tests/api/post.test.ts           # single file; -t "pattern" by name
npm run build            # required when touching Vite config, deps, or deploy-sensitive code
npm run backfill:search  # backfill search fields
```

For auth/DB/cookie changes, also run both dev servers and exercise a real login/logout.

Setup: `cp .env.example .env`; set `MONGODB_URI`, `JWT_SECRET` (≥ 32 chars, enforced). `INVITE_CODE` unset disables registration. Keep `VITE_API_BASE=/api`.

## Layout

- `api/` — exactly four functions (`auth`, `admin`, `content`, `metrics`), each one line: `createDispatcher(<group>Routes)`. Vercel Hobby caps 12 functions, hence grouping; only add a new group here.
- `server/routes/` — one thin route per file (method guard, auth gate, validation, shaping), default async `handler`. `index.ts` is the single route table read by both `server/dev.ts` and `api/`, so dev/prod can't drift.
- `server/lib/` — shared server logic (new reusable server code goes here, not `api/`): `logger.ts` (`beginRequest`/`finishRequest`/`sendJson`/`readBody`/`getQueryParam`/`logError`), `vercel-auth.ts` (`requireAuth`), `auth.ts` (JWT + cookies), `validation.ts` (+ `sanitizePostContent`), `note-content.ts`/`content-text.ts`, `security.ts` (headers/CSP), `db.ts` (`connectDB`), `dispatch.ts`, throttles, `hcaptcha.ts`, `post-metrics.ts`, `regex.ts`.
- `server/models/` — `Post`, `Note`, `User`, `AuthThrottle`, `MetricThrottle`.
- `src/` — Vue app: `views/`, `components/`, `admin/` (`store.ts` auth store), `router/`, `shared/`, `types/`. `src/types/content.ts` = shared API payload types; update with any response-shape change.
- `tests/` — mirrors source tree; `tests/setup.ts` sets `JWT_SECRET` before modules load.
- `research/` — plan/audit docs (see `research-audit` skill). `vercel.json` — build/rewrites/headers. Never hand-edit `dist/`.

## API handler pattern

Keep this shape. New route = file here + line in `server/routes/index.ts` + rewrite in `vercel.json` (contract test enforces pairing):

```ts
export default async function handler(req, res) {
  const meta = beginRequest(req)
  try {
    // method guard → early return; requireAuth (stop on null); readBody/getQueryParam;
    // normalize + validate before any DB write
    await connectDB()
    // .lean() for reads, .select(...) to limit fields
    sendJson(res, 200, payload) // always sendJson — security headers + request id
  } catch (err) {
    logError('route-name', err)
    sendJson(res, 500, { error: 'Request failed' })
  } finally {
    finishRequest(req, res, meta)
  }
}
```

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
