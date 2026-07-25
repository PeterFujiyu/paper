# CLAUDE.md

Paper — a personal essay/blog platform. Vue 3 + Vite frontend, Vercel-style serverless API backed by MongoDB (Mongoose), TipTap rich text. The design is editorial: serif typography, muted tones, subtle borders, restrained motion — preserve that look.

## Commands

```bash
npm run dev              # Vite frontend (proxies /api → local API server on :3001)
npm run api:dev          # local API server (serves server/routes/ directly on :3001)
npm run typecheck        # vue-tsc --noEmit
npm run lint             # eslint (flat config)
npm test                 # vitest, all tests once
npx vitest run tests/api/post.test.ts    # single file
npx vitest run -t "pattern"              # by test name
npm run build            # production build
npm run backfill:search  # backfill search fields (server/scripts)
```

Validation after most changes: `npm run typecheck && npm run lint && npm test`. Add `npm run build` when touching Vite config, deps, or deploy-sensitive code. For auth, DB, or cookie changes, also run both dev servers and exercise a real login/logout flow.

Setup: `cp .env.example .env`, set `MONGODB_URI` and `JWT_SECRET` (≥ 32 chars, enforced). `INVITE_CODE` unset disables registration. Keep `VITE_API_BASE=/api`.

## Layout

- `api/` — exactly four serverless functions (`auth`, `admin`, `content`, `metrics`), each a one-line `createDispatcher(<group>Routes)`. Vercel's Hobby plan caps a deployment at 12 functions, so routes are grouped rather than given a file each. Add a route here only by adding a new group.
- `server/routes/` — one route per file, each exporting a default async `handler`. Keep these thin: method guard, auth gate, validation, response shaping. `server/routes/index.ts` is the single route table; `server/dev.ts` and the `api/` dispatchers both read it, so dev and prod cannot drift.
- `server/lib/` — shared server logic; new reusable server code goes here, not in `api/`:
  - `logger.ts` — `beginRequest`/`finishRequest`/`sendJson`/`readBody`/`getQueryParam`/`logError`
  - `vercel-auth.ts` — `requireAuth`; `auth.ts` — JWT + cookie helpers
  - `validation.ts` — input validation + `sanitizePostContent`; `note-content.ts`, `content-text.ts` — content sanitizers
  - `security.ts` — security headers/CSP; `db.ts` — `connectDB`
  - `dispatch.ts` — `createDispatcher`/`resolveRouteName`; folds a route group behind one function
  - `auth-throttle.ts`, `metric-throttle.ts`, `hcaptcha.ts`, `post-metrics.ts`, `regex.ts`
- `server/models/` — Mongoose schemas: `Post`, `Note`, `User`, `AuthThrottle`, `MetricThrottle`.
- `src/` — Vue app: `views/`, `components/`, `admin/` (incl. `store.ts` auth store), `router/`, `shared/`, `types/`.
- `src/types/content.ts` — shared API payload types; update alongside any response-shape change.
- `tests/` — mirrors the source tree (`tests/api/`, `tests/server/lib/`, `tests/src/`); `tests/setup.ts` sets `JWT_SECRET` before modules load. New tests follow the same mirroring.
- `research/` — plan/audit documents (see the `research-audit` skill).
- `vercel.json` — build, rewrites, security headers. `dist/` is generated; never hand-edit.

## API handler pattern

Every handler in `server/routes/` follows this shape — keep it. Adding a route means adding a file here plus one line in `server/routes/index.ts` and one rewrite in `vercel.json` (a contract test enforces the pairing):

```ts
export default async function handler(req, res) {
  const meta = beginRequest(req)
  try {
    // 1. method guard → early return
    // 2. requireAuth(req, res) for protected routes; stop if it returns null
    // 3. readBody<T>(req) / getQueryParam(req, key)
    // 4. normalize + validate inputs before any DB write
    await connectDB()
    // .lean() for read-only queries, .select(...) to limit fields
    sendJson(res, 200, payload) // always sendJson — it applies security headers + request id
  } catch (err) {
    logError('route-name', err)
    sendJson(res, 500, { error: 'Request failed' })
  } finally {
    finishRequest(req, res, meta)
  }
}
```

## Security invariants

- Sanitize TipTap JSON through `sanitizePostContent` (posts) or the `note-content` helpers (notes) before storing or returning rich text; preserve safe-link and safe-image validation.
- Cookies only via helpers in `server/lib/auth.ts` — never hand-rolled cookie strings.
- CSP and headers must stay aligned between `server/lib/security.ts` and `vercel.json`.
- Never expose stack traces, raw JWT errors, or DB internals to clients — return `Unauthorized`, `Not found`, `Request failed`.
- Keep `runValidators: true` on `findByIdAndUpdate` paths; preserve duplicate-slug handling in post routes.

## Code style

- 2-space indent, single quotes, no semicolons, trailing commas in multiline structures.
- ESM everywhere. `api/` and `server/` local imports keep `.js` suffixes; frontend imports omit extensions. No path aliases — relative imports only.
- `import type` for type-only imports; explicit return types on exported functions; `unknown` in catch blocks, then narrow.
- Vue: `<script setup lang="ts">`, scoped styles by default, initial data fetch in `onMounted`, loading/saving/error refs near the top. Reuse `apiFetch` from `src/admin/store.ts` for auth-aware requests — it owns the admin 401 redirect.
- CSS: design tokens live in `src/style.css` — reuse existing variables before adding new ones. Favor borders, spacing, opacity, and text-decoration shifts over flashy effects. Tailwind v4 is installed but is not the dominant style system; prefer semantic classes and CSS variables.
- Naming: PascalCase components/types, camelCase functions/refs, `UPPER_SNAKE_CASE` constants, kebab-case route names.

## Working here

- Prefer small, convention-following changes over broad rewrites; the repo is compact and idiomatic.
- Response shape changed → update `src/types/content.ts`. Auth behavior changed → inspect `src/admin/store.ts`, login/register routes, and cookie helpers together. Content rules changed → check both admin editing and public rendering.
- Project skills in `.claude/skills/` cover the recurring workflows — `fullstack-feature` (end-to-end features through all layers), `design-polish` (visual tweaks in the house style), `security-audit`, `research-audit` (reconcile `research/` plans with code), `commit-and-ship` — use them when a task matches.
