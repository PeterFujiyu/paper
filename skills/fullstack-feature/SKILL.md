---
name: fullstack-feature
description: Build a feature end-to-end through this repo's layers — Mongoose model, validation helpers, serverless API handler, shared types, Vue UI, and tests. Use when a request spans backend and frontend ("add search", "add a notes section", "add cover images and tags").
---

# Full-stack feature

Implement a feature as one thin slice through every layer, following the patterns already in the repo (see `AGENTS.md` for the full conventions). Examples of past slices: full-essay search, admin-authored notes with public display, cover images & tags, post metrics.

## Layer order

Work bottom-up so each layer has something real to call:

1. **Model** — `server/models/`: Mongoose schema, camelCase fields, small hooks only. Route-level validation does NOT live here.
2. **Validation** — `server/lib/validation.ts`: add/extend helpers; normalize (trim, lowercase slugs/emails) before validating. Rich text goes through `sanitizePostContent` before storing or returning.
3. **API handler** — one file per route in `api/`, default-exporting an async `handler` that follows the house pattern:
   ```ts
   const meta = beginRequest(req)
   try {
     // guard unsupported methods early, return immediately
     // const user = await requireAuth(req, res); if (!user) return   ← protected routes
     await connectDB()
     // readBody<T>(req) for JSON, getQueryParam(req, key) for queries
     // validate + normalize BEFORE any DB write
     // reads: .lean() + .select(...); updates: { runValidators: true }
     sendJson(res, 200, payload)
   } catch (err) {
     logError('route-name', err)
     sendJson(res, 500, { error: 'Request failed' })
   } finally {
     finishRequest(req, res, meta)
   }
   ```
   User-safe errors only (`Unauthorized`, `Not found`, `Request failed`) — never stack traces, JWT errors, or DB internals.
4. **Shared types** — `src/types/content.ts` when both UI and API depend on the payload shape.
5. **Client** — Vue 3 SFC with `<script setup lang="ts">`. Admin CRUD goes in `src/admin/` (auth-gated via `apiFetch` from `src/admin/store.ts`, which owns the 401 redirect); public read-only views go in `src/views/`. Fetch initial data in `onMounted`; keep `loading`/`saving`/`error` refs at the top; clear flags in `finally`. Follow the `design-polish` skill for anything visible.
6. **Tests** — Vitest files under `tests/` mirroring the source tree (`tests/server/lib/…`, `tests/src/…`). Validation and auth changes always get unit tests.

## Repo specifics worth remembering

- ESM everywhere; `api/` and `server/` local imports keep `.js` suffixes, frontend imports omit extensions; no path aliases.
- Strict TypeScript: explicit return types on exported functions, `unknown` in catch blocks, no `any`.
- Registration/admin features are invite-gated (`INVITE_CODE`) and rate-limited — mirror those guards for new sensitive endpoints.
- Deployment target is Vercel serverless: no long-lived state in handlers; check `vercel.json` rewrites/headers if routing changes.
- Rich-text features reuse the existing TipTap editor setup (StarterKit + link/image/table/underline/typography extensions) rather than adding a new editor.

## Verify

- `npm run typecheck && npm run build && npm test`
- Smoke-test API routes with `npm run api:dev` alongside `npm run dev`.
- Auth/cookie/DB changes: exercise a real login → action → logout flow locally.
