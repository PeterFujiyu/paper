# Cursor artwork

The cursor images this site uses are **Bibata Modern Ice**, by Abdulkaiz Khatri
(ful1e5), licensed **GPL-3.0-or-later**. The full licence text sits beside this
file in `LICENSE`.

- Upstream project: <https://github.com/ful1e5/Bibata_Cursor>
- Theme: Bibata Modern Ice, version 1.0
- Theme identifier: `BibataModernIce` (UUID `F2A40950-AC4F-4106-88C2-E6E1F4338E68`)

Nothing here has been redrawn. Every PNG is decoded straight out of the upstream
macOS theme bundle, which is vendored at `vendor/cursors/BibataModernIce.cursor`
so the whole set is reproducible from a fresh clone:

```bash
python3 scripts/extract-cursors.py
```

That script is the source form of these binaries. It reads the bundle (an Apple
XML plist whose per-cursor representations are uncompressed RGBA TIFFs), writes
`<name>.png` at 32×32 and `<name>@2x.png` at 64×64, and regenerates
`manifest.json`. It uses the Python standard library only, so no virtualenv or
install step is needed.

## What is in here

`manifest.json` is the authoritative index: for each of the 41 cursors it records
the original bundle slot, the hotspot, the frame count, the CSS keywords it backs
and the files it produced.

Eleven cursors are shipped as art with no CSS keyword behind them, because CSS
has no equivalent: `poof`, `crosshair-2`, `ctx-menu`, `copy-drag`, `link-hand`,
`arrow-alt`, `ibeam-alt`, and the `resize-n/s/e/w` set that Bibata draws
identically to its `window-*` counterparts. They are kept so the theme stays
complete, and `src/styles/cursors.css` already defines an `--img-*` token for
each one, so putting any of them to use is a one-line change.

Two cursors are animated in the original — `wait` and `busy`, 24 frames at 0.09 s.
CSS cannot animate a cursor at all, so the stylesheet references frame 0 only. The
full filmstrips are preserved as `wait-strip.png` and `busy-strip.png` (plus `@2x`)
and are referenced by nothing, so they cost no bandwidth.

`zoom-in` and `zoom-out` have no artwork in this theme and fall back to the
visitor's native cursors.

## Using them

Do not reference these files directly. Every cursor is exposed as a custom
property in `src/styles/cursors.css` — use `cursor: var(--cursor-pointer)` and
similar, so the footer opt-out and the accessibility bail-outs keep working.
