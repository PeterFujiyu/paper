<template>
  <div class="docs">

    <!-- Reading progress. Teleported for the same reason as PostView's: the
         route transition puts a transform on an ancestor, which would otherwise
         become this fixed bar's containing block. -->
    <Teleport to="body">
      <div
        class="read-progress"
        :style="{ transform: `scaleX(${progress})` }"
        role="progressbar"
        aria-label="Reading progress"
        :aria-valuenow="Math.round(progress * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      />
    </Teleport>

    <!-- ─── Section index ─── -->
    <aside class="side">
      <div class="side-inner">
        <div class="filter">
          <div class="search">
            <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref="filterEl"
              v-model="filter"
              type="search"
              class="search-input"
              placeholder="Filter sections"
              aria-label="Filter sections"
              @keydown.esc="clearFilter"
            />
          </div>
          <span class="filter-key" aria-hidden="true">/</span>
        </div>

        <nav class="nav" aria-label="Sections">
          <div v-for="group in visibleNav" :key="group.href" class="nav-group">
            <a
              :href="`#${group.href}`"
              class="nav-link"
              :class="{ 'nav-link--on': active === group.href }"
              :aria-current="active === group.href ? 'location' : undefined"
              @click.prevent="go(group.href)"
            >{{ group.label }}</a>
            <div v-if="group.children?.length" class="nav-sub">
              <a
                v-for="child in group.children"
                :key="child.href"
                :href="`#${child.href}`"
                class="nav-link nav-link--sub"
                :class="{ 'nav-link--on': active === child.href, 'nav-link--mono': child.mono }"
                :aria-current="active === child.href ? 'location' : undefined"
                @click.prevent="go(child.href)"
              >{{ child.label }}</a>
            </div>
          </div>
        </nav>
      </div>
    </aside>

    <main id="main" class="doc" tabindex="-1">

      <!-- ─── Masthead ─── -->
      <p class="section-heading">Model Context Protocol</p>
      <h1 class="doc-title">Paper MCP</h1>

      <p class="lede">
        Paper exposes a <strong>stateless, read-only</strong> MCP server at <code>/api/mcp</code>:
        published essay search and reading, recent notes, the coffee log, and
        <code>paper://essay/{slug}</code> resources.
      </p>

      <p class="masthead-meta">
        <span>Protocol revision 2026-07-28</span>
        <span class="sep" aria-hidden="true">·</span>
        <span>Servers <code>paper</code> and <code>paper-author</code></span>
        <span class="sep" aria-hidden="true">·</span>
        <span>Version 1.0.0</span>
      </p>

      <!-- The first screen answers "how do I connect?" before any prose. -->
      <div class="connect-head">
        <p class="section-heading">Connect from</p>
        <span class="segmented" role="radiogroup" aria-label="Agent">
          <button
            v-for="(entry, key) in CLIENTS"
            :key="key"
            type="button"
            role="radio"
            :aria-checked="client === key"
            class="segment"
            :class="{ 'segment--on': client === key }"
            @click="setClient(key as ClientKey)"
          >{{ entry.label }}</button>
        </span>
      </div>

      <div class="connect-pair">
        <div>
          <div class="code-head">
            <p class="code-label">Remote, read-only</p>
            <p class="code-where">{{ current.remoteWhere }}</p>
          </div>
          <CodeBlock :code="current.remote" />
        </div>
        <div>
          <div class="code-head">
            <p class="code-label">Local authoring, stdio</p>
            <p class="code-where">{{ current.localWhere }}</p>
          </div>
          <CodeBlock :code="current.local" />
        </div>
      </div>

      <!-- ─── 01 ─── -->
      <section id="what" class="section">
        <h2 class="section-heading"><span class="num">01</span>What it is</h2>
        <p>
          The public endpoint never reads the admin cookie and exposes no authoring tools —
          everything it can reach is already public on the site, which is why it needs no
          authentication.
        </p>
        <p>
          Protocol revision <strong>2026-07-28</strong>. Stateless: no <code>initialize</code>
          handshake, no session id, no SSE stream. One POST endpoint that may answer with
          plain JSON.
        </p>
      </section>

      <!-- ─── 02 ─── -->
      <section id="connect" class="section">
        <h2 class="section-heading"><span class="num">02</span>Connect</h2>
        <p class="section-lede">
          There are two paths, and their trust properties differ. One is a public read surface
          anything may point at; the other writes to your database.
        </p>

        <div id="connect-remote" class="path">
          <div class="path-head">
            <h3>Remote, read-only</h3>
            <p class="code-label">Public · unauthenticated</p>
          </div>
          <p class="code-where">{{ current.remoteWhere }}</p>
          <CodeBlock :code="current.remote" />
          <p>
            A single <code>POST /api/mcp</code>, unauthenticated, reaching only content already
            published on the site. Safe to point anything at.
          </p>
        </div>

        <!-- The heavier top rule is the whole visual argument: this one writes. -->
        <div id="connect-local" class="path path--write">
          <div class="path-head">
            <h3>Local authoring, stdio</h3>
            <p class="code-label">Writes to the database</p>
          </div>
          <p class="code-where">{{ current.localWhere }}</p>
          <CodeBlock :code="current.local" />
          <p>
            The stdio server requires <code>MCP_AUTHOR_ID</code> (the MongoDB <code>_id</code> of
            the author). It writes directly to whatever <code>MONGODB_URI</code> points at, with
            no confirmation prompt — and, deliberately, no delete tool.
          </p>
        </div>

        <p>
          Server identity: the remote server is named <code>paper</code>, the stdio one
          <code>paper-author</code>. Both report version <code>1.0.0</code>, which describes the
          tool contract rather than the package.
        </p>

        <div id="envelope" class="sub">
          <h3>The <code>_meta</code> envelope</h3>
          <p>
            Every request must carry the <code>_meta</code> envelope the 2026-07-28 revision
            requires — <code>io.modelcontextprotocol/protocolVersion</code>,
            <code>io.modelcontextprotocol/clientInfo</code>,
            <code>io.modelcontextprotocol/clientCapabilities</code>. Omitting it answers
            <code>400</code>, with: <em>“Request is missing the required _meta envelope for
            protocol revision 2026-07-28”</em>. Compliant clients do this for you.
          </p>
          <p>
            <code>GET</code> and <code>DELETE</code> answer <code>405</code>. Responses are
            <code>Cache-Control: no-store</code>.
          </p>
        </div>
      </section>

      <!-- ─── 03 ─── -->
      <section id="tools" class="section">
        <h2 class="section-heading"><span class="num">03</span>Tools</h2>

        <div id="read-tools" class="sub sub--flush">
          <h3>Read tools</h3>
          <p>
            Available on both the remote and local servers. All are annotated
            <code>readOnlyHint: true, idempotentHint: true</code>.
          </p>
          <div class="table-scroll">
            <table class="tools">
              <thead>
                <tr><th>Tool</th><th>Input</th><th>Returns</th><th>Description</th></tr>
              </thead>
              <tbody>
                <tr v-for="tool in READ_TOOLS" :id="`t-${tool.name}`" :key="tool.name">
                  <td class="mono nowrap">{{ tool.name }}</td>
                  <td class="mono dim">{{ tool.input }}</td>
                  <td class="mono nowrap">{{ tool.returns }}</td>
                  <td>{{ tool.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div id="authoring-tools" class="sub">
          <h3>Authoring tools</h3>
          <!-- Boxed and rule-topped: the read table is furniture, this is a warning. -->
          <div class="authoring">
            <p class="code-label">Local stdio only · never registered on the remote endpoint</p>
            <div class="table-scroll">
              <table class="tools tools--authoring">
                <thead>
                  <tr><th>Tool</th><th>Description</th><th>Annotations</th></tr>
                </thead>
                <tbody>
                  <tr v-for="tool in AUTHORING_TOOLS" :id="`t-${tool.name}`" :key="tool.name">
                    <td class="mono nowrap">{{ tool.name }}</td>
                    <td>{{ tool.description }}</td>
                    <td class="mono dim">
                      <span v-for="note in tool.annotations" :key="note" class="annotation">{{ note }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p>There is deliberately no delete tool.</p>
        </div>
      </section>

      <!-- ─── 04 ─── -->
      <section id="policy" class="section">
        <h2 class="section-heading"><span class="num">04</span>Publication policy</h2>
        <div class="policy">
          <p class="lede">
            What it writes starts as a draft, so an agent cannot change the site incidentally —
            only through a call that names the intent.
          </p>
          <div v-for="rule in POLICY" :key="rule.tools" class="policy-row">
            <p class="mono policy-tools">{{ rule.tools }}</p>
            <p class="policy-text" v-html="rule.text" />
          </div>
        </div>
        <p class="pull">
          Those last two are the only reach an agent has into live content, and both require the
          caller to say so explicitly.
        </p>
      </section>

      <!-- ─── 05 ─── -->
      <section id="schemas" class="section">
        <h2 class="section-heading"><span class="num">05</span>Schemas</h2>

        <div id="schemas-input" class="sub sub--flush">
          <h3>Input schemas</h3>
          <p class="shapes">
            <span class="code-label">Shapes</span>
            <span class="mono dim">slugSchema · essayFields · create_draft · update_essay · publish_essay · add_note · log_brew</span>
          </p>
          <CodeBlock :code="INPUT_SCHEMAS" />
        </div>

        <div id="schemas-output" class="sub">
          <h3>Output schemas</h3>
          <p class="shapes">
            <span class="code-label">Shapes</span>
            <span class="mono dim">essaySummary · essayList · essay · authorEssay · note · draftNote · brew · draftBrew · shelf</span>
          </p>
          <CodeBlock :code="OUTPUT_SCHEMAS" />
          <p>
            <code>returned</code> is the size of this page. <code>hasMore</code> is
            <strong>observed, not estimated</strong> — the tools fetch one row beyond
            <code>limit</code> and report whether it existed.
          </p>
        </div>
      </section>

      <!-- ─── 06 ─── -->
      <section id="reference" class="section">
        <h2 class="section-heading"><span class="num">06</span>Reference</h2>

        <div id="resource" class="sub sub--flush">
          <h3>Resource</h3>
          <p>
            <code>paper://essay/{slug}</code> — title “Paper essay”,
            <code>mimeType: text/plain</code>, no listing. The slug is validated against
            <code>slugSchema</code>, so a malformed URI never reaches the database. A miss returns
            a resource-not-found error (JSON-RPC <code>-32602</code>).
          </p>
        </div>

        <div id="errors" class="sub">
          <h3>Errors</h3>
          <p>Messages are deliberately flat: no stack traces, no database internals, no raw JWT errors.</p>
          <div class="table-scroll">
            <table class="tools">
              <thead>
                <tr><th>Message</th><th>Means</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in ERRORS" :key="row.message">
                  <td class="mono">{{ row.message }}</td>
                  <td v-html="row.means" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div id="limits" class="sub">
          <h3>Rate limiting</h3>
          <p>
            A per-IP token bucket: <strong>30 burst, then 30 per minute</strong>, refused before
            dispatch. Every request counts except the CORS preflight.
          </p>
          <p>
            It is <strong>best-effort and per-instance, not a quota</strong>. A cold start hands
            out a full bucket, instances do not share state, and eviction under a flood of keys
            re-grants budget. What it buys is that a single client cannot pin a single instance.
          </p>
        </div>

        <div id="caching" class="sub">
          <h3>Caching</h3>
          <p>
            The remote server advertises <code>{ ttlMs: 60_000, cacheScope: 'public' }</code> on
            <code>server/discover</code>, <code>tools/list</code>, <code>resources/list</code>,
            <code>resources/templates/list</code> and <code>resources/read</code>. The local stdio
            server advertises <code>{ ttlMs: 0, cacheScope: 'private' }</code>.
          </p>
          <p>
            The brew shelf aggregation is memoized for 60 seconds. A write clears only the memo
            held by the instance that served it, and the brew routes and <code>/api/mcp</code> are
            separate functions — so <strong>the TTL, not the invalidation, is what bounds
            staleness</strong>. A warm instance can pair a fresh brew list with a shelf up to a
            minute old.
          </p>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import CodeBlock from '../components/CodeBlock.vue'
import { headerOffset } from '../shared/scroll'

const router = useRouter()

type ClientKey = 'claude' | 'codex' | 'cursor' | 'vscode'

const STORAGE_KEY = 'mcp-docs-client'

const filter = ref('')
const active = ref('what')
const progress = ref(0)
const filterEl = ref<HTMLInputElement | null>(null)

// ─── Connect snippets ───
// The endpoint is read from the page rather than configured, so the commands are
// correct on production, on a preview deployment, and on localhost alike. Scheme
// included: hardcoding https would hand the dev server a URL that does not exist.
const siteOrigin = typeof window === 'undefined' ? 'https://<your-host>' : window.location.origin
const url = `${siteOrigin}/api/mcp`

const CLIENTS: Record<ClientKey, {
  label: string
  remoteWhere: string
  localWhere: string
  remote: string
  local: string
}> = {
  claude: {
    label: 'Claude Code',
    remoteWhere: 'Terminal',
    localWhere: 'Terminal',
    remote: `claude mcp add --transport http paper ${url}`,
    local: 'claude mcp add paper-author -- npm run mcp:stdio',
  },
  codex: {
    label: 'Codex',
    remoteWhere: 'Terminal',
    localWhere: 'Terminal',
    remote: `codex mcp add paper --url ${url}`,
    local: 'codex mcp add paper-author -- npm run mcp:stdio',
  },
  cursor: {
    label: 'Cursor',
    remoteWhere: '~/.cursor/mcp.json',
    localWhere: '~/.cursor/mcp.json',
    remote: `{\n  "mcpServers": {\n    "paper": { "url": "${url}" }\n  }\n}`,
    local: '{\n  "mcpServers": {\n    "paper-author": {\n      "command": "npm",\n      "args": ["run", "mcp:stdio"],\n      "env": { "MCP_AUTHOR_ID": "<author-id>" }\n    }\n  }\n}',
  },
  vscode: {
    label: 'VS Code',
    remoteWhere: '.vscode/mcp.json',
    localWhere: '.vscode/mcp.json',
    remote: `{\n  "servers": {\n    "paper": { "type": "http", "url": "${url}" }\n  }\n}`,
    local: '{\n  "servers": {\n    "paper-author": {\n      "type": "stdio",\n      "command": "npm",\n      "args": ["run", "mcp:stdio"],\n      "env": { "MCP_AUTHOR_ID": "<author-id>" }\n    }\n  }\n}',
  },
}

/** Resolved during setup, not in onMounted: reading it later would paint the
    default snippet first and then swap it under the reader. An unknown stored
    value (hand-edited, or from an older build) falls back rather than blanking
    the section — hasOwn, not `in`, so an inherited name like "toString" counts
    as unknown instead of resolving to a function. */
function storedClient(): ClientKey {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && Object.hasOwn(CLIENTS, stored)) return stored as ClientKey
  } catch {
    // Storage blocked; the default stands.
  }
  return 'claude'
}

const client = ref<ClientKey>(storedClient())
const current = computed(() => CLIENTS[client.value])

function setClient(next: ClientKey): void {
  client.value = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage blocked; the choice simply does not survive the visit.
  }
}

// ─── Content ───
const READ_TOOLS = [
  { name: 'list_essays', input: 'tag? (1–24 chars), limit (1–50, default 20)', returns: 'essayList', description: 'Browse published Paper essays, newest first.' },
  { name: 'search_essays', input: 'q (1–100), limit (1–20, default 20)', returns: 'essayList', description: 'Search published Paper essays by title, excerpt, tag, and full text.' },
  { name: 'get_essay', input: 'slug', returns: 'essay', description: 'Read one published Paper essay in full as plain text.' },
  { name: 'list_notes', input: 'q? (1–100), limit (1–30, default 20)', returns: '{ notes: note[] }', description: 'Read recent public Paper notes, optionally filtered by text.' },
  { name: 'list_brews', input: 'q? (1–100), limit (1–30, default 20)', returns: '{ brews: brew[], shelf }', description: "Read Paper's public coffee log and whole-shelf totals." },
]

const AUTHORING_TOOLS = [
  { name: 'create_draft', description: 'Create an unpublished essay draft from TipTap JSON.', annotations: ['readOnlyHint: false'] },
  { name: 'update_essay', description: 'Replace every editable field of a draft essay addressed by slug. Editing a published essay requires allowPublished: true.', annotations: ['readOnlyHint: false'] },
  { name: 'publish_essay', description: 'Publish an essay, or unpublish it by passing published: false.', annotations: ['readOnlyHint: false', 'destructiveHint: true', 'idempotentHint: true'] },
  { name: 'add_note', description: 'Add a note from TipTap JSON as an unpublished draft. It stays off the site until it is published from the admin Notes view.', annotations: ['readOnlyHint: false'] },
  { name: 'log_brew', description: 'Log one coffee brew as an unpublished draft. It stays off the coffee log and its shelf totals until it is published from the admin Coffee view.', annotations: ['readOnlyHint: false'] },
]

const POLICY = [
  {
    tools: 'create_draft\nadd_note\nlog_brew',
    text: 'Produce unpublished content. Notes and brews are published from the admin Notes and Coffee views; a drafted cup stays off the shelf totals too.',
  },
  {
    tools: 'update_essay',
    text: 'Edits drafts freely, but refuses a published essay unless the call passes <code>allowPublished: true</code>.',
  },
  {
    tools: 'publish_essay',
    text: 'The dedicated tool for changing publication state — putting an essay in front of readers, or taking it back down.',
  },
]

const ERRORS = [
  { message: 'Not found', means: 'The essay is missing or unpublished — including an essay deleted mid-update.' },
  { message: 'Request failed', means: 'A masked infrastructure failure.' },
  { message: 'Slug is already in use.', means: 'Duplicate slug, including the create race.' },
  { message: 'That essay is published. Pass allowPublished: true to edit live content.', means: 'The published-content guard.' },
  { message: 'Could not derive a usable slug from that title. Pass slug explicitly.', means: 'Slug generation found nothing usable.' },
  { message: 'Note cannot be empty. / Bean is required.', means: 'Domain validation.' },
  { message: 'Too many requests', means: 'HTTP 429, JSON-RPC <code>-32000</code>, with <code>Retry-After</code>.' },
  { message: 'Invalid Origin', means: 'HTTP 403, JSON-RPC <code>-32000</code>.' },
]

const INPUT_SCHEMAS = `slugSchema = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200)

essayFields = {
  title:                  z.string().trim().min(3),
  excerpt:                z.string().trim().min(12),
  content:                unknown,            // TipTap JSON, required
  tags?:                  z.array(z.string()).max(6),
  coverImage?:            z.string().max(2048),
  readingMinutesOverride?: z.number().int().min(0),
}

create_draft  = { ...essayFields, slug?: slugSchema }
update_essay  = { slug, ...essayFields, newSlug?: slugSchema,
                  allowPublished: boolean = false }
publish_essay = { slug, published: boolean = true }
add_note      = { content: unknown }          // TipTap JSON, required
log_brew      = { bean, method,               // method ∈ BREW_METHODS
                  origin?, roaster?, tastingNote?,
                  dose?, water?, temperature?, brewSeconds?,
                  rating?, pairedSlug? }`

const OUTPUT_SCHEMAS = `essaySummary = { slug, title, excerpt, tags[], readingMinutes,
                 createdAt, viewCount, readCompletionCount, readCompletionRate }
essayList    = { essays: essaySummary[], returned: int ≥ 0, hasMore: boolean }
essay        = essaySummary & { updatedAt, body }
authorEssay  = essay & { published }

note         = { id, text, createdAt }
draftNote    = note & { published }

brew         = { bean, origin, roaster, method, dose, water, temperature,
                 brewSeconds, rating, tastingNote, pairedSlug, createdAt }
draftBrew    = brew & { published }
shelf        = { cups, origins, topMethod }

publish_essay → { slug, title, published, url }   // url = \`/writing/\${slug}\``

// ─── Section index ───
type NavEntry = { label: string; href: string; mono?: boolean; children?: NavEntry[] }

const NAV: NavEntry[] = [
  { label: 'What it is', href: 'what' },
  {
    label: 'Connect',
    href: 'connect',
    children: [
      { label: 'Remote, read-only', href: 'connect-remote' },
      { label: 'Local authoring, stdio', href: 'connect-local' },
      { label: 'The _meta envelope', href: 'envelope' },
    ],
  },
  {
    label: 'Tools',
    href: 'tools',
    children: [
      { label: 'Read tools', href: 'read-tools' },
      ...READ_TOOLS.map(t => ({ label: t.name, href: `t-${t.name}`, mono: true })),
      { label: 'Authoring tools', href: 'authoring-tools' },
      ...AUTHORING_TOOLS.map(t => ({ label: t.name, href: `t-${t.name}`, mono: true })),
    ],
  },
  { label: 'Publication policy', href: 'policy' },
  {
    label: 'Schemas',
    href: 'schemas',
    children: [
      { label: 'Input schemas', href: 'schemas-input' },
      { label: 'Output schemas', href: 'schemas-output' },
    ],
  },
  {
    label: 'Reference',
    href: 'reference',
    children: [
      { label: 'Resource', href: 'resource' },
      { label: 'Errors', href: 'errors' },
      { label: 'Rate limiting', href: 'limits' },
      { label: 'Caching', href: 'caching' },
    ],
  },
]

/** A group survives the filter if it matches, or if any of its children do. */
const visibleNav = computed<NavEntry[]>(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return NAV

  const out: NavEntry[] = []
  for (const group of NAV) {
    const kept = group.children?.filter(c => c.label.toLowerCase().includes(q)) ?? []
    if (kept.length || group.label.toLowerCase().includes(q)) out.push({ ...group, children: kept })
  }
  return out
})

/** Every id in document order — the scroll-spy walks this, not the filtered list. */
const ORDER = NAV.flatMap(g => [g.href, ...(g.children ?? []).map(c => c.href)])

function clearFilter(): void {
  filter.value = ''
  filterEl.value?.blur()
}

/** The router's own scrollBehavior already clears the fixed header and honours
    reduced motion for a hash target, so this hands the move to it rather than
    scrolling and rewriting the URL behind its back. Replace, not push: paging
    through an index should not fill the back button. */
function go(id: string): void {
  router.replace({ hash: `#${id}` })
}

let frame = 0

function onScroll(): void {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0

    const doc = document.documentElement
    const max = doc.scrollHeight - doc.clientHeight
    progress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0

    // The last section whose top has passed under the header is the one being read.
    const limit = headerOffset() + 6
    let current = ORDER[0]
    for (const id of ORDER) {
      const el = document.getElementById(id)
      if (el && el.getBoundingClientRect().top <= limit) current = id
    }
    active.value = current
  })
}

function onKey(event: KeyboardEvent): void {
  const tag = (event.target as HTMLElement | null)?.tagName ?? ''
  if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) {
    event.preventDefault()
    filterEl.value?.focus()
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  window.addEventListener('keydown', onKey)
  onScroll()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  window.removeEventListener('keydown', onKey)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<style scoped>
.docs {
  display: grid;
  grid-template-columns: minmax(0, 15rem) minmax(0, 1fr);
  gap: 3.5rem;
}

.read-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left center;
  z-index: 200;
  pointer-events: none;
  will-change: transform;
}

/* ─── Section index ─── */
.side {
  position: sticky;
  top: var(--header-h);
  align-self: start;
  max-height: calc(100vh - var(--header-h));
  overflow-y: auto;
  padding-top: 0.4rem;
}

.filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  margin-bottom: 1.4rem;
}

/* Matches the home page's in-place filter, down to the accent focus rule. */
.search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.35rem;
  transition: border-color 0.2s ease;
}

.search:focus-within {
  border-color: var(--accent);
}

.search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.search-input {
  font-family: var(--font-sans);
  font-size: 0.8rem;
  letter-spacing: 0.02em;
  color: var(--text-main);
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  width: 100%;
  min-width: 0;
}

.filter-key {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 0 0.25rem;
  line-height: 1.5;
  flex-shrink: 0;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.nav-group,
.nav-sub {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.nav-link {
  font-family: var(--font-sans);
  font-size: 0.78rem;
  color: var(--text-muted);
  text-decoration: none;
  border-left: 1px solid transparent;
  padding: 0.2rem 0 0.2rem 0.7rem;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.nav-link:hover {
  color: var(--text-main);
}

.nav-link--sub {
  font-size: 0.72rem;
  padding: 0.15rem 0 0.15rem 1.5rem;
}

.nav-link--mono {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding-left: 2.2rem;
}

/* The read position is marked by the accent rule, not by colour alone. */
.nav-link--on {
  color: var(--text-main);
  border-left-color: var(--accent);
}

/* ─── Document ─── */
.doc {
  max-width: var(--measure);
  min-width: 0;
}

.doc-title {
  font-family: var(--font-sans);
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 1.1rem 0 0;
}

.section-heading {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.num {
  opacity: 0.45;
}

.lede {
  font-size: 1.1rem;
  line-height: 1.65;
  margin: 1.4rem 0 0;
  text-wrap: pretty;
}

.masthead-meta {
  font-size: 0.875rem;
  font-style: italic;
  color: var(--text-muted);
  margin: 1rem 0 2.4rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
}

.sep {
  opacity: 0.4;
}

.connect-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
  border-top: 1px solid var(--border);
  padding-top: 1.1rem;
  margin-bottom: 1.4rem;
}

.connect-pair {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

/* ─── Segmented choice ─── */
.segmented {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 2px;
}

.segment {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  padding: 0.12rem 0.45rem;
  white-space: nowrap;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: var(--cursor-pointer, pointer);
  transition: color 0.2s ease, background-color 0.2s ease;
}

.segment + .segment {
  border-left: 1px solid var(--border);
}

/* Selection carries an inset accent rule as well as the tint, so it does not
   rest on hue alone. */
.segment--on {
  background: var(--bg-subtle);
  color: var(--accent-ink);
  box-shadow: inset 0 -1.5px 0 var(--accent);
}

/* ─── Code framing ─── */
.code-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.2rem 1rem;
  margin-bottom: 0.5rem;
}

.code-label {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0;
}

.code-where {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  margin: 0 0 0.4rem;
}

/* ─── Sections ─── */
.section {
  scroll-margin-top: calc(var(--header-h) + 1.5rem);
  padding-top: 4rem;
}

.section > .section-heading {
  margin-bottom: 1.8rem;
}

.section p {
  margin: 0 0 1.5em;
}

.section p:last-child {
  margin-bottom: 0;
}

/* These override the `.section p` default, so they carry a second class rather
   than an !important. */
.section .section-lede {
  margin-bottom: 2.2em;
}

.sub {
  scroll-margin-top: calc(var(--header-h) + 1.5rem);
  padding-top: 3rem;
}

.sub--flush {
  padding-top: 0;
}

.sub h3,
.path-head h3 {
  font-family: var(--font-sans);
  font-size: 1.05rem;
  font-weight: 400;
  letter-spacing: -0.02em;
  margin: 0 0 0.7rem;
}

.path {
  scroll-margin-top: calc(var(--header-h) + 1.5rem);
  border-top: 1px solid var(--border);
  padding: 1.6rem 0 1.8rem;
}

/* The write path is marked by weight, not colour: a full-strength rule where
   the read path gets a hairline. */
.path--write {
  border-top: 2px solid var(--text-main);
  border-bottom: 1px solid var(--border);
}

.path-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem 1rem;
  margin-bottom: 0.9rem;
}

.path-head h3 {
  margin: 0;
}

.path p:last-child {
  margin: 1rem 0 0;
}

/* ─── Tables ─── */
.table-scroll {
  overflow-x: auto;
  max-width: 100%;
}

.tools {
  width: 100%;
  min-width: 44rem;
  border-collapse: collapse;
  border-top: 1px solid var(--border);
}

.tools--authoring {
  min-width: 40rem;
  border-top: none;
}

.tools th {
  font-family: var(--font-sans);
  font-size: 0.68rem;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  text-align: left;
  padding: 0.7rem 1rem 0.6rem 0;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.tools--authoring th {
  padding-top: 0;
  border-bottom: 2px solid var(--text-main);
}

.tools td {
  font-size: 0.9rem;
  line-height: 1.6;
  padding: 0.95rem 1rem 0.95rem 0;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

/* The read table closes on its own bottom rule. These two do not: the authoring
   table would double its rule against the box around it, and the errors table
   ends its subsection. */
.tools--authoring tr:last-child td,
#errors .tools tr:last-child td {
  border-bottom: none;
  padding-bottom: 0;
}

.tools th:last-child,
.tools td:last-child {
  padding-right: 0;
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1.55;
}

.dim {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.nowrap {
  white-space: nowrap;
}

.annotation {
  display: block;
}

.authoring {
  border: 1px solid var(--border);
  border-top: 2px solid var(--text-main);
  padding: 1.2rem 1.2rem 1.3rem;
}

.authoring .code-label {
  margin-bottom: 1.1rem;
}

/* ─── Publication policy ─── */
.policy {
  border-top: 2px solid var(--text-main);
  border-bottom: 1px solid var(--border);
  padding-top: 1.7rem;
}

.policy .lede {
  margin: 0 0 1.6rem;
}

.policy-row {
  display: grid;
  grid-template-columns: minmax(0, 11rem) minmax(0, 1fr);
  gap: 0.5rem 1.4rem;
  border-top: 1px solid var(--border);
  padding: 1.1rem 0;
}

.section .policy-tools {
  /* The rule lists are newline-separated strings, so they wrap as written. */
  white-space: pre-line;
  line-height: 1.75;
  margin: 0;
}

.section .policy-text {
  font-size: 0.95rem;
  line-height: 1.7;
  margin: 0;
}

.section .pull {
  border-left: 1px solid var(--text-main);
  margin: 2rem 0 0;
  padding-left: 1.4rem;
  font-size: 1.1rem;
  line-height: 1.65;
  text-wrap: pretty;
}

.section .shapes {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.85rem;
  margin: 0 0 0.7rem;
}

.shapes .code-label {
  font-size: 0.68rem;
}

.shapes .mono {
  font-size: 0.72rem;
}

/* ─── Inline code ─── */
.doc :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.82em;
  background: var(--bg-subtle);
  border-radius: 2px;
  padding: 0.1em 0.3em;
}

/* Already monospaced and already tinted — a nested tint would double up. */
.mono :deep(code),
.tools td.mono code {
  background: none;
  padding: 0;
  font-size: 0.85em;
}

.doc strong {
  font-weight: 600;
}

/* ─── Narrow ───
   The index stops being a rail and becomes a scrolling strip under the header.
   Tool-level links and the filter go with it: at this width the strip is for
   moving between sections, not for pinpointing a single tool. */
@media (max-width: 900px) {
  .docs {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .side {
    position: static;
    max-height: none;
    overflow: visible;
    padding-top: 0;
  }

  .side-inner {
    position: sticky;
    top: var(--header-h);
    z-index: 90;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 0.55rem 0 0.6rem;
  }

  .nav {
    flex-direction: row;
    overflow-x: auto;
    gap: 1.15rem;
    padding-bottom: 0.15rem;
  }

  .nav-sub,
  .filter {
    display: none;
  }

  .nav-link {
    border-left: none;
    padding-left: 0;
    white-space: nowrap;
  }

  /* With no rule to carry it, the active mark falls back to an underline. */
  .nav-link--on {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
}
</style>
