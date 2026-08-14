# 2. Where an MCP endpoint fits in this repo

Verified against the working tree at `c2fc0c2` (2026-08-13).

---

## 2.1 What already exists

| Fact | Evidence |
|---|---|
| 5 serverless functions, one per file in `api/`, each a one-line dispatcher | `api/auth.ts`, `admin.ts`, `content.ts`, `metrics.ts`, `shell.ts` |
| Grouping exists only to stay under Vercel Hobby's 12-function cap | `server/routes/index.ts:24` |
| 18 route handlers share one table read by both dev and prod | `server/routes/index.ts:63` (`allRoutes`), `server/dev.ts:9` |
| Handlers take a normalised `(ApiRequest, ApiResponse)`, **not** Node's `IncomingMessage`/`ServerResponse` | `server/lib/logger.ts:11` |
| `ApiResponse` can only `json()` or `send()` a complete body — no `write`, no streaming | `server/lib/logger.ts:11-19` |
| A contract test asserts every name in `allRoutes` has a matching `vercel.json` rewrite onto its own group | `tests/server/lib/dispatch.test.ts:100` |
| Public reads are CDN-cached for 60 s; auth-gated reads must stay `no-store` | `server/lib/cache.ts` |
| Auth is a JWT in an `HttpOnly; SameSite=Strict` cookie, or a bearer header; revocable via `tokenVersion` | `server/lib/auth.ts:18,81`, `server/lib/vercel-auth.ts:11` |
| Essay bodies are TipTap JSON, sanitised on the way in **and** on the way out | `server/routes/post.ts:47`, `server/lib/validation.ts:216` |
| Full-text body lives in `contentText`, `select: false`, searched by escaped literal regex | `server/models/Post.ts:16-19`, `server/routes/posts.ts:44-58` |
| `hono` and `@hono/node-server` are dependencies but imported nowhere | `package.json:25,34`; `grep -rn "from 'hono"` → lockfile only |

Budget: **5 of 12 functions used.** An MCP endpoint costs one, leaving six.

## 2.2 Four constraints the design must respect

### (a) The MCP endpoint cannot be an ordinary route

`RouteHandler` is `(ApiRequest, ApiResponse) => Promise<void>` (`server/routes/index.ts`), and
`ApiResponse` has no `write`. An MCP handler wants a web-standard `Request` in and a `Response`
out. Forcing it through the dispatcher would mean re-serialising a body that has already been
parsed, and would close the door on SSE responses forever.

It also cannot join `allRoutes` without a rewrite: the contract test at
`tests/server/lib/dispatch.test.ts:100` iterates every name in that table and requires
`/api/<name>` → `/api/<group>?route=<name>` in `vercel.json`.

**Conclusion:** `api/mcp.ts` is a standalone sixth function, outside `allRoutes` and outside
`createDispatcher`. Vercel routes `/api/mcp` to it by filename; the SPA catch-all rewrite
already excludes `/api` (`vercel.json`: `"/((?!api(?:/|$)).*)"`), so no rewrite entry is
needed and the contract test is unaffected. Worth adding a test that pins that intent, so a
future reader does not "fix" the apparent omission.

### (b) The request body must not be pre-parsed

The SDK reads the request itself. Two places would steal it:

- **Vercel's `(req, res)` signature** hands you `req.body` already parsed. Avoid by exporting a
  **fetch web handler** instead — `export default { fetch: … }` — which Vercel's Node runtime
  supports and which hands over an untouched `Request`.
- **`server/dev.ts:25-35`** drains the stream into `rawBody` before dispatching. The dev mount
  for `/api/mcp` must therefore be checked *before* that loop.

### (c) Security invariants carry over unchanged

From `CLAUDE.md`, plus two that are specific to this endpoint:

1. **Never authenticate `/api/mcp` from the `pf_admin_session` cookie.** Cookie auth on a
   non-browser endpoint is a cross-site request forgery surface; the cookie is `SameSite=Strict`
   today and this endpoint must not weaken that. Bearer only, or no auth at all.
2. **Validate `Origin`** and answer `403` when present and invalid — required by the transport
   spec, and the reason (1) is written down.
3. **Only published content leaves the server.** `published: true` filters, and never `author`,
   never a user email, never `readingMinutesOverride` (admin-only today).
4. **Sanitise essay bodies** through `sanitizePostContent` before returning them, exactly as
   `server/routes/post.ts:47` does — or sidestep it by returning `extractPlainText(...)`
   output, which is what a language model wants anyway.
5. **No stack traces, no Mongo errors** in tool results — the same `Request failed` discipline.
6. **Bound the search tool** the way `server/routes/posts.ts` bounds `/api/posts?q=` — 100-char
   cap, `escapeRegExp`, `limit(20)` — since MCP clients can call it in a loop.

### (d) Read logic should be shared, not duplicated

`server/routes/posts.ts` and `post.ts` hold their query shaping inline: field projection,
`withPostMetrics`, the search regex, the duplicate-slug handling. An MCP tool needs the same
queries with a different envelope. Copying them creates exactly the drift `server/routes/index.ts`
was built to prevent.

The small, convention-following move is a new `server/lib/content-queries.ts` exporting
`listPublishedPosts`, `findPublishedPost`, `searchPublishedPosts` (and note/brew equivalents as
needed), consumed by both the HTTP routes and the MCP tools. It is a pure extraction — no
behaviour change — and it belongs in `server/lib/` per the layout rules.

## 2.3 The two useful shapes

| | **A. Remote read-only** (`/api/mcp`) | **B. Local stdio authoring** |
|---|---|---|
| Who connects | Anyone — Claude, other agents, the author | The author only, on their machine |
| Transport | Streamable HTTP, one POST endpoint | stdio (`serveStdio`) |
| Auth | None needed; content is already public | Process-local; DB creds from `.env` |
| Reads | essays, notes, brews, search | same |
| Writes | none | draft / update / publish, add note, log brew |
| Cost | 1 function, ~1 day | ~half a day, no deploy surface |
| Risk | Public tool surface; needs rate discipline | None beyond the author's own machine |

They compose: both build the same `McpServer` from the same tool modules, and differ only in
which tools they register and how they are served. That is the plan in §03.

A third shape — **authenticated writes over the public endpoint** — is possible but is a
different order of work (OAuth resource-server plumbing, or a non-standard shared secret
guarding `delete_essay`). Deferred, with requirements written out in §03 Stage 3.
