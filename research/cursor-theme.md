# Cursor theme — Bibata Modern Ice

Replaces every cursor on the site with Bibata Modern Ice, with a footer opt-out.
Written before implementation; kept afterwards as the reference for why the CSS
looks the way it does.

**Status: shipped.** Art vendored in `44212f4`, the theme itself in `27903b3`
(2026-07-30). Reconciled against the code 2026-08-26: `src/styles/cursors.css`
(536 lines), 86 PNGs in `public/cursors/`, `src/shared/cursor.ts` with
`CURSOR_SIZES = [24, 32, 48, 64]`, and `tests/src/styles/cursors.test.ts` guarding
the manifest and the per-size blocks. Two paragraphs below have been superseded
since — both are marked inline.

**Scope decision: re-skin only.** The site's existing cursor states are given new
art. No new cursor states were invented, so `wait`, `progress`, `crosshair`,
`grab` and the whole `*-resize` family are shipped as art but never appear —
a cursor that implies an interaction the element does not support is worse than
a plain one. All 41 cursors ship anyway so the set stays complete.

## Source

`vendor/cursors/BibataModernIce.cursor` — a Mousecape theme bundle, vendored so
the art is reproducible from a fresh clone. It is an Apple XML plist:

| | |
|---|---|
| Creator | Abdulkaiz Khatri (ful1e5) |
| Theme | Bibata Modern Ice 1.0, `HiDPI: true` |
| Licence | GPL-3.0-or-later |
| Cursors | 41 |
| Art | 32×32 @1x, 64×64 @2x, uncompressed RGBA TIFF |
| Hotspots | carried per cursor in the bundle |
| Animated | `wait` and `busy` — 24 frames @ 0.09 s |

Extracted by `scripts/extract-cursors.py` (stdlib only) into 86 PNGs totalling
270,955 bytes, plus `public/cursors/manifest.json`.

Two decode details worth keeping:

- `ExtraSamples = 2` — **unassociated (straight) alpha**, the same convention PNG
  uses, so pixels copy across verbatim. The script asserts this; premultiplied
  alpha would need dividing out or every antialiased edge ships a dark fringe.
- Frames stack **vertically**, so a 24-frame 2x sheet is 64×1536.

## Slot → keyword mapping

macOS ships two families that Bibata draws identically: `Resize` (pane splitters)
and `Window` (window frame edges). Both are kept, and the keywords split along
the same line — directional `*-resize` takes the Window art, `col/row-resize`
takes the Resize art.

| Keyword | Slot | File | Hotspot |
|---|---|---|---|
| `default` | `cg.Arrow` | `arrow` | 7, 2 |
| `pointer` | `#2` | `pointing-hand` | 14, 2 |
| `text` | `cg.IBeam` | `ibeam` | 16, 16 |
| `vertical-text` | `#26` | `ibeam-horizontal` | 16, 16 |
| `context-menu` | `cg.ArrowCtx` | `ctx-arrow` | 7, 2 |
| `alias` | `cg.Alias` | `alias` | 7, 2 |
| `copy` | `cg.Copy` | `copy` | 7, 2 |
| `not-allowed`, `no-drop` | `#3` | `forbidden` | 7, 2 |
| `progress` | `#4` | `busy` | 7, 2 |
| `wait` | `cg.Wait` | `wait` | 16, 16 |
| `help` | `#40` | `help` | 5, 11 |
| `grab` | `#12` | `open-hand` | 18, 10 |
| `grabbing` | `#11` | `closed-hand` | 16, 8 |
| `crosshair` | `#7` | `crosshair` | 16, 16 |
| `cell` | `#41` | `cell` | 16, 16 |
| `move`, `all-scroll` | `cg.Move` | `move` | 16, 16 |
| `n/s/e/w-resize` | `#31 #36 #27 #38` | `window-n/s/e/w` | edge |
| `ns/ew-resize` | `#32 #28` | `window-ns/ew` | 16, 16 |
| `row/col-resize` | `#23 #19` | `resize-ns/ew` | 16, 16 |
| `nesw/nwse-resize` | `#30 #34` | `resize-nesw/nwse` | 16, 16 |
| `ne/nw/se/sw-resize` | `#29 #33 #35 #37` | `window-ne/nw/se/sw` | corner |

30 cursors back 32 keywords. `manifest.json` is the authoritative version.

**The numeric slots are not self-describing and the hotspots mislead.** Every one
was identified by rendering it, not inferred. Three guesses from hotspot position
alone were wrong and would have shipped:

- `#40` looks like a hand from its `5, 11` fingertip hotspot. It is a **question
  mark** — `help`. The pointing hand is `#2`.
- `#11` at `16, 8` looks like a top-edge resize arrow. It is a **closed fist** —
  `grabbing`.
- `not-allowed` is `#3` (flag + red ✕), not one of the other badge arrows.

`#8` is the crosshair with a **red centre dot** ("Crosshair 2"), distinct from the
plain `#7`. The four corner cursors `#29/#33/#35/#37` are the **only coloured art
in the set** (orange/blue/yellow/green quadrants), as are `wait` and `busy`.

### Art with no CSS keyword

Eleven cursors ship as art only, because CSS has no equivalent: `poof` (a bare X,
macOS drag-off-toolbar), `crosshair-2`, `ctx-menu`, `copy-drag`, `link-hand`,
`arrow-alt`, `ibeam-alt`, and `resize-n/s/e/w`. Each still gets an `--img-*` token
in the stylesheet, so using one is a one-line change.

`zoom-in` and `zoom-out` have **no art in this theme** and fall back to native.

## Implementation notes

### Why tokens, not `cursor:` rules

Vue scoped styles set `cursor` through selectors like `.eth-toggle[data-v-x]`,
which outranks anything a global stylesheet can say. A global rule would lose at
all 19 existing declarations and those controls would keep native cursors. So
every cursor is a custom property, and the 19 declarations became
`cursor: var(--cursor-*)` across 8 component files.

Two token layers: `--img-*` is the artwork, `--cursor-*` is the full value
(image + hotspot + keyword fallback). `--cursor-*` reads its art through
`var(--img-*)`, so the retina block only redefines the image layer and each
hotspot is written exactly once.

### Three constraints that shaped the CSS

1. **Vite would have inlined everything.** `build.assetsInlineLimit` defaults to
   4096 bytes and every cursor PNG is 1–3.7 KB, so putting them in `src/assets/`
   would silently base64 all 41 into the stylesheet — ~159 KB of render-blocking
   CSS. They live in `public/cursors/` instead, which also avoids touching
   `vite.config.ts`.
2. **`image-set()` must be feature-gated.** Custom property values are not
   validated at parse time, so declaring `image-set()` blind would leave the token
   unparseable in an older browser and collapse every cursor to `auto`. An
   `@supports (cursor: image-set(...) 7 2, default)` block tests the real property
   and degrades to the 1x URLs instead.
3. **Tokens must exist outside every media query.** Declared only inside
   `@media (hover: hover) and (pointer: fine)`, a token would be missing on touch
   and `cursor: var(--cursor-pointer)` would resolve to `auto`. The base `:root`
   block declares all 32 as plain keywords; the themed block overrides them.

### `cursor` on `<html>` steals the I-beam

`cursor`'s initial value is `auto`, and UA stylesheets do not declare it on `p`,
`li` or `h1`–`h6` — those inherit. Setting `html { cursor: default }` therefore
gives every paragraph of every essay an arrow and silently removes the
text-selection affordance from a reading site. A `:where(p, li, h1…, textarea,
.ProseMirror)` rule puts the I-beam back.

Related: UA stylesheets *do* declare `a:any-link { cursor: pointer }` on the
element, which beats an inherited value — which is exactly why this codebase only
ever wrote `cursor: pointer` on buttons and divs. Links need naming explicitly, and
because children of a link natively inherit its pointer, the link rule repeats for
descendants and is placed after the prose rule to win the tie.

All three rules use `:where()` for zero specificity, so component styles still win.

### Size control

CSS has **no `cursor-size` property**. A cursor renders at its image's *intrinsic*
size, which `image-set()` derives as pixel size / density — so a 64px PNG declared
`1.33333x` has an intrinsic size of 48px. One formula covers every size:

```
image-set(url(name.png) 32/S x, url(name@2x.png) 64/S x)
```

At S=32 that reduces to the plain `1x, 2x` pair, so the default needs no special
case, and both densities stay available at every size for the browser to pick from.
**No extra PNGs are generated for sizes.**

Hotspots are in the same coordinate space as the rendered cursor, so they scale
too — a size block that changed density without the hotspot would leave the
pointer visibly off-target. `calc()` is avoided: browsers *parse* it in a hotspot,
but honouring it is not something to bet the pointer on, so literal numbers are
generated per size. That is 41 image tokens plus 32 keyword tokens per size, which
is why the region is generated rather than hand-written.

Sizes offered: 24 (Small), 32 (Regular, the default), 48 (Large), 64 (Extra large).
`CURSOR_SIZES` in `src/shared/cursor.ts` and `SIZES` in the extraction script must
agree; a test asserts the CSS contains a block for every size the TypeScript offers
and no others.

Specificity is the subtle part. Size blocks use
`:root:not(.native-cursor):where([data-cursor-size='48'])` — `:where()` contributes
nothing, so all blocks sit at the same specificity and **source order decides**.
That is what lets the forced-colors reset, which comes last, still win over a size
block. Verified in-browser: opt-out at size 64 resolves to plain `default`.

**Quality ceiling:** the bundle's largest art is 64×64, so 24px and 32px are crisp
while 48px is mildly soft and 64px is visibly soft on a retina display. Bibata's
upstream SVGs would fix this but are not vendored here.

### Preference and first paint

The visitor can opt out and choose a size from the footer settings disclosure.
`native-cursor` on `<html>` hands every cursor back and `data-cursor-size` selects
the size block; `src/shared/cursor.ts` owns both hooks and the
`localStorage['cursor']` / `localStorage['cursorSize']` values behind them. The
default size deliberately sets *no* attribute, since it is the unqualified block.

The size control is a segmented choice card built on visually hidden
`<input type="radio">` elements, **not a `<select>`** — a native dropdown renders
in OS chrome, which ignores both the site's type and its cursors, so the theme
visibly breaks the moment the menu opens. Real radios keep arrow-key navigation
and the checked state assistive tech announces. The choices are disabled while the
theme is off, rather than silently doing nothing.

**The CSP rules out the usual pre-paint fix.** `script-src 'self' https://hcaptcha.com`
has no `'unsafe-inline'`, so an inline `<script>` in `index.html` to set the class
before first paint would be blocked, and adding a hash or `'unsafe-inline'` would
weaken a policy that has to stay aligned across `vercel.json` and
`server/lib/security.ts`. The preference is read at the top of `src/main.ts`
instead — a module script, CSP-clean, and it runs before `app.mount()`.

> **Superseded (`efb796f`, 2026-08-12).** The reasoning above is right about
> *inline* scripts and wrong about the conclusion: `script-src 'self'` allows an
> **external** first-party script, so `public/theme-init.js` is now fetched and
> executed synchronously from `<head>` ahead of the stylesheet and sets
> `native-cursor` and `data-cursor-size` (plus `dark`, `high-contrast` and
> `less-artwork`) before the first paint. `src/main.ts` still applies all five as
> the fallback for a visitor who never receives that file — it is no longer the
> primary path. `src/shared/cursor.ts` remains the source of truth for the keys and
> values; `tests/src/styles/theme-init.test.ts` fails if the copy drifts.

The default arrow is inlined as a base64 `data:` URI (~4.6 KB across the 1x and
retina blocks; CSP already allows `data:` under `img-src`). It is on screen for
almost the whole visit, so a cold-cache round trip would show the visitor's own
arrow and then snap to Bibata, which reads as a bug. The other 40 are files,
fetched lazily on first use, where a one-off flicker is unremarkable.
`scripts/extract-cursors.py` regenerates the base64 between markers in the
stylesheet, so it is never hand-pasted.

## Accessibility

**The real cost of this change:** there is no media query for OS pointer-size
settings. A visitor who has enlarged their system pointer for a visual impairment
gets whatever size we draw and silently loses that accommodation. CSS cannot
detect it, so the footer controls are the only mitigation — that is what the size
choices and the opt-out are for, not decoration. This is also why the size ladder
reaches 64px even though that size is visibly soft: legibility beats sharpness for
the person who needs it.

Three bail-outs are built in:

- `@media (hover: hover) and (pointer: fine)` — touch devices never reference the
  art at all.
- `@media (forced-colors: active)` — Windows High Contrast visitors rely on their
  own pointer. Uses the same selector as the themed block so specificity ties and
  source order decides; it comes last.
- `.native-cursor` on `<html>` — the footer opt-out, also usable from devtools.

The GPL-3.0 credit sits inside the disclosure, which is collapsed by default, so
the resting footer is unchanged.

## Known gaps

- 48px and 64px are upscaled from 64×64 art and look soft; only 24px and 32px are
  crisp. Fixing this needs Bibata's upstream SVGs and a rasteriser.
- Browsers ignore cursors above 128×128, so 64px is the last safe step on a 2x
  display (64 CSS px × 2 = 128 device px, exactly at the cap).
- In a browser without `image-set()` in `cursor`, the theme still applies at its
  native 32px but the size control does nothing.
- `zoom-in` / `zoom-out` have no art and stay native.
- No `grabbing`-vs-`grab` distinction is exercised anywhere on the site.
- Pre-existing inconsistency left alone: a disabled save button is
  `not-allowed` in `PostEditView.vue` but `default` in `NoteEditView.vue`. Both
  were re-skinned faithfully rather than reconciled.
- ~~Dark mode still reads `localStorage` in `onMounted` (`App.vue`), so it keeps its
  own first-paint flash. The cursor preference deliberately does not; unifying
  them was out of scope.~~
  **Closed.** `efb796f` unified them: `public/theme-init.js` applies theme,
  contrast, artwork *and* both cursor hooks before the first paint, and
  `src/shared/theme.ts` carries the note explaining why `onMounted` was too late.
