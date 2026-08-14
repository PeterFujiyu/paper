# 4. Product specification — the MCP function surface

Status: **specification — nothing implemented**
Date: 2026-08-13
Scope: every MCP function Paper exposes, on both servers (remote read-only at `/api/mcp`,
local stdio authoring). **Excludes the front-end entirely** — no Vue, no admin UI, no
`src/` changes beyond possibly sharing types. The admin panel remains the only browser
write path.

Builds on [`01`](01-protocol-landscape.md)–[`03`](03-implementation-plan.md). Where this
document and 03 disagree, this document wins — it is the later, finer-grained pass.

---

## 0. Glossary and conventions

- **Tool names** are `snake_case` verbs on nouns the site already uses: essays, notes,
  brews. (`kebab-case` is this repo's convention for *route* names; MCP tool names follow
  the ecosystem's `snake_case` so models treat them as ordinary identifiers.)
- Every tool returns **both** renderings the protocol allows:
  - `content`: one `text` block, human/model-readable prose;
  - `structuredContent`: machine-readable JSON validated by the tool's `outputSchema`.
- **Domain failures are results, not errors.** A missing slug, a validation failure, a
  duplicate slug all return `isError: true` with the same message text the HTTP API uses
  (e.g. `Slug is already in use.` — `server/routes/post.ts`). JSON-RPC errors are reserved
  for protocol failures (bad arguments rejected by schema, unknown method, header
  mismatch), which the SDK raises itself.
- **Infrastructure failures** (Mongo down, unexpected throw) return `isError: true` with
  exactly `Request failed` — never a stack trace, driver error, or JWT detail
  (`CLAUDE.md` security invariants; `server/routes/posts.ts:141-147`).
- All list-shaped results carry `ttlMs: 60_000` and `cacheScope: 'public'` on the remote
  server — the same 60-second window as `PUBLIC_READ_CACHE_CONTROL`
  (`server/lib/cache.ts:23`). The stdio server serves one author from a warm process and
  sets `ttlMs: 0`.
- Dates serialize as ISO-8601 UTC strings. Mongo `_id`s serialize as their hex string.
- Numeric field conventions carry over from the HTTP API: `0` means "not recorded" for
  reading minutes, brew figures, and ratings (`src/types/content.ts:34,60-67`).

### 0.1 Server identities

| | name | version | transport |
|---|---|---|---|
| Remote | `paper` | package version | Streamable HTTP `2026-07-28`, `responseMode: 'json'` |
| Local | `paper-author` | package version | stdio |

Both are built by the same factory; the stdio server registers the authoring tools on top
of the read tools. A tool listed in §2 exists on **both** servers; a tool in §4 exists
**only** on stdio.

### 0.2 Protocol-level surface (SDK-provided, spec'd here for testability)

| Method | Requirement |
|---|---|
| `server/discover` | Advertises `2026-07-28`, server identity, `tools` + `resources` capabilities. No `roots`, `sampling`, `logging` (deprecated), no `tasks` extension. |
| `tools/list` | Deterministic order: the registration order given in this document (§2 then §4). Result carries `ttlMs`/`cacheScope` per §0. |
| `tools/call` | Argument validation by the SDK from the Zod schemas below; invalid arguments never reach handlers. |
| `resources/templates/list`, `resources/read` | The one template in §3. |
| `prompts/*` | Not registered. `prompts/list` returns an empty list if the SDK requires the capability, otherwise the capability is omitted. |
| HTTP `GET`/`DELETE` on `/api/mcp` | `405 Method Not Allowed`. |
| Invalid `Origin` header | `403 Forbidden` before any dispatch. |
| `Mcp-Method`/`Mcp-Name` mismatch with body | `400` + JSON-RPC `-32020` (SDK). |

---

## 1. The shared query layer (prerequisite)

All tools call `server/lib/content-queries.ts` (new) — pure extractions of the queries the
HTTP routes run today, so the two surfaces cannot drift. Signatures:

```ts
// Field projection identical to server/routes/posts.ts:37
listPublishedPosts(opts: { tag?: string; limit: number }): Promise<PostSummaryLean[]>
// Regex construction identical to server/routes/posts.ts:44-58 (escapeRegExp, published: true)
searchPublishedPosts(q: string, limit: number): Promise<PostSummaryLean[]>
// server/routes/post.ts:40; second flag additionally selects contentText
findPublishedPost(slug: string, opts?: { withText?: boolean }): Promise<PostLean | null>
// server/routes/notes.ts:41-64 minus the response shaping
listNotes(opts: { q?: string; limit: number }): Promise<NoteLean[]>
// server/routes/brews.ts:66-86 including readShelf()
listBrews(opts: { q?: string; limit: number }): Promise<{ brews: BrewLean[]; shelf: Shelf }>
```

The HTTP routes are refactored onto these functions in the same change, with **zero
behaviour change** — their existing tests in `tests/api/` are the regression net.

Authoring tools reuse the existing mutation helpers directly: `validatePostBody`,
`normalizeSlug`, `normalizeTags`, `normalizeCoverImage`, `sanitizePostContent`,
`resolveReadingMinutes`, `normalizeReadingOverride` (`server/lib/validation.ts`),
`extractPlainText` (`server/lib/content-text.ts`), `prepareNoteContent`
(`server/lib/note-content.ts`), `prepareBrew` (`server/lib/brew-entry.ts`), and the
duplicate-slug detection from `server/routes/post.ts:10-19` (extracted alongside).

---

## 2. Read tools (both servers)

All five: `annotations: { readOnlyHint: true, idempotentHint: true }`.

### 2.1 `list_essays`

Purpose: browse published essays, newest first.

| Argument | Schema | Notes |
|---|---|---|
| `tag` | `z.string().trim().min(1).max(24).optional()` | Case-insensitive exact match against `tags`; 24 = `maxTagLength` (`server/lib/validation.ts:70`) |
| `limit` | `z.number().int().min(1).max(50).default(20)` | |

Behaviour: `listPublishedPosts`. Filter is always `{ published: true }` in the query itself
— never post-filtered (`server/routes/posts.ts:47`, same discipline).

`structuredContent`:

```ts
{ essays: Array<{
    slug: string; title: string; excerpt: string;
    tags: string[]; readingMinutes: number;   // 0 = no estimate
    createdAt: string;                        // ISO-8601
    viewCount: number; readCompletionCount: number; readCompletionRate: number
  }>,
  total: number }   // essays.length — no separate count query
```

Fields mirror `PostSummary` (`src/types/content.ts:24-37`) minus `_id`, `published`, and
`coverImage` — an agent addresses essays by slug; internal ids and image URLs are noise.
Metrics come through `withPostMetrics` (`server/lib/post-metrics.ts:32`).

`content` text: one line per essay — `slug — title (N min, date): excerpt`.

Errors: none beyond `Request failed`. Empty list is a success with `essays: []`.

### 2.2 `search_essays`

Purpose: full-text search over published essays — title, excerpt, tags, and full body.

| Argument | Schema | Notes |
|---|---|---|
| `q` | `z.string().trim().min(1).max(100)` | 100 = `MAX_SEARCH_LENGTH` (`server/routes/posts.ts:12`); the schema cap **rejects** rather than silently truncating — an agent should know its query was too long |
| `limit` | `z.number().int().min(1).max(20).default(20)` | 20 = HTTP search limit (`server/routes/posts.ts:53`) |

Behaviour: `searchPublishedPosts` — escaped-literal case-insensitive regex
(`escapeRegExp`, `server/lib/regex.ts`) across `title`, `excerpt`, `tags`, `contentText`,
`published: true`, sorted newest first. Identical construction to
`server/routes/posts.ts:44-58`; ReDoS-safe by escaping.

`structuredContent`: same shape as `list_essays`.

### 2.3 `get_essay`

Purpose: read one essay in full, as plain text.

| Argument | Schema |
|---|---|
| `slug` | `z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200)` — the pattern `validatePostBody` enforces on write (`server/lib/validation.ts:26`) |

Behaviour: `findPublishedPost(slug, { withText: true })`. The body served is the stored
**`contentText`** plain-text projection (`server/models/Post.ts:16`, `select: false` — must
be selected explicitly). If `contentText` is empty but `content` is not (legacy documents
pre-dating the projection), fall back to `extractPlainText(sanitizePostContent(content))`
at read time — the exact pair the shell route composes today. Raw TipTap JSON is **never**
returned over MCP: models read prose, and a node tree would need re-sanitising on the way
out for no benefit.

`structuredContent`:

```ts
{ slug: string; title: string; excerpt: string; tags: string[];
  readingMinutes: number; createdAt: string; updatedAt: string;
  viewCount: number; readCompletionCount: number; readCompletionRate: number;
  body: string }    // plain text
```

Excluded, deliberately: `author` (a user ObjectId), `readingMinutesOverride` (admin-only —
`src/types/content.ts:43`), `coverImage`, `content` (TipTap JSON), `_id`.

Errors: unknown or unpublished slug → `isError: true`, text `Not found`. (Identical
response for "doesn't exist" and "exists but unpublished" — a draft's existence is itself
private, matching `server/routes/post.ts:41-44`.)

Metrics note: `get_essay` does **not** increment `viewCount`. View counting stays with the
browser beacon (`post-view` route); an agent reading an essay is not a reader on the page,
and a read-only tool must not write.

### 2.4 `list_notes`

Purpose: read recent notes (public micro-posts), optionally filtered by text.

| Argument | Schema | Notes |
|---|---|---|
| `q` | `z.string().trim().min(1).max(100).optional()` | mirrors `server/routes/notes.ts:30` |
| `limit` | `z.number().int().min(1).max(30).default(20)` | 30/20 = HTTP list/search limits (`server/routes/notes.ts:50,62`) |

Behaviour: `listNotes`. Body text is derived by `extractPlainText(sanitizeStoredNoteContent(content))`
— the sanitize-on-read step is not skippable (`server/routes/notes.ts:12-18`), and MCP
flattens to text after it.

`structuredContent`: `{ notes: Array<{ id: string; text: string; createdAt: string }> }` —
here the Mongo id **is** included, because notes have no slug and no other address.

### 2.5 `list_brews`

Purpose: read the coffee log and its standing totals.

| Argument | Schema | Notes |
|---|---|---|
| `q` | `z.string().trim().min(1).max(100).optional()` | |
| `limit` | `z.number().int().min(1).max(30).default(20)` | 30/20 mirrors `server/routes/brews.ts:17-18` |

Behaviour: `listBrews` — the same `Promise.all` of filtered list + whole-collection
`readShelf()` aggregation (`server/routes/brews.ts:29-53`): the shelf always describes the
whole log, not the filtered page.

`structuredContent`:

```ts
{ brews: Array<{
    bean: string; origin: string; roaster: string; method: BrewMethod;
    dose: number; water: number; temperature: number; brewSeconds: number;
    rating: number;                       // 0 = unrated
    tastingNote: string; pairedSlug: string; createdAt: string }>,
  shelf: { cups: number; origins: number; topMethod: string } }
```

Mirrors `BrewSummary`/`BrewShelf` (`src/types/content.ts:52-79`) minus `_id`. `searchText`
never appears (`select: false`, and the projection in `server/routes/brews.ts:11` is
reused verbatim).

---

## 3. Resources (both servers)

One resource template, no static resource list (the essay catalogue is a tool because it
takes arguments):

| | |
|---|---|
| Template | `paper://essay/{slug}` |
| Title | the essay's title |
| MIME type | `text/plain` |
| Contents | identical plain-text body and lookup rules as `get_essay` §2.3 |
| `resources/read` errors | unknown/unpublished slug → JSON-RPC `-32602` (Invalid Params — the code `2026-07-28` assigns to resource-not-found) |
| Caching | `ttlMs: 60_000`, `cacheScope: 'public'` (remote); `0` (stdio) |

Rationale: clients that attach context by URI (rather than by tool call) can pin an essay
directly. Notes and brews get no resource form — they have no stable public address.

---

## 4. Authoring tools (stdio server only)

Never registered on the remote handler — enforced structurally: `registerReadTools(server)`
is called by the shared factory, `registerAuthoringTools(server)` only by
`server/mcp/stdio.ts`. A test asserts the remote handler's `tools/list` contains no tool
named in this section.

All: `annotations: { readOnlyHint: false }`. These tools operate on MongoDB directly with
the author's `.env` credentials; no JWT, no cookie, no HTTP hop. There is deliberately
**no delete tool** — deletion stays in the admin UI.

Content format: essay and note bodies are accepted as **TipTap JSON** (`JSONContent`), the
same payload the admin editor sends, and pass through the same sanitizers. Accepting
Markdown and converting server-side is an explicit non-goal of this spec (new dependency,
new sanitization surface); revisit only if authoring-by-agent proves clumsy in practice.

### 4.1 `create_draft`

Purpose: create an essay, always unpublished.

| Argument | Schema | Validated by |
|---|---|---|
| `title` | `z.string().trim().min(3)` | `validatePostBody` (`server/lib/validation.ts:107`) |
| `slug` | slug pattern, optional | omitted → derived via `slugify(title)` as the model's pre-validate hook does (`server/models/Post.ts:42-46`) |
| `excerpt` | `z.string().trim().min(12)` | `validatePostBody` |
| `content` | `z.unknown()` — TipTap JSON | `sanitizePostContent` (`server/lib/validation.ts:216`): allowed node/mark whitelist, depth ≤ 16, ≤ 1500 nodes, safe-link/safe-image validation |
| `tags` | `z.array(z.string()).max(6).optional()` | `normalizeTags` (≤ 6 tags, ≤ 24 chars) |
| `coverImage` | `z.string().max(2048).optional()` | `normalizeCoverImage` |
| `readingMinutesOverride` | `z.number().int().min(0).optional()` | `normalizeReadingOverride` |

Behaviour: the exact create sequence of `server/routes/posts.ts:85-124` — validate,
sanitize, `slugExists` pre-check, explicit field-by-field `Post.create` (never spreading
input, so server-owned fields cannot be smuggled), `contentText` from `extractPlainText`,
`readingMinutes` from `resolveReadingMinutes`. **`published` is not an argument and is
always `false`** — publishing is its own tool with its own annotation. `author` is set
from a `MCP_AUTHOR_ID` env var read at startup (the stdio server has no session to take
an id from); startup fails loudly if it is unset or matches no User.

Result: `structuredContent` = the `get_essay` shape (§2.3) plus `published: false`.
Duplicate slug → `isError: true`, `Slug is already in use.` — including the race caught
via Mongo error 11000 (`server/routes/posts.ts:15-24`).

### 4.2 `update_essay`

Purpose: full replacement of an essay's editable fields, addressed by slug.

Arguments: `slug` (required — the essay to update, published or not) plus **all** of
§4.1's content arguments, plus `newSlug` (optional, slug pattern) to rename.

Behaviour: resolve slug → id, then the PUT sequence of `server/routes/post.ts:66-118`:
`validatePostBody`, `sanitizePostContent`, `slugExists(newSlug, id)`, explicit `$set`,
`{ new: true, runValidators: true }` — the `runValidators` flag is a stated invariant
(`CLAUDE.md`). Replacement semantics, not merge: the caller supplies the full document,
exactly as the admin editor does. `published` is untouched by this tool.

Errors: `Not found` (unknown slug), `Slug is already in use.`, validation messages
verbatim from `validatePostBody`.

### 4.3 `publish_essay`

Purpose: flip visibility. The only outward-facing action in the surface.

| Argument | Schema |
|---|---|
| `slug` | slug pattern, required |
| `published` | `z.boolean().default(true)` — `false` unpublishes |

Annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: true }` —
`destructiveHint` because publishing is public and un-publishing breaks live URLs;
`idempotentHint` because repeating the call is safe.

Behaviour: `findOneAndUpdate({ slug }, { $set: { published } }, { new: true, runValidators: true })`.
Touches nothing else — not content, not `updatedAt`-adjacent derived fields beyond what
timestamps do.

Result: `{ slug, title, published, url }` where `url` is `/writing/<slug>` — the agent can
hand the link back. Unknown slug → `Not found`.

### 4.4 `add_note`

| Argument | Schema | Validated by |
|---|---|---|
| `content` | `z.unknown()` — TipTap JSON | `prepareNoteContent` (`server/lib/note-content.ts:33`): ≤ 1.5 MB serialized, note-grade node whitelist |

Behaviour: `Note.create({ content, contentText })` as `server/routes/notes.ts:69-86`.
Notes publish immediately by nature (there is no draft state on notes) — the tool
description must say so, and it carries `destructiveHint: true` for that reason.

Result: `{ id, text, createdAt }` (§2.4 shape).

### 4.5 `log_brew`

| Argument | Schema | Bounds (from `src/shared/brew.ts`) |
|---|---|---|
| `bean` | string, required | ≤ 80 |
| `method` | `z.enum(BREW_METHODS)` | the 8-method vocabulary |
| `origin`, `roaster` | string, optional | ≤ 60 each |
| `tastingNote` | string, optional | ≤ 400 |
| `dose` | number, optional | 0–200 g |
| `water` | number, optional | 0–5000 g |
| `temperature` | number, optional | 0–100 °C |
| `brewSeconds` | number, optional | 0–86 400 |
| `rating` | int, optional | 0–5 |
| `pairedSlug` | slug pattern, optional | must name an essay; validated by `prepareBrew` |

Behaviour: `prepareBrew` (`server/lib/brew-entry.ts:87`) → `Brew.create`, exactly as
`server/routes/brews.ts:96-107`. Absent numerics normalize to 0 ("not recorded") — the
Zod schema must keep them optional rather than defaulting, so `prepareBrew` remains the
single normalization authority. Brews are plain text throughout; no sanitizer beyond
`prepareBrew`'s own trimming and bounds (its stated contract).

Result: the `list_brews` brew shape (§2.5). Validation failure → `isError: true` with
`prepareBrew`'s message verbatim.

---

## 5. Registration order (canonical)

`tools/list` must return, in order:

1. `list_essays` 2. `search_essays` 3. `get_essay` 4. `list_notes` 5. `list_brews`
6. *(stdio only)* `create_draft` 7. `update_essay` 8. `publish_essay` 9. `add_note` 10. `log_brew`

Deterministic ordering is a SHOULD in `2026-07-28` (prompt-cache friendliness); here it is
a MUST so the test suite can assert the full list literally.

---

## 6. Acceptance criteria

Beyond the per-tool behaviour above (each row becomes at least one test in
`tests/server/mcp/`, mocked in the `vi.hoisted` style of `tests/api/posts.test.ts`):

1. **No draft leaks.** With a store of mixed published/unpublished posts, every read tool
   and the resource template return only published ones; `get_essay` answers `Not found`
   for a draft slug.
2. **No private-field leaks.** `JSON.stringify` of every tool result contains no `author`,
   `contentText` key, `readingMinutesOverride`, `searchText`, or user email.
3. **Message parity.** Domain-error texts are byte-identical to the HTTP API's
   (`Not found`, `Slug is already in use.`, `Request failed`, validation messages).
4. **Surface split.** Remote `tools/list` = §2 exactly; stdio `tools/list` = §2 + §4.
5. **Transport conformance** (remote): valid `tools/call` with the three required headers
   succeeds; `Mcp-Name` mismatch → `400`/`-32020`; `GET` → `405`; bad `Origin` → `403`;
   cookie `pf_admin_session` present on a request changes nothing (never read).
6. **HTTP regression net.** All existing `tests/api/*` pass unchanged after the
   query-layer extraction.
7. `npm run typecheck && npm run lint && npm test` green; `npm run build` green (new deps).

## 7. Open questions (decided-by-default)

| Question | Default in this spec | Revisit when |
|---|---|---|
| Markdown input for authoring tools | No — TipTap JSON only | an agent demonstrably struggles to emit valid TipTap JSON |
| `get_note` by id | No — `list_notes` suffices at ≤ 30 notes | notes outgrow their list |
| Rate limiting on remote tools | None beyond query bounds | abuse observed; reuse `MetricThrottle` pattern |
| `MCP_AUTHOR_ID` vs. single-user assumption | Env var, fail-fast | multi-author ever happens |
| Prompts capability | Not registered | a recurring agent workflow emerges worth encoding |
