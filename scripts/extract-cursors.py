#!/usr/bin/env python3
"""Extract Bibata Modern Ice cursor art into web-usable PNGs.

Source is a Mousecape theme bundle (an Apple XML plist) whose per-cursor
`Representations` are uncompressed 32-bit RGBA TIFFs: one 32x32 sheet for 1x
and one 64x64 sheet for 2x. Animated cursors stack their frames vertically, so
a 24-frame 2x sheet is 64x1536.

Writes to public/cursors/:
  <name>.png       32x32, frame 0
  <name>@2x.png    64x64, frame 0
  <name>-strip.png full filmstrip, animated cursors only (frame 0 is not enough
                   to preserve the animation, and CSS cannot play it anyway)
  manifest.json    every cursor with hotspot, frame count and CSS keywords

Hotspots come from the bundle rather than being eyeballed. They are expressed
in 32-point space, which is exactly CSS pixel space for a 1x cursor, so the
rounded value drops straight into `cursor: url(...) <x> <y>`.

Stdlib only, by design: plistlib parses the plist and its base64 in one call
and zlib supplies PNG deflate, so this needs no virtualenv to reproduce the
82+4 committed binaries.

Usage:  python3 scripts/extract-cursors.py
"""

from __future__ import annotations

import base64
import json
import plistlib
import re
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / 'vendor' / 'cursors' / 'BibataModernIce.cursor'
OUT = ROOT / 'public' / 'cursors'
CSS = ROOT / 'src' / 'styles' / 'cursors.css'

# Bundle slot -> (output name, CSS keywords it backs).
#
# macOS ships two parallel families that Bibata draws identically: "Resize"
# (pane splitters) and "Window" (window frame edges). Both are kept so the set
# stays complete, and the CSS keywords are split along the same semantic line:
# the directional *-resize keywords take the Window art, col/row-resize take
# the Resize art. Slots with an empty keyword tuple have no CSS equivalent and
# ship as art only.
SLOTS: list[tuple[str, str, tuple[str, ...]]] = [
    # ── Arrows ──
    ('com.apple.coregraphics.Arrow',    'arrow',            ('default',)),
    ('com.apple.coregraphics.ArrowS',   'arrow-alt',        ()),
    ('com.apple.coregraphics.ArrowCtx', 'ctx-arrow',        ('context-menu',)),
    ('com.apple.cursor.24',             'ctx-menu',         ()),
    ('com.apple.coregraphics.Alias',    'alias',            ('alias',)),
    ('com.apple.coregraphics.Copy',     'copy',             ('copy',)),
    ('com.apple.cursor.5',              'copy-drag',        ()),
    ('com.apple.cursor.3',              'forbidden',        ('not-allowed', 'no-drop')),
    ('com.apple.cursor.4',              'busy',             ('progress',)),
    # ── Text ──
    ('com.apple.coregraphics.IBeam',    'ibeam',            ('text',)),
    ('com.apple.coregraphics.IBeamS',   'ibeam-alt',        ()),
    ('com.apple.cursor.26',             'ibeam-horizontal', ('vertical-text',)),
    # ── Hands ──
    ('com.apple.cursor.2',              'pointing-hand',    ('pointer',)),
    ('com.apple.cursor.13',             'link-hand',        ()),
    ('com.apple.cursor.12',             'open-hand',        ('grab',)),
    ('com.apple.cursor.11',             'closed-hand',      ('grabbing',)),
    ('com.apple.cursor.40',             'help',             ('help',)),
    # ── Precision ──
    ('com.apple.cursor.7',              'crosshair',        ('crosshair',)),
    ('com.apple.cursor.8',              'crosshair-2',      ()),
    ('com.apple.cursor.41',             'cell',             ('cell',)),
    ('com.apple.cursor.25',             'poof',             ()),
    ('com.apple.coregraphics.Move',     'move',             ('move', 'all-scroll')),
    ('com.apple.coregraphics.Wait',     'wait',             ('wait',)),
    # ── Edges: Window family backs the directional keywords ──
    ('com.apple.cursor.31',             'window-n',         ('n-resize',)),
    ('com.apple.cursor.36',             'window-s',         ('s-resize',)),
    ('com.apple.cursor.27',             'window-e',         ('e-resize',)),
    ('com.apple.cursor.38',             'window-w',         ('w-resize',)),
    ('com.apple.cursor.21',             'resize-n',         ()),
    ('com.apple.cursor.22',             'resize-s',         ()),
    ('com.apple.cursor.18',             'resize-e',         ()),
    ('com.apple.cursor.17',             'resize-w',         ()),
    # ── Bidirectional ──
    ('com.apple.cursor.32',             'window-ns',        ('ns-resize',)),
    ('com.apple.cursor.28',             'window-ew',        ('ew-resize',)),
    ('com.apple.cursor.23',             'resize-ns',        ('row-resize',)),
    ('com.apple.cursor.19',             'resize-ew',        ('col-resize',)),
    ('com.apple.cursor.30',             'resize-nesw',      ('nesw-resize',)),
    ('com.apple.cursor.34',             'resize-nwse',      ('nwse-resize',)),
    # ── Corners (the only coloured art in the set) ──
    ('com.apple.cursor.29',             'window-ne',        ('ne-resize',)),
    ('com.apple.cursor.33',             'window-nw',        ('nw-resize',)),
    ('com.apple.cursor.35',             'window-se',        ('se-resize',)),
    ('com.apple.cursor.37',             'window-sw',        ('sw-resize',)),
]

# TIFF tag ids we care about, and the byte width of each field type.
_WIDTH, _HEIGHT, _COMPRESSION = 256, 257, 259
_STRIP_OFFSETS, _SAMPLES_PER_PIXEL, _STRIP_BYTE_COUNTS = 273, 277, 279
_EXTRA_SAMPLES = 338
_TYPE_SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}


def decode_tiff(blob: bytes) -> tuple[int, int, bytes]:
    """Return (width, height, RGBA bytes) for a little-endian uncompressed TIFF."""
    if blob[:4] != b'II*\x00':
        raise ValueError('expected a little-endian TIFF')

    ifd = struct.unpack_from('<I', blob, 4)[0]
    count = struct.unpack_from('<H', blob, ifd)[0]
    tags: dict[int, list[int]] = {}

    for i in range(count):
        entry = ifd + 2 + i * 12
        tag, field_type, values = struct.unpack_from('<HHI', blob, entry)
        size = _TYPE_SIZES.get(field_type, 1) * values
        # Values of 4 bytes or fewer are stored inline; longer ones are a pointer.
        if size <= 4:
            raw = blob[entry + 8:entry + 8 + size]
        else:
            start = struct.unpack_from('<I', blob, entry + 8)[0]
            raw = blob[start:start + size]
        if field_type == 3:
            tags[tag] = list(struct.unpack_from(f'<{values}H', raw, 0))
        elif field_type == 4:
            tags[tag] = list(struct.unpack_from(f'<{values}I', raw, 0))
        else:
            tags[tag] = list(raw)

    if tags[_COMPRESSION][0] != 1:
        raise ValueError(f'unexpected compression {tags[_COMPRESSION][0]}')
    if tags[_SAMPLES_PER_PIXEL][0] != 4:
        raise ValueError(f'expected RGBA, got {tags[_SAMPLES_PER_PIXEL][0]} samples')
    # PNG stores straight alpha. ExtraSamples 2 is unassociated (straight) and can be
    # copied verbatim; 1 would be premultiplied and need dividing out first, or every
    # antialiased edge ships a dark fringe.
    if tags.get(_EXTRA_SAMPLES, [2])[0] != 2:
        raise ValueError('alpha is premultiplied; un-premultiply before writing PNG')

    width, height = tags[_WIDTH][0], tags[_HEIGHT][0]
    pixels = b''.join(
        blob[offset:offset + length]
        for offset, length in zip(tags[_STRIP_OFFSETS], tags[_STRIP_BYTE_COUNTS])
    )
    return width, height, pixels


def write_png(path: Path, width: int, height: int, rgba: bytes) -> int:
    """Write 8-bit RGBA PNG. Filter type 0 per row keeps this to one zlib call."""
    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return struct.pack('>I', len(payload)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    stride = width * 4
    scanlines = b''.join(b'\x00' + rgba[y * stride:(y + 1) * stride] for y in range(height))
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(scanlines, 9))
        + chunk(b'IEND', b'')
    )
    path.write_bytes(png)
    return len(png)


def data_uri(path: Path) -> str:
    return "url('data:image/png;base64," + base64.b64encode(path.read_bytes()).decode('ascii') + "')"


# Cursor sizes offered in the footer settings board, in CSS pixels. The art is
# 32pt, so 32 is native and needs no attribute selector; the rest are overrides.
#
# CSS has no cursor-size property — a cursor renders at its image's *intrinsic*
# size, which image-set() derives as pixel size / density. So a 64px PNG declared
# 1.33333x has an intrinsic size of 48px. One formula covers every size:
#
#     image-set(url(name.png) 32/S x, url(name@2x.png) 64/S x)
#
# at S=32 that reduces to the plain 1x/2x pair, and both densities stay available
# at every size so the browser still picks per display.
SIZES = (32, 24, 48, 64)
SIZE_LABELS = {24: 'Small', 32: 'Regular', 48: 'Large', 64: 'Extra large'}
ART_POINTS = 32


def density(source_px: int, target_px: int) -> str:
    """Density that makes `source_px` of artwork render at `target_px` CSS pixels."""
    value = source_px / target_px
    return f'{value:.5f}'.rstrip('0').rstrip('.')


def scaled_hotspot(hotspot: list[int], target_px: int) -> tuple[int, int]:
    """Hotspots are in 32-point space, so they scale with the rendered size.

    calc() is deliberately avoided here: browsers parse it in a cursor hotspot but
    support for actually honouring it is not something to bet the pointer on, so
    every size gets literal numbers written out instead.
    """
    return tuple(  # type: ignore[return-value]
        min(target_px - 1, max(0, round(value * target_px / ART_POINTS)))
        for value in hotspot
    )


def image_tokens(entries: list[dict], target_px: int | None) -> list[str]:
    """--img-* declarations. target_px None emits plain urls for the no-image-set path."""
    lines = []
    for entry in entries:
        name = entry['name']
        # The arrow's bytes are inlined once as --arrow-src-*; every size just
        # re-references them at a different density instead of repeating ~4.6 KB.
        one = 'var(--arrow-src-1x)' if name == 'arrow' else f"url('/cursors/{name}.png')"
        two = 'var(--arrow-src-2x)' if name == 'arrow' else f"url('/cursors/{name}@2x.png')"
        if target_px is None:
            lines.append(f'--img-{name}: {one};')
        else:
            lines.append(
                f'--img-{name}: image-set({one} {density(32, target_px)}x, '
                f'{two} {density(64, target_px)}x);'
            )
    return lines


def cursor_tokens(entries: list[dict], target_px: int) -> list[str]:
    """--cursor-* declarations: artwork, hotspot scaled to size, keyword fallback."""
    lines = []
    for entry in entries:
        if not entry['cssKeywords']:
            continue
        x, y = scaled_hotspot(entry['hotspot'], target_px)
        for keyword in entry['cssKeywords']:
            lines.append(f'--cursor-{keyword}: var(--img-{entry["name"]}) {x} {y}, {keyword};')
    return lines


def generate_css(entries: list[dict]) -> str:
    """Build the generated region of src/styles/cursors.css."""
    themed = ':root:not(.native-cursor)'
    out: list[str] = []
    add = out.append

    add('  /* The default arrow is inlined rather than fetched: it is on screen for')
    add('     almost the whole visit, so a cold-cache round trip would show the')
    add("     visitor's own arrow first and then snap to Bibata, which reads as a bug.")
    add('     CSP already permits `data:` under img-src. Stored once and re-referenced')
    add('     at each size, since var() resolves inside image-set(). */')
    add(f'  {themed} {{')
    add(f'    --arrow-src-1x: {data_uri(OUT / "arrow.png")};')
    add(f'    --arrow-src-2x: {data_uri(OUT / "arrow@2x.png")};')
    add('')
    add('    /* Plain urls, for browsers without image-set() support in `cursor`.')
    add('       They get the native 32px size and the size setting does nothing. */')
    for line in image_tokens(entries, None):
        add(f'    {line}')
    add('')
    for line in cursor_tokens(entries, 32):
        add(f'    {line}')
    add('  }')
    add('')
    add('  /* @supports tests the real property, so a browser that cannot parse')
    add('     image-set() inside `cursor` keeps the plain urls above. Declaring it')
    add('     blind would leave the token unparseable there and collapse every')
    add('     cursor to `auto`, because custom properties are not validated at')
    add('     parse time. */')
    add(f"  @supports (cursor: image-set(url('/cursors/arrow.png') 1x) 7 2, default) {{")

    for size in SIZES:
        label = SIZE_LABELS[size]
        add('')
        if size == ART_POINTS:
            add(f'    /* {label} — {size}px, the default, so no attribute selector. */')
            selector = themed
        else:
            add(f'    /* {label} — {size}px. :where() contributes no specificity, so this')
            add('       stays level with the block above and source order decides, which')
            add('       is what lets the forced-colors reset still win at the end. */')
            selector = f"{themed}:where([data-cursor-size='{size}'])"
        add(f'    {selector} {{')
        for line in image_tokens(entries, size):
            add(f'      {line}')
        if size != ART_POINTS:
            add('')
            for line in cursor_tokens(entries, size):
                add(f'      {line}')
        add('    }')

    add('  }')
    return '\n'.join(out)


def write_generated_css(entries: list[dict]) -> int:
    """Replace the marked region of cursors.css with freshly generated declarations.

    Idempotent: rewrites whatever currently sits between the markers, so running
    this twice is a no-op and switching themes just refreshes the block.
    """
    if not CSS.exists():
        print(f'skipped CSS generation: {CSS.relative_to(ROOT)} not found')
        return 0

    css = CSS.read_text()
    pattern = re.compile(
        r'(/\* >>> generated[^\n]*\*/\n)'
        r'.*?'
        r'([ \t]*/\* <<< generated \*/)',
        re.DOTALL,
    )
    match = pattern.search(css)
    if not match:
        raise SystemExit(f'generated-region markers not found in {CSS.relative_to(ROOT)}')

    body = generate_css(entries)
    css = css[:match.start()] + match.group(1) + body + '\n' + match.group(2) + css[match.end():]
    CSS.write_text(css)
    return len(body)


def main() -> None:
    theme = plistlib.loads(BUNDLE.read_bytes())
    cursors = theme['Cursors']
    OUT.mkdir(parents=True, exist_ok=True)

    missing = [slot for slot, _, _ in SLOTS if slot not in cursors]
    if missing:
        raise SystemExit(f'bundle is missing expected slots: {missing}')
    extra = sorted(set(cursors) - {slot for slot, _, _ in SLOTS})
    if extra:
        raise SystemExit(f'bundle has slots this script does not map: {extra}')

    entries = []
    total = 0

    for slot, name, keywords in SLOTS:
        cursor = cursors[slot]
        frames = int(cursor['FrameCount'])
        hotspot = [round(float(cursor['HotSpotX'])), round(float(cursor['HotSpotY']))]
        files = []

        for rep_index, suffix in ((0, ''), (1, '@2x')):
            width, height, pixels = decode_tiff(bytes(cursor['Representations'][rep_index]))
            frame_height = height // frames
            if frame_height != width:
                raise ValueError(f'{name}: frame is {width}x{frame_height}, expected square')

            first = f'{name}{suffix}.png'
            total += write_png(OUT / first, width, frame_height, pixels[:width * frame_height * 4])
            files.append(first)

            if frames > 1:
                strip = f'{name}-strip{suffix}.png'
                total += write_png(OUT / strip, width, height, pixels)
                files.append(strip)

        entries.append({
            'slot': slot,
            'name': name,
            'hotspot': hotspot,
            'frames': frames,
            'frameDuration': float(cursor['FrameDuration']),
            'cssKeywords': list(keywords),
            'files': files,
        })

    manifest = {
        'theme': theme['ThemeName'],
        'themeVersion': theme['ThemeVersion'],
        'creator': theme['Creator'],
        'license': 'GPL-3.0-or-later',
        'upstream': 'https://github.com/ful1e5/Bibata_Cursor',
        'generatedBy': 'scripts/extract-cursors.py',
        'cursors': entries,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

    mapped = sum(1 for e in entries if e['cssKeywords'])
    keywords = sum(len(e['cssKeywords']) for e in entries)
    png_count = sum(len(e['files']) for e in entries)
    print(f'{len(entries)} cursors -> {png_count} PNGs, {total:,} bytes')
    print(f'{mapped} mapped to {keywords} CSS keywords, {len(entries) - mapped} art-only')
    print(f'wrote {OUT.relative_to(ROOT)}/manifest.json')

    generated = write_generated_css(entries)
    if generated:
        sizes = ', '.join(f'{size}px' for size in SIZES)
        print(f'generated {generated:,} bytes into {CSS.relative_to(ROOT)} (sizes: {sizes})')


if __name__ == '__main__':
    main()
