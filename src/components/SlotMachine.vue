<template>
  <button
    type="button"
    class="slot-machine"
    :class="{ 'slot-machine--busy': spinning }"
    aria-label="Pull the lever"
    @click="pull"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="6 74 280 356"
      aria-hidden="true"
      focusable="false"
    >
      <!-- A one-armed bandit that always comes up 404, drawn in isometric line.
           Static geometry was generated once, back to front: base, coin holes,
           cabinet, reels, tray, ledge, lever hub — then the lever, the hood,
           and last the lit dots and any coins it pays out. -->
      <g class="slot-body">
        <path d="M14 318L114.5 260L275.5 353L275.5 365L175.1 423L14 330Z" />
        <path class="art-edge" d="M14 318L175.1 411L275.5 353M175.1 411L175.1 423" />
        <path class="art-well slot-stake" :class="{ 'slot-stake--spent': spent }" d="M71.6 339.3L72.6 338.4L73.1 337.5L73.1 336.5L72.6 335.6L71.6 334.8L70.2 334.2L68.6 333.9L66.8 333.9L65.2 334.2L63.8 334.8L62.8 335.6L62.3 336.5L62.3 337.5L62.8 338.4L63.8 339.3L65.2 339.8L66.8 340.1L68.6 340.1L70.2 339.8Z" />
        <path class="art-well slot-stake" :class="{ 'slot-stake--spent': spent }" d="M82.8 350.8L83.9 349.9L84.4 349L84.4 348L83.9 347.1L82.8 346.3L81.5 345.7L79.8 345.4L78.1 345.4L76.4 345.7L75.1 346.3L74 347.1L73.5 348L73.5 349L74 349.9L75.1 350.8L76.4 351.3L78.1 351.6L79.8 351.6L81.5 351.3Z" />
        <path class="art-well slot-stake" :class="{ 'slot-stake--spent': spent }" d="M102.8 357.3L103.8 356.4L104.3 355.5L104.3 354.5L103.8 353.6L102.8 352.8L101.4 352.2L99.7 351.9L98 351.9L96.4 352.2L95 352.8L94 353.6L93.4 354.5L93.4 355.5L94 356.4L95 357.3L96.4 357.8L98 358.1L99.7 358.1L101.4 357.8Z" />
        <path class="art-well slot-stake" :class="{ 'slot-stake--spent': spent }" d="M114 368.8L115 367.9L115.6 367L115.6 366L115 365.1L114 364.3L112.6 363.7L111 363.4L109.3 363.4L107.6 363.7L106.2 364.3L105.2 365.1L104.7 366L104.7 367L105.2 367.9L106.2 368.8L107.6 369.3L109.3 369.6L111 369.6L112.6 369.3Z" />
        <path class="art-well slot-stake" :class="{ 'slot-stake--spent': spent }" d="M133.9 375.3L135 374.4L135.5 373.5L135.5 372.5L135 371.6L133.9 370.8L132.5 370.2L130.9 369.9L129.2 369.9L127.5 370.2L126.2 370.8L125.1 371.6L124.6 372.5L124.6 373.5L125.1 374.4L126.2 375.3L127.5 375.8L129.2 376.1L130.9 376.1L132.5 375.8Z" />
        <path d="M53.8 159L117.9 122L235.7 190L235.7 350L171.6 387L53.8 319Z" />
        <path class="art-edge" d="M53.8 159L171.6 227L235.7 190M171.6 227L171.6 387" />
        <path class="art-well" d="M164.7 257L164.3 254.5L163.2 251.9L161.5 249.6L159.5 248L66 194L64 193.3L62.3 193.6L61.2 194.9L60.8 197L60.8 263L61.2 265.5L62.3 268.1L64 270.4L66 272L159.5 326L161.5 326.7L163.2 326.4L164.3 325.1L164.7 323Z" />
        <path d="M91.9 221L91.7 219.3L90.9 217.6L89.8 216.1L88.5 215L69.4 204L68.1 203.5L67 203.8L66.2 204.6L66 206L66 260L66.2 261.7L67 263.4L68.1 264.9L69.4 266L88.5 277L89.8 277.5L90.9 277.2L91.7 276.4L91.9 275Z" />
        <path d="M125.7 240.5L125.5 238.8L124.7 237.1L123.6 235.6L122.3 234.5L103.2 223.5L101.9 223L100.8 223.3L100 224.1L99.7 225.5L99.7 279.5L100 281.2L100.8 282.9L101.9 284.4L103.2 285.5L122.3 296.5L123.6 297L124.7 296.7L125.5 295.9L125.7 294.5Z" />
        <path d="M159.5 260L159.2 258.3L158.5 256.6L157.4 255.1L156 254L137 243L135.6 242.5L134.5 242.8L133.8 243.6L133.5 245L133.5 299L133.8 300.7L134.5 302.4L135.6 303.9L137 305L156 316L157.4 316.5L158.5 316.2L159.2 315.4L159.5 314Z" />
        <path class="art-well" d="M138.7 327L138.5 325.7L137.9 324.4L137.1 323.3L136.1 322.5L103.2 303.5L102.2 303.2L101.4 303.3L100.8 304L100.6 305L100.6 305L100.8 306.3L101.4 307.6L102.2 308.7L103.2 309.5L136.1 328.5L137.1 328.8L137.9 328.7L138.5 328L138.7 327Z" />
        <path d="M62.5 306L163 364L154.3 373L53.8 315Z" />
        <path class="art-well" d="M163 357L162.8 355.7L162.2 354.4L161.4 353.3L160.4 352.5L65.1 297.5L64.1 297.2L63.3 297.3L62.7 298L62.5 299L62.5 307L62.7 308.3L63.3 309.6L64.1 310.7L65.1 311.5L160.4 366.5L161.4 366.8L162.2 366.7L162.8 366L163 365Z" />
        <path d="M41.7 150L116.2 107L247.8 183L247.8 191L173.3 234L41.7 158Z" />
        <path class="art-edge" d="M41.7 150L173.3 226L247.8 183M173.3 226L173.3 234" />
        <path d="M205.4 287.5L205.7 285L206.4 282.4L207.7 279.8L209.3 277.5L211.2 275.5L213.2 274L215.2 273.1L217.1 273L218.7 273.5L223.9 276.5L225.1 277.6L225.9 279.3L226.2 281.5L225.9 284L225.1 286.6L223.9 289.2L222.3 291.5L220.4 293.5L218.4 295L216.4 295.9L214.5 296L212.9 295.5L207.7 292.5L206.4 291.4L205.7 289.7Z" />
        <path d="M226.2 281.5L225.9 279.3L225.1 277.6L223.9 276.5L222.3 276L220.4 276.1L218.4 277L216.4 278.5L214.5 280.5L212.9 282.8L211.6 285.4L210.9 288L210.6 290.5L210.9 292.7L211.6 294.4L212.9 295.5L214.5 296L216.4 295.9L218.4 295L220.4 293.5L222.3 291.5L223.9 289.2L225.1 286.6L225.9 284Z" />
      </g>

      <!-- Swings in the plane of the side panel, so its knob is re-projected
           each frame rather than rotated flat on screen. -->
      <g class="slot-lever" :class="{ 'slot-lever--pulled': pulling }">
        <path class="slot-rod" :d="`M${LEVER_PIVOT[0]} ${LEVER_PIVOT[1]}L${knob[0]} ${knob[1]}`" />
        <circle :cx="knob[0]" :cy="knob[1]" r="5.5" />
      </g>

      <g class="slot-body">
        <path d="M67.7 151L67.9 145.3L68.7 139.9L69.9 134.9L71.6 130.3L73.8 126.3L76.5 122.7L79.5 119.7L82.9 117.4L136.6 86.4L140.4 84.6L144.5 83.4L148.9 82.9L153.5 83.1L158.3 83.9L163.2 85.3L168.3 87.3L173.3 90L178.4 93.2L183.5 97L188.4 101.3L193.2 106L197.8 111.2L202.2 116.8L206.3 122.7L210.1 128.8L213.5 135.1L216.6 141.6L219.2 148.2L221.4 154.8L223.1 161.3L224.3 167.7L225.1 174L225.3 180L171.6 211Z" />
        <path d="M67.7 151L67.9 145.3L68.7 139.9L69.9 134.9L71.6 130.3L73.8 126.3L76.5 122.7L79.5 119.7L82.9 117.4L86.7 115.6L90.8 114.4L95.2 113.9L99.8 114.1L104.6 114.9L109.5 116.3L114.6 118.3L119.7 121L124.7 124.2L129.8 128L134.7 132.3L139.5 137L144.1 142.2L148.5 147.8L152.6 153.7L156.4 159.8L159.8 166.1L162.9 172.6L165.5 179.2L167.7 185.8L169.4 192.3L170.6 198.7L171.4 205L171.6 211Z" />
        <path class="art-well" d="M78.1 157L78.3 152.4L78.9 148.1L79.9 144.1L81.3 140.5L83 137.2L85.1 134.4L87.5 132L90.3 130.1L93.3 128.7L96.6 127.8L100.1 127.4L103.7 127.5L107.6 128.1L111.5 129.2L115.6 130.9L119.7 133L123.7 135.6L127.8 138.6L131.7 142L135.6 145.8L139.3 150L142.7 154.4L146 159.1L149 164L151.8 169.1L154.2 174.3L156.3 179.5L158.1 184.8L159.4 190L160.4 195.2L161 200.2L161.2 205Z" />
        <path class="art-edge" d="M119.7 145L116.6 152.4L108.1 148L114.7 158L112.5 166.2L119.7 165L126.8 174.4L124.6 163.7L131.2 161.3L122.7 155.9Z" />
      </g>

      <g class="slot-lights">
        <circle
          v-for="(dot, i) in REEL_DOTS"
          :key="`reel-${i}`"
          v-show="dot.digits.includes(glyphs[dot.reel])"
          :class="{ 'slot-dot--rolling': rolling[dot.reel] }"
          :cx="dot.x"
          :cy="dot.y"
          r="1.6"
        />
        <circle
          v-for="(bulb, i) in BULBS"
          :key="`bulb-${i}`"
          :class="{ 'slot-dot--off': (bulb.step + phase) % 2 === 1 }"
          :cx="bulb.x"
          :cy="bulb.y"
          r="1.6"
        />
      </g>

      <g v-for="coin in coins" :key="coin.id" :transform="`translate(${coin.x} ${coin.y})`">
        <g
          class="slot-coin"
          :style="{
            '--dx': `${coin.dx}px`,
            '--dy': `${coin.dy}px`,
            '--peak': `${coin.peak}px`,
            '--delay': `${coin.delay}ms`,
          }"
        >
          <ellipse class="slot-coin-face" rx="4.5" ry="2.6" />
        </g>
      </g>
    </svg>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { prefersReducedMotion } from '../shared/motion'

interface Coin {
  id: number
  x: number
  y: number
  dx: number
  dy: number
  peak: number
  delay: number
}

/** The isometric projection the static geometry was generated with: u runs
 *  down-right along the front, v up-right into depth, h straight up. */
const COS_30 = Math.cos(Math.PI / 6)
function project(u: number, v: number, h: number): [number, number] {
  return [
    Math.round((14 + COS_30 * (u + v)) * 10) / 10,
    Math.round((330 + 0.5 * (u - v) - h) * 10) / 10,
  ]
}

const FINAL = ['4', '0', '4']
const REELS_U = [38, 77, 116]
const FRONT_V = 22

/** 5×7 dot-matrix glyphs, top row first. */
const FONT: Record<string, string[]> = {
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
}

/** Every dot position on each reel, tagged with the digits that light it, so a
 *  glyph change is a v-show flip rather than a re-render of the matrix. */
const REEL_DOTS = REELS_U.flatMap((reelU, reel) =>
  Array.from({ length: 35 }, (_, i) => {
    const row = Math.floor(i / 5)
    const col = i % 5
    const [x, y] = project(reelU + 6 + col * 4.5, FRONT_V, 126 - row * 7)
    const digits = Object.keys(FONT).filter(d => FONT[d][row][col] === '#')
    return { reel, x, y, digits }
  }).filter(dot => dot.digits.length > 0),
)

/** Marquee bulbs: two rows round the reel window, and an arc under the hood.
 *  Alternate bulbs are unlit; the chase flips which half is lit. */
const BULBS = [
  ...Array.from({ length: 13 }, (_, k) => [38 + k * 9, 140, k] as const),
  ...Array.from({ length: 13 }, (_, k) => [38 + k * 9, 70, k + 1] as const),
].map(([u, h, step]) => {
  const [x, y] = project(u, FRONT_V, h)
  return { x, y, step }
}).concat(Array.from({ length: 15 }, (_, i) => {
  const t = Math.PI * (i + 0.5) / 15
  const [x, y] = project(92 - 54 * Math.cos(t), 30, 180 + 54 * Math.sin(t))
  return { x, y, step: i }
}))

/** The lever pivots on the hub at u = 166 and its knob stands 10 further out.
 *  Within the side panel's v–h plane it starts tilted back and swings forward,
 *  toward the reader, to just past horizontal. */
const LEVER_PIVOT = project(166, 70, 92)
const LEVER_LENGTH = Math.hypot(18, 64)
const LEVER_REST = Math.atan2(64, 18)
const LEVER_SWEEP = (115 * Math.PI) / 180

const PULL_MS = 260
const RETURN_MS = 480
const TICK_MS = 70
const STOP_MS = [700, 1000, 1300]
const COIN_COUNT = 7
const COIN_GAP_MS = 90
/** Mirrors the coin-fly duration in the styles below. */
const COIN_FLY_MS = 720
const COIN_LIFE_MS = 2800

const glyphs = ref([...FINAL])
const rolling = ref([false, false, false])
const phase = ref(0)
const spinning = ref(false)
const pulling = ref(false)
const leverTurn = ref(0)
const knob = computed(() => {
  const angle = LEVER_REST + leverTurn.value * LEVER_SWEEP
  return project(176, 70 + LEVER_LENGTH * Math.cos(angle), 92 + LEVER_LENGTH * Math.sin(angle))
})
const coins = ref<Coin[]>([])
/** The five coins waiting on the base are the stake: a pull spends them, and
 *  they are back once the payout has cleared. */
const spent = ref(false)

let ticker: number | undefined
let frame: number | undefined
let timers: number[] = []
let coinSerial = 0

function later(fn: () => void, ms: number): void {
  const id = window.setTimeout(() => {
    timers = timers.filter(t => t !== id)
    fn()
  }, ms)
  timers.push(id)
}

/** Any digit but the one showing, so a rolling reel never looks stalled. */
function randomDigit(showing: string): string {
  const next = Math.floor(Math.random() * 9)
  return String(next >= Number(showing) ? next + 1 : next)
}

function pull(): void {
  if (spinning.value) return
  spinning.value = true
  spent.value = true

  if (prefersReducedMotion()) {
    payOut(true)
    later(() => { spinning.value = false }, COIN_LIFE_MS)
    return
  }

  coins.value = []
  pulling.value = true
  swingLever(1, PULL_MS, t => t * t)
  later(() => {
    pulling.value = false
    swingLever(0, RETURN_MS, t => 1 - (1 - t) ** 3)
    rolling.value = [true, true, true]
    ticker = window.setInterval(() => {
      phase.value = (phase.value + 1) % 2
      glyphs.value = glyphs.value.map((g, i) => (rolling.value[i] ? randomDigit(g) : g))
    }, TICK_MS)
  }, PULL_MS)

  STOP_MS.forEach((ms, reel) => {
    later(() => {
      rolling.value = rolling.value.map((r, i) => (i === reel ? false : r))
      glyphs.value = glyphs.value.map((g, i) => (i === reel ? FINAL[reel] : g))
    }, PULL_MS + ms)
  })

  const payoutAt = PULL_MS + STOP_MS[STOP_MS.length - 1] + 120
  later(() => {
    window.clearInterval(ticker)
    phase.value = 0
    payOut(false)
  }, payoutAt)

  // Stay busy until the last coin has landed, so a re-pull never wipes coins
  // that are still in the air.
  later(() => { spinning.value = false }, payoutAt + (COIN_COUNT - 1) * COIN_GAP_MS + COIN_FLY_MS)
}

/** Coins pop out of the payout slot, clear the tray lip and scatter across
 *  the base, landing at random on the same level as the staked coins. */
function payOut(still: boolean): void {
  const batch = coinSerial
  coins.value = Array.from({ length: COIN_COUNT }, (_, i) => {
    const startU = 84 + Math.random() * 32
    const landU = 42 + Math.random() * 100
    const [sx, sy] = project(startU, FRONT_V, 53)
    // The strip of base in front of the tray is thin: below v ≈ 8 a coin
    // overhangs the front edge and reads as falling off.
    const [lx, ly] = project(landU, 8.5 + Math.random() * 4.5, 12)
    return {
      id: coinSerial++,
      x: still ? lx : sx,
      y: still ? ly : sy,
      dx: still ? 0 : lx - sx,
      dy: still ? 0 : ly - sy,
      peak: -(8 + Math.random() * 8),
      delay: i * COIN_GAP_MS,
    }
  })
  later(() => {
    if (coins.value[0]?.id !== batch) return
    coins.value = []
    spent.value = false
  }, COIN_LIFE_MS + COIN_COUNT * COIN_GAP_MS)
}

/** Eases the lever between rest (0) and fully pulled (1). */
function swingLever(to: number, ms: number, ease: (t: number) => number): void {
  if (frame !== undefined) window.cancelAnimationFrame(frame)
  const from = leverTurn.value
  const start = performance.now()
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / ms)
    leverTurn.value = from + (to - from) * ease(t)
    frame = t < 1 ? window.requestAnimationFrame(step) : undefined
  }
  frame = window.requestAnimationFrame(step)
}

onBeforeUnmount(() => {
  if (frame !== undefined) window.cancelAnimationFrame(frame)
  window.clearInterval(ticker)
  timers.forEach(t => window.clearTimeout(t))
  timers = []
})
</script>

<style scoped>
.slot-machine {
  display: block;
  padding: 0;
  border: 0;
  border-radius: 0.5rem;
  background: none;
  color: inherit;
  cursor: var(--cursor-pointer);
}

.slot-machine--busy { cursor: var(--cursor-progress); }

.slot-machine:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.slot-machine svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

/* Hairline outlines over the subtle ground, wells cut back to the page colour:
   drawn the way the rest of the site is ruled. */
.slot-body > *,
.slot-lever > *,
.slot-coin-face {
  fill: var(--bg-subtle);
  stroke: var(--text-main);
  stroke-width: 1.1;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.slot-body > .art-edge { fill: none; }
.slot-body > .art-well { fill: var(--bg); }

.slot-stake { transition: opacity 240ms ease; }
.slot-stake--spent { opacity: 0; }
.slot-lever > .slot-rod { stroke-width: 2.4; }

.slot-lights { fill: var(--text-main); }
.slot-dot--off { opacity: 0.3; }
.slot-dot--rolling { opacity: 0.6; }

.slot-coin {
  opacity: 0;
  animation:
    coin-fly 720ms var(--delay) both,
    coin-fade 400ms calc(var(--delay) + 2200ms) ease forwards;
}

.slot-coin-face {
  transform-box: fill-box;
  transform-origin: center;
  animation: coin-flip 180ms var(--delay) linear 4;
}

@keyframes coin-fly {
  0% {
    opacity: 0;
    transform: translate(0, 0);
    animation-timing-function: cubic-bezier(0.2, 0.6, 0.4, 1);
  }
  8% { opacity: 1; }
  40% {
    transform: translate(calc(var(--dx) * 0.45), var(--peak));
    animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.5);
  }
  82% {
    transform: translate(var(--dx), var(--dy));
    animation-timing-function: ease-out;
  }
  91% {
    transform: translate(var(--dx), calc(var(--dy) - 3px));
    animation-timing-function: ease-in;
  }
  100% {
    opacity: 1;
    transform: translate(var(--dx), var(--dy));
  }
}

@keyframes coin-flip {
  50% { transform: scaleY(-1); }
}

@keyframes coin-fade {
  to { opacity: 0; }
}

/* No travel: the coins simply sit on the base until pull() clears them. The
   lever and reels are already skipped there. The sitewide reduce-motion rule
   collapses any animation to its final frame, which for coin-fade is opacity 0,
   so the coins are held still and visible instead (as CoffeeTime does). */
@media (prefers-reduced-motion: reduce) {
  .slot-stake { transition: none; }

  .slot-coin {
    animation: none;
    opacity: 1;
  }

  .slot-coin-face { animation: none; }
}
</style>
