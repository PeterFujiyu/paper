// Section anchors and table-of-contents entries for a rendered article body.
//
// Article bodies are stored as TipTap JSON and rendered to HTML at read time, so
// there is no place in the database to keep a heading id. Instead the id is
// derived from the heading's own text — the same text always yields the same id,
// which makes section links stable across reloads and deploys without a
// migration. Collisions are resolved by document order, so two headings that
// genuinely read the same still get distinct, predictable ids.

/** Levels that earn an anchor. h1 is the article title's level and is excluded. */
export type HeadingLevel = 2 | 3

export interface HeadingEntry {
  id: string
  text: string
  level: HeadingLevel
}

/** Below this estimate an essay is short enough to read straight through. */
export const MIN_TOC_MINUTES = 6

/** Fewer top-level sections than this and a contents list is noise, not help. */
export const MIN_TOC_SECTIONS = 3

/** Marks the permalink so a second decorating pass can replace it cleanly. */
export const ANCHOR_CLASS = 'head-anchor'

/** Used when a heading's text carries no letters or digits at all (e.g. "···"). */
const FALLBACK_SLUG = 'section'

const HEADING_SELECTOR = 'h2, h3'

/**
 * Deterministic, human-readable id for one heading's text:
 * `Accessibility and Motion` → `accessibility-and-motion`.
 *
 * Letters and digits of any script survive, so a Chinese heading keeps a
 * readable id rather than collapsing to an empty string; everything else
 * becomes a single hyphen. Apostrophes are dropped rather than hyphenated so
 * `The Reader's Eye` reads as `the-readers-eye`.
 */
export function slugifyHeading(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['‘’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Turn raw heading text into collision-free entries, in document order. The
 * first `Notes` keeps `notes`; the next becomes `notes-2`. The counter keeps
 * climbing past any id already taken, so a literal heading named `Notes 2`
 * can't be shadowed by a generated one.
 *
 * `reserved` holds ids the rest of the page has already claimed — the page
 * wrapper's `main`, a form control's, anything outside the article body. A
 * heading that would take one of those is numbered aside instead, so
 * `getElementById` keeps resolving section links to the section.
 */
export function collectHeadings(
  raw: Array<{ level: HeadingLevel, text: string }>,
  reserved: Iterable<string> = [],
): HeadingEntry[] {
  const used = new Set<string>(reserved)

  return raw.map(({ level, text }) => {
    const trimmed = text.trim()
    const base = slugifyHeading(trimmed) || FALLBACK_SLUG

    let id = base
    let suffix = 1
    while (used.has(id)) {
      suffix += 1
      id = `${base}-${suffix}`
    }
    used.add(id)

    return { id, text: trimmed, level }
  })
}

/** URL hash for a heading id, percent-encoded so non-Latin ids stay valid. */
export function headingHash(id: string): string {
  return `#${encodeURIComponent(id)}`
}

/** Accessible name for a permalink — the `#` glyph alone says nothing. */
export function sectionLinkLabel(text: string): string {
  return `Link to section: ${text}`
}

/**
 * Whether a contents list earns its place. Both conditions have to hold: a long
 * essay with two sections has nothing to navigate, and a dense five-minute piece
 * is quicker to read than to index.
 */
export function shouldShowToc(entries: HeadingEntry[], readingMinutes?: number): boolean {
  if ((readingMinutes ?? 0) < MIN_TOC_MINUTES) return false
  return entries.filter(entry => entry.level === 2).length >= MIN_TOC_SECTIONS
}

/**
 * Give every h2/h3 under `root` a stable id and a quiet permalink, and return
 * the entries in document order. Idempotent: an anchor left by an earlier pass
 * is removed before the heading's text is read, so the `#` never leaks into the
 * id or the label.
 */
export function decorateHeadings(root: ParentNode): HeadingEntry[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
  for (const node of nodes) node.querySelector(`.${ANCHOR_CLASS}`)?.remove()

  const entries = collectHeadings(nodes.map(node => ({
    level: node.tagName === 'H3' ? 3 : 2,
    text: node.textContent ?? '',
  })), documentIds(nodes))

  nodes.forEach((node, index) => {
    const entry = entries[index]
    node.id = entry.id
    node.append(buildAnchor(node.ownerDocument, entry))
  })

  return entries
}

/**
 * Ids already spoken for elsewhere in the document. The headings being
 * decorated are excluded, so a second pass over a body that is already in the
 * page doesn't treat last pass's ids as somebody else's and renumber them.
 */
function documentIds(nodes: HTMLElement[]): Set<string> {
  const doc = nodes[0]?.ownerDocument
  if (!doc) return new Set()

  const own = new Set<Element>(nodes)
  const taken = new Set<string>()
  for (const el of doc.querySelectorAll('[id]')) {
    if (!own.has(el)) taken.add(el.id)
  }
  return taken
}

function buildAnchor(doc: Document, entry: HeadingEntry): HTMLAnchorElement {
  const anchor = doc.createElement('a')
  anchor.className = ANCHOR_CLASS
  anchor.href = headingHash(entry.id)
  anchor.setAttribute('aria-label', sectionLinkLabel(entry.text))
  anchor.textContent = '#'
  return anchor
}
