# 3. Implementation plan

Staged so each stage ships and validates on its own. Stage 1 is the recommended starting
point; Stage 2 is where the author actually gains something day to day; Stage 3 is optional
and deliberately last.

---

## Stage 0 — Decide the surface (no code)

One question decides the rest: **should an agent be able to write to the blog, and from where?**

- *Read-only, public* → Stage 1 alone.
- *Read anywhere, write from my laptop* → Stages 1 + 2. **Recommended.**
- *Write from anywhere, including hosted agents* → Stages 1 + 2 + 3.

---

## Stage 1 — Read-only remote server at `/api/mcp`

### Dependencies

```bash
npm install @modelcontextprotocol/server@^2.0.0 zod@^4.2.0
```

`zod` is new to this project — validation today is hand-rolled in `server/lib/validation.ts`,
and that stays as it is. Zod enters only because `registerTool` derives its JSON Schema from
it. `@modelcontextprotocol/node` is **not** needed on the web-handler path (see below), which
also means `hono`/`@hono/node-server` stay unused.

### Files

| File | Change |
|---|---|
| `server/lib/content-queries.ts` | **new** — pure extraction of the published-content queries from `server/routes/posts.ts` / `post.ts` / `notes.ts` / `brews.ts` |
| `server/routes/posts.ts`, `post.ts`, … | edit to call the extracted queries; no behaviour change |
| `server/mcp/tools.ts` | **new** — tool registrations, one `registerTool` per capability |
| `server/mcp/server.ts` | **new** — `createPaperMcpServer()` factory + `createMcpHandler` wiring |
| `api/mcp.ts` | **new** — Vercel fetch web handler, sixth function |
| `server/dev.ts` | edit — mount `/api/mcp` before the body-draining loop |
| `tests/server/mcp/*.test.ts` | **new** — tool behaviour + transport conformance |
| `CLAUDE.md`, `README.md` | document the endpoint and how to connect |

### The endpoint

```ts
// api/mcp.ts
import { paperMcpHandler } from '../server/mcp/server.js'

export default { fetch: paperMcpHandler.fetch }
```

```ts
// server/mcp/server.ts (sketch — verify names against the installed SDK)
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { registerReadTools } from './tools.js'

export function createPaperMcpServer(): McpServer {
  const server = new McpServer({ name: 'paper', version: '1.0.0' })
  registerReadTools(server)
  return server
}

// responseMode 'json' keeps every answer a single JSON object: no long-lived
// connection on a serverless function, and nothing for a CDN to buffer.
export const paperMcpHandler = createMcpHandler(createPaperMcpServer, { responseMode: 'json' })
```

Notes:

- `createMcpHandler` takes a **factory**; a fresh server per request is the documented
  stateless model and matches how `connectDB()` is already re-entered per invocation.
- Origin validation is **not** automatic on the fetch path — call the SDK's
  `originValidationResponse` helper (or a small allow-list) before delegating, and return `403`
  on a present-and-invalid `Origin`, per the transport spec.
- `GET`/`DELETE` on the endpoint should answer `405`; unknown methods `404` + `-32601`. Confirm
  the SDK does this before writing your own.
- `server/discover`, the `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name` header validation
  and `-32020` mismatches are the SDK's job — the tests below verify it, they don't reimplement it.

### Dev wiring

```ts
// server/dev.ts — before `let rawBody = ''`
if ((req.url ?? '').split('?')[0] === '/api/mcp') {
  await paperMcpNodeHandler(req, res)   // or convert IncomingMessage → Request
  return
}
```

The stream must reach the SDK untouched. Either pull in `@modelcontextprotocol/node`'s
`toNodeHandler` for dev only, or build a `Request` from the raw body by hand. Prefer the
latter if it stays under ~20 lines — it keeps the dependency list honest.

### Tool surface

Read-only, `readOnlyHint: true`, `ttlMs` matching the 60 s window already used by
`PUBLIC_READ_CACHE_CONTROL` (`server/lib/cache.ts`), `cacheScope: 'public'`:

| Tool | Arguments | Returns |
|---|---|---|
| `list_essays` | `tag?`, `limit?` (≤ 50) | published summaries: slug, title, excerpt, tags, reading minutes, date |
| `search_essays` | `q` (≤ 100 chars), `limit?` | same shape; escaped literal regex over title/excerpt/tags/`contentText` |
| `get_essay` | `slug` | metadata + **plain text** body via `extractPlainText`, not raw TipTap JSON |
| `list_notes` | `limit?` | recent notes as plain text |
| `list_brews` | `limit?` | recent brews + shelf totals |

Plus a resource template `paper://essay/{slug}` over the same query, so clients that prefer
resources to tools can attach an essay directly. Prompts: skip for now — nothing to encode yet.

Two deliberate choices:

- **Plain text, not TipTap JSON.** Models read prose; JSON node trees waste context and would
  otherwise have to be re-sanitised on the way out. `contentText` is `select: false`, so the
  query must ask for it explicitly.
- **`published: true` in the query, not in a filter afterwards** — the same discipline as
  `server/routes/posts.ts`, so a draft cannot leak through a forgotten branch.

### Tests (`npm run typecheck && npm run lint && npm test`)

Mirror `tests/api/posts.test.ts`: `vi.hoisted` mocks for `connectDB` and the Mongoose models,
no database.

1. **Tool behaviour** — each tool returns the expected shape; `list_essays` never returns an
   unpublished post; `get_essay` on a missing slug returns `isError: true`, not a throw;
   `search_essays` truncates at 100 chars and escapes regex metacharacters (reuse the existing
   assertions for `/api/posts?q=`).
2. **Leak assertions** — serialise every tool result and assert it contains no `author`, no
   `contentText` on list results, no `readingMinutesOverride`, no `_id` of a user.
3. **Transport conformance**, through `handler.fetch` with a hand-built `Request`:
   - a well-formed `tools/call` POST with `MCP-Protocol-Version: 2026-07-28`, `Mcp-Method`,
     `Mcp-Name` succeeds;
   - a mismatched `Mcp-Name` is rejected `400` / `-32020`;
   - `GET` answers `405`;
   - an invalid `Origin` answers `403`.
4. **Function-count guard** — extend `tests/server/lib/dispatch.test.ts` with a case asserting
   `mcp` is intentionally absent from `allRoutes` and that `api/` holds ≤ 12 files.

### Deploy checklist

- `vercel.json` needs **no** rewrite; confirm the SPA catch-all still excludes it.
- `api/*.ts` already carries `"includeFiles": "server/**"`, so `server/mcp/**` ships.
- Function count 5 → 6 of 12.
- CSP is irrelevant to a non-browser client, but `applySecurityHeaders` is harmless and worth
  keeping for consistency; do **not** add `Cache-Control: public` to POST responses.

---

## Stage 2 — Local stdio server for authoring

A second entry point, same tool modules:

```ts
// server/mcp/stdio.ts
import 'dotenv/config'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createPaperMcpServer } from './server.js'
import { registerAuthoringTools } from './tools.js'

void serveStdio(() => {
  const server = createPaperMcpServer()
  registerAuthoringTools(server)   // create_draft, update_essay, publish_essay, add_note, log_brew
  return server
})
```

Run it with `npm run mcp:stdio` (`tsx server/mcp/stdio.ts`) and register it with
`claude mcp add paper -- npm run mcp:stdio`.

Rules for the authoring tools:

- Reuse `validatePostBody`, `normalizeSlug`, `normalizeTags`, `sanitizePostContent`,
  `extractPlainText`, `resolveReadingMinutes` — **the same functions the HTTP routes use**. An
  MCP write path that skips sanitisation would quietly become the way malformed content enters
  the database.
- Keep `runValidators: true` on updates and the duplicate-slug 409 behaviour, expressed as
  `isError: true` results.
- Mark them `readOnlyHint: false`; `publish_essay` and any delete get `destructiveHint: true`.
- Consider not shipping a delete tool at all. There is an admin UI for that.
- These tools talk to MongoDB directly with the author's `.env` credentials — no JWT involved,
  because there is no HTTP hop.

---

## Stage 3 — Authenticated writes over the public endpoint (deferred)

Only if hosted agents must publish. Requirements, so the decision is made with open eyes:

1. Paper becomes an **OAuth 2.0 resource server**: `401` + `WWW-Authenticate: Bearer` with a
   `resource_metadata` pointer, and an RFC 9728 protected-resource metadata document served
   from a well-known path (a seventh function, or a `vercel.json` rewrite onto an existing group).
2. An **authorization server** must exist. Paper has none — `server/lib/auth.ts` signs its own
   HS256 session tokens. Either adopt an external IdP or build authorize/token endpoints, PKCE,
   `iss` validation (RFC 9207), and Client ID Metadata Document support (DCR is deprecated as
   of `2026-07-28`).
3. `requireBearerAuth` + a `verifyAccessToken` returning `AuthInfo`; tools read
   `ctx.http.authInfo.scopes` and gate per tool.
4. Rate limiting on write tools, in the shape of `server/lib/auth-throttle.ts`.

**Non-standard shortcut, if it is ever taken:** a single `MCP_WRITE_TOKEN` compared in constant
time, no discovery. It works with clients that let you set a header, it is *not* spec-compliant
discovery, and it puts publish behind one shared secret with no revocation story beyond
rotating the env var. Write it down in `CLAUDE.md` if adopted.

---

## Risks and open questions

| Risk | Assessment |
|---|---|
| **SDK v2 is ~3 weeks old** (`2.0.0`, 2026-07-27) | API names in this document come from the docs site, not from reading the installed package. Verify `createMcpHandler`, `responseMode`, and the origin helpers against `node_modules` on the first day, and pin exact versions. |
| **Client support for `2026-07-28`** | The revision removes the handshake older clients expect. If a target client still speaks 2025-era Streamable HTTP, either accept modern-only or swap the wiring for `vercel/mcp-handler` 2.x, which serves both from one endpoint with no session store. |
| **Public tool surface invites abuse** | `search_essays` is a regex scan over `contentText`. Keep the 100-char cap and `limit(20)`, and consider a `MetricThrottle`-style guard if traffic ever justifies it. |
| **Function budget** | 6 of 12 after Stage 1; Stage 3's metadata document would make 7. Fine, but not unlimited. |
| **Drift between MCP tools and HTTP routes** | Mitigated by the `content-queries.ts` extraction. If that extraction is skipped, this risk becomes the main cost of the whole feature. |
| **Cold starts** | Each POST is a fresh function + `connectDB()`. Acceptable for tool calls; another reason `responseMode: 'json'` beats holding an SSE stream open. |

## Effort

| Stage | Estimate |
|---|---|
| 1 — read-only remote server, with extraction and tests | ~1 day |
| 2 — stdio authoring server | ~half a day |
| 3 — OAuth-protected writes | multiple days; revisit only with a concrete need |
