# Accessibility Support with a Restrained Design Language

Status: **plan only — implementation not started**
Date: 2026-07-06
Target: WCAG-conformant labels, landmarks, live regions and motion handling with one new visible element

---

## 0. Context

The site is a Vue 3.5 + Vite SPA (TypeScript, Vue Router 4, Vitest + happy-dom) whose design
system is hand-authored CSS custom properties in `src/style.css` — paper background, ink text,
a single terracotta accent (`--accent` `#D97757`) with an AA-darkened `--accent-ink` for link
text, manual dark mode via a `.dark` class persisted to localStorage, and restrained motion
throughout.

### Baseline worth preserving

- An accessible `AppDialog` (focus trap, Escape, focus restore)
- A global `:focus-visible` accent ring on links and buttons
- Hover affordances already mirrored on focus
- Decorative SVGs correctly marked `aria-hidden`

### Gaps found by the audit

| # | Gap |
|---|---|
| 1 | No `aria-live`/status regions anywhere — search results, "Searching…/Nothing matches", loading/404, form errors, slug availability, copy feedback and upload progress are all silent to screen readers |
| 2 | Admin form labels not associated — bare `<label>` with no `for`/`id` in `LoginView` and `PostEditView`; the post title input has no label at all |
| 3 | No skip link and no `.sr-only` utility; the `<nav>` is unnamed; admin routes have no `<main>` landmark |
| 4 | Incomplete `prefers-reduced-motion` — only 3 per-component blocks exist, one buggy (`HomeView` leaves `transition: opacity 0.2s ease` on); body/theme transitions, wordmark scroll animation and reading progress are uncovered |
| 5 | Tiptap toolbar buttons have `:title` but no `aria-label` (glyphs `❝`/`—` read as raw characters), no `aria-pressed`; the icon-only table toolbar is effectively unlabeled with un-hidden SVGs |
| 6 | Text inputs suppress `outline: none` without a strong replacement; the global ring only covers `a` and `button` |
| 7 | `theme-color` meta is light-only; the post cover `alt` duplicates the adjacent `<h1>`; the dialog's focusable query doesn't exclude disabled/hidden elements and Escape is bound only to the panel |

---

## 1. Key decisions

1. **Main landmarks per-view, not around `RouterView`** — `HomeView`/`PostView` already have
   `<main>`, and `App.vue`'s `.page-wrap` contains the footer (which must not live inside main).
   Instead: `AdminLayout`'s root `<div>` → `<main>` (covers all 5 admin child routes),
   `LoginView`'s root → `<main>` (it's a sibling route, not a child). Every `<main>` gets
   `id="main" tabindex="-1"` as the skip target — only one renders at a time, so no duplicate ids.

2. **Skip link is a JS-assisted anchor** — keep `href="#main"` for semantics/no-JS, but
   `@click.prevent` → `getElementById('main').focus()`, because a raw hash click interacts oddly
   with `createWebHistory` and the router's `scrollBehavior`. Suppress the ring on the target with
   `main:focus { outline: none }`.

3. **One global reduced-motion reset** in `style.css`; delete the three per-component blocks
   (`App.vue` nav-chevron, `AppDialog`, `HomeView`'s buggy one). Use
   `transition-duration: 0.01ms !important` rather than `none` — verified against Vue's runtime
   that `<Transition>` still resolves (immediate resolve when no transition is detected, plus a
   timeout + 1 fallback timer), and `!important` also neutralizes the inline transition on
   `App.vue`'s root div. `transition-delay: 0ms` kills the wordmark per-char stagger.

4. **Focus ring extended** to `input`/`textarea`/`select`; remove `outline: none` in admin views
   (their `:focus` border rules stay as a secondary affordance). One documented exception:
   `HomeView`'s `.search-input` keeps `outline: none` because the `.search:focus-within` accent
   border on the container is already the focus indicator — a boxed ring inside the bordered
   search device would double up. Note: text fields match `:focus-visible` even on mouse click, so
   admin fields will show the ring on click — intentional, flagged as a visible change.

5. **Live regions reuse existing visible text** inside persistent `role="status"` wrappers (a
   `role="status"` element mounted via `v-if` is unreliable — the region must pre-exist; only its
   content should change). `role="alert"` goes on the existing `v-if` error paragraphs, since
   alert is the one role that announces on insertion. Visually-hidden duplicate text only where
   visible reuse is impossible (eth copy feedback, 404 announcement). No new visible elements
   except the skip link.

6. **Static `for`/`id` pairs** (`login-email`, `post-slug`, …) rather than `useId()` — these are
   one-off views; static ids are greppable and test-friendly. Optionally use Vue 3.5's `useId()`
   inside `AppDialog` to replace its `Math.random()` uid.

7. **Toolbar containers get `role="group"` + `aria-label`, not `role="toolbar"`** — the toolbar
   role implies arrow-key roving tabindex we aren't implementing; group carries a label with no
   keyboard contract.

8. **Post cover becomes `alt=""`** — `:alt="post.title"` double-announces with the adjacent
   `<h1>`; the cover is decorative in context.

---

## 2. Phase 1 — Global CSS & document head

**`src/style.css`**

- Add `.sr-only` (standard clip pattern: 1px box, `clip-path: inset(50%)`, `white-space: nowrap`, etc.).
- Extend the focus rule to `a, button, input, textarea, select :focus-visible`; add
  `main:focus { outline: none }`.
- Append the global reset:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}
```

**`index.html`**

- Scope the existing `theme-color` to `media="(prefers-color-scheme: light)"` and add a dark
  variant `#141412` (matches dark `--bg`); align the light value `#faf9f5` → `#F9F9F7` to match `--bg`.

---

## 3. Phase 2 — App shell

**`src/App.vue`**

- Skip link as the first child before `<header>`:
  `<a class="skip-link" href="#main" @click.prevent="skipToMain">Skip to content</a>` plus a
  `skipToMain()` that focuses `#main`. Styled only with existing tokens (`--bg`, `--text-main`,
  `--border`, `--font-sans`), `z-index: 110` (header is 100), visually hidden until
  `:focus-visible` reveals it. The only new visual element in the whole change set.
- `<nav class="site-nav" aria-label="Primary">`.
- Footer: persistent `<span class="sr-only" role="status">{{ copiedEth ? 'Ethereum address copied' : '' }}</span>`
  outside the eth-fade transition; the button's dynamic `aria-label` stays.
- Delete the redundant nav-chevron reduced-motion block (lines 269–273).

**`src/admin/AdminLayout.vue`** — root `<div>` → `<main id="main" tabindex="-1">`.

---

## 4. Phase 3 — Public views

**`src/views/HomeView.vue`**

- `<main>` → `<main id="main" tabindex="-1">`.
- Writing section: wrap the four state messages (Loading… / No posts yet. / Searching… /
  Nothing matches "…") in a persistent `<div role="status">`, normalize the first from `<div>` to
  `<p>`, and detach the `<ol>` from the `v-else` chain with the explicit condition
  `v-if="!loading && !searching && displayPosts.length"`. An empty wrapper renders nothing — zero
  visual change.
- Notes section: same transformation with `notesLoading` / `noteSearching` / `isSearchingNotes` /
  `displayNotes`.
- Delete the buggy reduced-motion block (lines 435–440) — the global reset supersedes it correctly.
- `.search-input` keeps `outline: none` (documented exception, decision 4).

**`src/views/PostView.vue`**

- `<main id="main" tabindex="-1">`.
- Persistent status region: Loading… visible inside it; when the post is missing, an sr-only
  "This essay doesn't exist." line announces the 404 (the visible 404 block with its link stays
  untouched — links shouldn't live inside a live region). Keep the sibling `v-if` chain contiguous.
- Cover `:alt="post.title"` → `alt=""`.

---

## 5. Phase 4 — Admin forms

**`LoginView.vue`** — root → `<main id="main" tabindex="-1" class="auth-wrap">`; `for`/`id` pairs
(`login-name`, `login-invite`, `login-email`, `login-password`); error `<p>` gets `id="auth-error"`
`role="alert"`; email/password inputs get conditional `aria-describedby="auth-error"` +
`aria-invalid`; remove `outline: none` (keep the `:focus` border rule as a secondary affordance).

**`PostEditView.vue`** — title input gets `aria-label="Post title"` (a visible label would change
the design — restrained call); `for`/`id` pairs for slug/excerpt/cover/tags; slug help `<p>` becomes
persistent with `role="status"` + `id="post-slug-help"` wired via `aria-describedby` on the slug
input (collapse when empty via margin-zeroing on `:empty` — never `display: none`, which kills
announcements); error gets `role="alert"`; the publish checkbox is already correctly wrapped — no
change; remove the three `outline: none` declarations.

**`NoteEditView.vue`** — error gets `role="alert"`; loading wrapped in a persistent `role="status"`
(convert the `v-else` on `<TiptapEditor>` to `v-if="!loading"`).

**`PostsListView.vue` / `NotesListView.vue`** — the landmark comes free via `AdminLayout`;
optionally apply the same loading-status pattern if the diff stays small.

---

## 6. Phase 5 — Editor (`TiptapEditor.vue`)

- Add a `name` field to each toolbar item (Bold, Italic, Underline, Heading 1/2/3, Blockquote,
  Horizontal rule, Bulleted list, Numbered list, Insert table); delete the dummy
  `isActive: () => false` from the two non-toggles so `aria-pressed` is only emitted for true toggles.
- Main toolbar: container `role="group" aria-label="Formatting"`; each button `type="button"`,
  `:aria-label="btn.name"`, `:title="btn.name"`,
  `:aria-pressed="btn.isActive ? btn.isActive() : undefined"`. Image button: `aria-label="Insert image"`.
- Table toolbar: container `role="group" aria-label="Table tools"`; each of the 5 buttons gets
  `type="button"` + an `aria-label` mirroring its title ("Add row below", "Delete row",
  "Add column right", "Delete column", "Delete table"); every inline `<svg>` gets
  `aria-hidden="true" focusable="false"`. Full keyboard reachability of this selection-triggered
  floating toolbar is explicitly out of scope for this pass — note it in a comment.
- Upload indicator becomes a persistent `role="status"` whose text toggles, with `:empty` box-collapse.
- The ProseMirror contenteditable gets an accessible name via
  `editorProps: { attributes: { 'aria-label': 'Body' } }`.
- Focus affordance: keep the contenteditable's `outline: none`, add
  `.editor-shell:focus-within { border-color: var(--accent) }` — mirrors the `HomeView` search
  pattern with the existing accent token.

---

## 7. Phase 6 — Dialog hardening (`AppDialog.vue`)

- Focusable query →
  `'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'`,
  filtered by `el.getClientRects().length > 0` to drop hidden elements (`getClientRects`, not
  `offsetParent` — the overlay is `position: fixed`).
- Move keydown handling from the panel `<div>` to a document-level listener added/removed in the
  existing open/close watch (plus `onUnmounted` cleanup) — catches Escape/Tab even if focus lands
  on `<body>`.
- Replace the `Math.random()` uid with Vue 3.5's `useId()`.
- Delete the redundant reduced-motion block.

---

## 8. Phase 7 — Tests

Vitest + happy-dom, following `tests/src/admin/PostEditView.test.ts` conventions.

1. Extend `PostEditView.test.ts`: every `<label>`'s `for` resolves to a field; title input has
   `aria-label`; slug help exists with `role="status"` before any message and receives text after
   blur; error has `role="alert"`.
2. New `LoginView.test.ts`: label/input association for all four fields; `role="alert"` +
   `id="auth-error"`; `aria-describedby` wiring; root is `main#main`.
3. New `AppDialog.test.ts` (`attachTo: document.body` for Teleport): `role="alertdialog"` +
   `aria-modal`; initial focus on confirm; Tab wraps last→first and shift-Tab reverse; Escape on
   document closes and resolves false; focus restores to the pre-open element.
4. New `HomeView.test.ts` (stub fetch): persistent `[role="status"]` per section, "Loading…"
   pre-resolve and empty post-resolve; typing a query surfaces "Searching…" in the same node;
   `main#main[tabindex="-1"]` present.
5. New `App.test.ts`: skip link is the first anchor with `href="#main"`; nav `aria-label="Primary"`;
   eth copy (stub clipboard) populates the sr-only status span.
6. CSS behavior (reduced motion, focus rings) isn't testable in happy-dom → manual checklist.

---

## 9. Verification

- **Keyboard walk-through (light + dark):** Tab from address bar → skip link appears (paper bg, ink
  text, accent ring) → Enter lands focus at main; full Tab pass over header (chevron rotation on
  focus preserved), search inputs (accent container border), article arrows on focus, footer eth
  buttons; admin login/editor fields all show the accent ring; dialog: focus on Confirm → Tab
  cycles → Escape closes → focus returns to the Delete button.
- **VoiceOver (Safari):** rotor shows exactly one main + navigation "Primary" per route;
  non-matching search announces "Nothing matches…"; post load announces "Loading…" then content; a
  bad slug announces the 404; login error announces immediately; slug blur announces availability;
  toolbar announces "Bold, toggle button, pressed"; eth copy announces "Ethereum address copied".
- **Reduced motion (DevTools emulation):** theme recolors instantly, wordmark snaps, arrows appear
  without slide, dialog still opens/closes (the verified Vue fallback), progress bar still updates.
- **Meta:** the OS dark-mode toggle swaps the Safari tab-bar tint.
- `npx vitest run` green; Lighthouse/axe on `/` and `/writing/:slug` with no label/name/landmark
  violations.

---

## 10. Risks

1. **Global reduced-motion reset vs Vue `<Transition>`** — mitigated (verified Vue resolves with
   no/near-zero transitions; 0.01ms keeps `transitionend` firing); manually verify dialog + eth-fade
   anyway.
2. **The `v-if`/`v-else` chain restructuring** in `HomeView`/`PostView`/`NoteEditView` is the most
   regression-prone edit — new conditions must reproduce the old logic exactly; the `HomeView` test
   guards it.
3. **Admin inputs now show the accent ring on mouse click** — intentional, flag in the PR.
4. `role="status"` elements must never be hidden with `display: none` — use `:empty`
   margin/padding collapse.
5. The skip link's `@click.prevent` is safe for middle-click/new-tab since it's a fragment link;
   `href` kept for no-JS.
6. Removing `isActive: () => false` from the two non-toggle toolbar items is safe — only the
   template's optional-chained call reads it.

---

## 11. Files touched

`src/style.css`, `index.html`, `src/App.vue`, `src/admin/AdminLayout.vue`, `src/views/HomeView.vue`,
`src/views/PostView.vue`, `src/admin/views/{LoginView,PostEditView,NoteEditView}.vue` (+ optionally
the two list views), `src/admin/components/TiptapEditor.vue`, `src/shared/AppDialog.vue`, and tests
under `tests/src/`.

The design language stays untouched: one new element total (the skip link, hidden until keyboard
focus, styled entirely from existing tokens), everything else is attributes, markup semantics, and
CSS that only activates under `prefers-reduced-motion` or keyboard focus.
