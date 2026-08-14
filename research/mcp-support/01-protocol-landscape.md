# 1. The protocol landscape, August 2026

Everything below was verified against the specification and the npm registry on 2026-08-13.
This matters more than usual: the protocol changed shape sixteen days before this document was
written, and most existing MCP tutorials describe the older, session-based transport.

---

## 1.1 The `2026-07-28` revision made MCP stateless

The current revision is **`2026-07-28`**, the largest since launch. The changes that decide
this project's design:

| Change | Consequence for Paper |
|---|---|
| **Protocol-level sessions removed** — no `Mcp-Session-Id`, no `DELETE` teardown | No session store. A serverless function can serve every request cold. This is the change that makes the whole idea cheap. |
| **`initialize` / `notifications/initialized` handshake removed** — each request carries `io.modelcontextprotocol/protocolVersion`, `clientInfo`, `clientCapabilities` in `_meta` | Each POST is self-contained, like every other route in `api/`. |
| **GET stream endpoint removed**; `resources/subscribe` replaced by `subscriptions/listen` | Nothing to implement — Paper has no server-initiated notifications to push. A GET to the endpoint should answer `405`. |
| **SSE resumability removed** (`Last-Event-ID`, event IDs) | No replay buffer to hold. |
| **`server/discover` is mandatory** — advertises supported versions, capabilities, identity | Handled by the SDK; not hand-written. |
| **Required request headers** `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` (for `tools/call`, `resources/read`, `prompts/get`) | Servers **MUST** reject header/body mismatches with `400` + JSON-RPC `-32020`. The SDK enforces this; our tests should exercise it. |
| **`ttlMs` + `cacheScope` required** on `tools/list`, `resources/list`, `resources/read`, `prompts/list` results (`CacheableResult`) | Maps onto the existing 60 s public-read window in `server/lib/cache.ts`. |
| **Roots, Sampling, Logging deprecated**; tasks moved to an extension | Do not implement any of them. |
| Server-to-client requests replaced by **Multi Round-Trip Requests** (`InputRequiredResult`) | Not needed — Paper's tools need nothing from the client mid-call. |

Transport requirements a Paper endpoint must meet
([source](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)):

- **One** HTTP endpoint accepting `POST`. One JSON-RPC request or notification per POST.
- Answer a request with **either** `application/json` (a single object) **or**
  `text/event-stream`. Plain JSON is fully conforming — no streaming required.
- Answer an accepted notification with `202 Accepted` and no body.
- **Validate `Origin`**; respond `403` when present and invalid (DNS-rebinding defence).
- Unknown method → `404` with JSON-RPC `-32601`. Legacy `GET`/`DELETE` → `405`.
- Unsupported protocol version → `400` with `UnsupportedProtocolVersionError`.

## 1.2 The SDK: v2, three weeks old

`@modelcontextprotocol/sdk@1.30.0` (2026-07-27) is the *old* line. The `2026-07-28` spec is
implemented by **v2, split into scoped packages**:

| Package | Latest | Depends on | Role |
|---|---|---|---|
| `@modelcontextprotocol/server` | `2.0.0` (2026-07-27) | `zod ^4.2.0`, `@modelcontextprotocol/core` | `McpServer`, `createMcpHandler`, `serveStdio`, `requireBearerAuth` |
| `@modelcontextprotocol/client` | `2.0.0` | `jose`, `pkce-challenge`, `eventsource`… | Client side — not needed here |
| `@modelcontextprotocol/node` | `2.0.0` | `@hono/node-server`; peers `hono ^4.11.4`, `server ^2.0.0` | `toNodeHandler`, `localhostHostValidation`, `localhostOriginValidation` |
| `@modelcontextprotocol/hono`, `/express`, `/fastify` | `2.0.0` | peer on their framework | "intentionally thin adapters" |

All require Node `>=20`; this repo pins `>=24` (`package.json`), so that is satisfied.

Note the coincidence: `hono@4.12.5` and `@hono/node-server@1.19.11` are already direct
dependencies of this project — installed in the initial commit `c637d54` and, as of today,
**imported nowhere** (`grep -rn "from 'hono"` finds only `package.json` / lockfile). If the
Node adapter route is taken, its peer dependency is already satisfied. If the web-standard
route is taken (recommended — §03), neither is needed and those two entries remain dead weight
worth removing separately.

### The server API, as documented

```ts
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'paper', version: '1.0.0' })
  server.registerTool(
    'get_essay',
    { description: '…', inputSchema: z.object({ slug: z.string() }) },
    async ({ slug }, ctx) => ({ content: [{ type: 'text', text: '…' }] }),
  )
  return server
})
```

- `createMcpHandler` takes a **factory** — a fresh `McpServer` is built per request, with no
  shared state between calls. That is precisely the serverless execution model.
- It returns `{ fetch, close, notify, bus }`. `handler.fetch(request, { authInfo })` is a
  web-standard fetch handler.
- `{ responseMode: 'json' }` disables streaming; `'sse'` forces it.
- `inputSchema` is a Zod v4 schema; the SDK derives JSON Schema from it and rejects invalid
  arguments before the handler runs, preserving `.describe()` text for the model.
- The handler's second argument carries `ctx.http.authInfo` — whatever a bearer verifier
  returned.
- Web-standard runtimes get **no** automatic `Host`/`Origin` validation; the SDK exports
  `hostHeaderValidationResponse` and `originValidationResponse` to do it explicitly.

## 1.3 Authorization, as the spec now defines it

A server that authenticates over HTTP is an **OAuth 2.0/2.1 resource server**: verify access
tokens, answer bad ones with `401` + `WWW-Authenticate: Bearer` carrying a `resource_metadata`
pointer to RFC 9728 protected-resource metadata, which the client follows to find the
authorization server. `2026-07-28` additionally requires `iss` validation (RFC 9207) and
deprecates Dynamic Client Registration in favour of Client ID Metadata Documents.

The SDK's `requireBearerAuth` accepts any `verifyAccessToken(token) => AuthInfo`, so local JWT
verification is permitted mechanically — but discovery is what generic clients rely on, and
Paper has no authorization server to point them at. See §03 Stage 3.

A **read-only public server needs none of this.** Everything it serves is already on the open
web at `/api/posts`.

## 1.4 Deployment options on Vercel

Two paths, both current:

1. **Official SDK v2 directly.** Vercel's Node runtime supports fetch web handlers
   (`export default { async fetch(request: Request) {…} }`), so `handler.fetch` mounts with no
   adapter. Fewest moving parts; recommended.
2. **`vercel/mcp-handler` 2.x.** Adds native `2026-07-28` support on SDK v2 *plus* a stateless
   compatibility layer for 2025-era Streamable HTTP clients, with no Redis. Worth taking only
   if compatibility with older clients turns out to matter (§03 risks). Its `maxDuration`
   option is now a deprecated no-op.

Client-side, connecting is one command — `claude mcp add --transport http paper
https://<host>/api/mcp` — or "Add custom connector" in the Claude web UI. A server with no
auth needs no OAuth fields.
