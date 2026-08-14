# Adding MCP support to Paper

Status: **research only — no files modified, no dependencies installed**
Date: 2026-08-13
Question: what would it take to give Paper a Model Context Protocol server?

---

## The short version

Expose Paper's **public content as a read-only remote MCP server at `/api/mcp`** — one new
Vercel function, no session store, no new database collections. Keep **authoring (create /
edit / publish) on a local stdio server** the author runs on their own machine, so the write
path never becomes a public endpoint.

Two facts make this cheap, and both post-date most MCP advice you will find:

1. **MCP `2026-07-28` is stateless.** The `initialize` handshake, `Mcp-Session-Id`, the GET
   SSE stream and stream resumability are all gone. A conforming server is now *one POST
   endpoint that may answer with plain JSON* — which is exactly the shape of every function
   already in `api/`. The Redis-session workarounds that older "MCP on Vercel" posts describe
   no longer apply.
2. **The TypeScript SDK v2 is published** (`@modelcontextprotocol/server@2.0.0`, 2026-07-27)
   and exposes a web-standard `handler.fetch(request)`. Vercel's Node runtime accepts a fetch
   web handler, so `api/mcp.ts` can be ~5 lines of wiring.

Cost: one of the 12 Hobby functions (5 in use today), two new dependencies plus `zod`, and
about a day for the read-only server including tests.

## What is *not* recommended

Publishing or deleting essays over the **public** MCP endpoint. The spec's HTTP auth story is
OAuth 2.1 resource-server + RFC 9728 discovery; Paper's auth is a JWT in an `HttpOnly` cookie
(`server/lib/auth.ts:18`) with no authorization server behind it. Bridging that gap is real
work for one author's convenience, and a static bearer token would put `delete_essay` behind a
shared secret. Stage 3 in the plan covers it if the answer changes.

## Documents

| File | Contents |
|---|---|
| [`01-protocol-landscape.md`](01-protocol-landscape.md) | What MCP looks like in August 2026: the `2026-07-28` revision, SDK v2 packages, what changed and why it matters here |
| [`02-fit-with-this-codebase.md`](02-fit-with-this-codebase.md) | Where an MCP endpoint lands in this repo, with the constraints it must respect (dispatcher table, contract test, body parsing, security invariants) |
| [`03-implementation-plan.md`](03-implementation-plan.md) | Staged plan: tool surface, file-by-file changes, code sketches, tests, security review, risks |
| [`04-product-spec.md`](04-product-spec.md) | Product spec for every MCP function: argument schemas, output shapes, error texts, annotations, caching, registration order, acceptance criteria |

## Sources

- [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [MCP 2026-07-28 Streamable HTTP transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP TypeScript SDK v2 docs](https://ts.sdk.modelcontextprotocol.io/v2/)
- [Vercel: Node.js functions support fetch web handlers](https://vercel.com/changelog/node-js-vercel-functions-now-support-fetch-web-handlers)
- [Vercel: latest MCP spec supported in mcp-handler](https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler)
- [Connect to remote MCP servers](https://modelcontextprotocol.io/docs/develop/connect-remote-servers)
