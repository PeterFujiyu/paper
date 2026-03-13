# AGENTS.md

## Purpose
- This file gives coding agents the repo-specific commands and conventions they need to work safely here.
- It is based on the current codebase state on 2026-03-13.
- If the repo adds new tooling or rules files later, update this document in the same change.

## Rule Files
- No `.cursor/rules/` directory was found.
- No `.cursorrules` file was found.
- No `.github/copilot-instructions.md` file was found.
- There are no external agent-rule files to merge into behavior right now.

## Project Snapshot
- Frontend: Vite 7 + Vue 3 + TypeScript in `src/`.
- Backend: Vercel-style serverless handlers in `api/`.
- Shared server code: `server/lib/` and `server/models/`.
- Database: MongoDB via Mongoose.
- Rich text: TipTap JSON content for post editing and rendering.
- Styling: custom CSS with CSS variables; Tailwind v4 is installed but not the dominant style system.

## Repository Map
- `src/` - client app, router, admin UI, shared client types.
- `api/` - serverless route entrypoints, each exporting a default async `handler`.
- `server/lib/` - auth, DB, validation, logging, and security helpers.
- `server/models/` - Mongoose schemas and model exports.
- `public/` - static assets.
- `dist/` - generated build output; do not hand-edit.
- `.env.example` - required local env vars and setup notes.
- `vercel.json` - build, rewrite, and security-header configuration.
- `design.html` - standalone file, currently unreferenced by the app.

## Local Setup
1. Install dependencies with `npm install`.
2. Copy env vars with `cp .env.example .env`.
3. Set `MONGODB_URI`.
4. Set `JWT_SECRET` to a long random value; server code enforces at least 32 chars.
5. Optionally set `INVITE_CODE`; leaving it unset disables registration.
6. Keep `VITE_API_BASE=/api` unless intentionally pointing the frontend elsewhere.

## Commands
- Frontend dev server: `npm run dev`
- Local API dev server: `npm run api:dev`
- Full local dev: run `npm run api:dev` and `npm run dev` in separate terminals.
- Type checking: `npm run typecheck`
- Production build: `npm run build`
- Preview built app: `npm run preview`
- Recommended validation after most code changes: `npm run typecheck && npm run build`

## Lint And Test Status
- There is no `lint` script in `package.json`.
- There is no ESLint, Prettier, Biome, or other lint config in the repo root.
- Unit tests run with Vitest; test files live under `tests/`.
- Recommended validation after most code changes: `npm run typecheck && npm run build && npm test`

## Test Commands
- Run all tests once: `npm test`
- Run in watch mode: `npm run test:watch`
- Run with coverage: `npm run test:coverage`
- Run a single test file: `npx vitest run tests/path/to/file.test.ts`
- Run tests matching a name pattern: `npx vitest run -t "pattern"`

## Test Layout
- `tests/setup.ts` — global setup; sets `JWT_SECRET` before any module loads.
- `tests/server/lib/validation.test.ts` — unit tests for all validation helpers.
- `tests/server/lib/auth.test.ts` — unit tests for JWT, cookie, and header helpers.
- `tests/src/store.test.ts` — unit tests for the admin auth store (`setAuth`, `apiFetch`, `loadSession`, `logout`).
- Add new test files under `tests/` mirroring the source tree structure.

## What To Run For Common Changes
- UI-only change: `npm run typecheck && npm run build`
- Router or shared TS change: `npm run typecheck && npm run build`
- API route or validation change: `npm run typecheck && npm run build`, then smoke test with `npm run api:dev`
- Auth, DB, or cookie change: run both local servers and exercise a real login/logout flow
- Deployment-sensitive change: re-check `vercel.json` assumptions and same-origin `/api` behavior

## Import Conventions
- Use ESM everywhere.
- Prefer external imports before local imports.
- In Node-side files, keep `node:` builtins grouped before project-local imports.
- Use `import type` or inline `type` specifiers for type-only imports.
- Frontend local imports usually omit extensions.
- `api/` and `server/` local imports should keep the existing `.js` suffixes in source files.
- Use relative imports; there are no path aliases configured.

## Formatting Conventions
- Use 2-space indentation.
- Use single quotes in TS and JS.
- Omit semicolons.
- Keep trailing commas in multiline objects, arrays, and call sites.
- Break dense props and objects across lines instead of packing them tightly.
- Match the touched file's style if it already uses alignment, banner comments, or compact guards.

## TypeScript Conventions
- `tsconfig.json` enables `strict` and `noImplicitAny`; keep new code compatible.
- Add explicit return types for exported functions and non-trivial helpers.
- Prefer `unknown` in `catch` blocks, then narrow.
- Avoid `any`; if unavoidable, isolate it to the smallest possible area.
- Use generics for API helpers, e.g. `apiFetch<PostSummary[]>`.
- Use explicit `ref<Type | null>` or `reactive<Type>` shapes when state is meaningful.
- Keep shared payload types in `src/types/content.ts` when both UI and API behavior depend on them.

## Naming Conventions
- Vue component and view filenames use PascalCase.
- Route names use lowercase kebab-case strings.
- Functions, refs, locals, and schema variables use camelCase.
- Interfaces and type aliases use PascalCase.
- Constants use `UPPER_SNAKE_CASE` for limits, regexes, TTLs, and fixed config values.
- Boolean state should read clearly, usually with `is`, `has`, `can`, or a state adjective.

## Vue And Frontend Patterns
- Use `<script setup lang="ts">` for Vue SFCs.
- Import `RouterLink`, `RouterView`, and router hooks explicitly where used.
- Fetch initial page data in `onMounted`.
- Keep loading, saving, and error refs near the top of the script.
- Prefer computed validation messages over scattered inline validation.
- Reuse `src/admin/store.ts` for auth-aware fetch logic instead of duplicating it.
- Default to `scoped` styles.
- Add global `<style>` blocks only when Teleport or rendered TipTap HTML truly needs them.
- Prefer semantic class names and CSS variables over large utility-class blobs.
- Preserve the editorial look: serif typography, muted tones, subtle borders, restrained motion.

## CSS Conventions
- Global design tokens live in `src/style.css`; reuse existing variables before adding new ones.
- Keep one declaration per line in longer rule blocks.
- Short hover and focus helpers can stay one-line if still readable.
- Use `clamp()` and CSS variables for typography and spacing when that matches nearby code.
- Favor borders, text-decoration, spacing, and opacity shifts over flashy effects.

## API Route Pattern
- Start each handler with `const meta = beginRequest(req)`.
- Wrap logic in `try/catch/finally`.
- Always call `finishRequest(req, res, meta)` in `finally`.
- Guard unsupported HTTP methods early and return immediately.
- Use `sendJson` so security headers and request IDs stay consistent.
- Use `requireAuth` for protected routes and stop if it returns `null`.
- Use `readBody<T>(req)` for JSON bodies.
- Use `getQueryParam(req, key)` for query strings.
- Normalize and validate inputs before database writes.

## Database And Model Conventions
- Call `await connectDB()` inside API handlers before DB work.
- Use `.lean()` for read-only queries.
- Use `.select(...)` to limit returned fields.
- Preserve duplicate-slug handling when touching post routes.
- Keep `runValidators: true` on update paths that use `findByIdAndUpdate`.
- Keep schema hooks small; route-level validation lives in helpers under `server/lib/validation.ts`.

## Validation And Security Rules
- Normalize slugs and emails with trimming and lowercase where appropriate.
- Sanitize TipTap JSON through `sanitizePostContent` before storing or returning rich text.
- Preserve safe-link and safe-image validation behavior.
- Use auth cookie helpers from `server/lib/auth.ts`; do not hand-roll cookie strings.
- Keep CSP and related headers aligned with `server/lib/security.ts` and `vercel.json`.
- Do not expose stack traces, raw JWT errors, or DB internals to clients.

## Error Handling Conventions
- Prefer early returns over deep nesting.
- Return user-safe messages like `Unauthorized`, `Not found`, or `Request failed`.
- Log server exceptions with `logError(...)`.
- In frontend async flows, clear loading and saving flags in `finally`.
- Convert unknown caught values to displayable strings via small helpers like `getErrorMessage`.
- Let `apiFetch` own the admin 401 redirect behavior instead of duplicating that logic.

## Change Strategy For Agents
- Put reusable server logic in `server/lib/` rather than duplicating it across `api/` files.
- Keep `api/` files focused on HTTP method routing, auth gates, and response shaping.
- When a response shape changes, update the matching client types in `src/types/content.ts`.
- When auth behavior changes, inspect `src/admin/store.ts`, login/register routes, and cookie helpers together.
- When post content rules change, inspect both admin editing and public rendering code.
- Prefer small, consistent changes over broad rewrites; this repo is compact and convention-driven.
