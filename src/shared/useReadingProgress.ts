import { computed, onBeforeUnmount, ref, type Ref } from 'vue'

// Tracks how far the reader has scrolled through `articleRef`. Exposes a 0–1
// `readProgress` (drives the goal-gradient bar) and a rounded `readPercent`, and
// fires `onThreshold` on every update once progress passes `threshold` — the
// caller is expected to guard against duplicate reporting. One rAF-batched
// scroll/resize pass drives both the bar and the threshold signal. Extracted from
// PostView; the view owns start/stop/reset around each post load.
export function useReadingProgress(
  articleRef: Ref<HTMLElement | null>,
  onThreshold: () => void,
  threshold = 0.9,
) {
  const readProgress = ref(0)
  const readPercent = computed(() => Math.round(readProgress.value * 100))
  let scrollFrame: number | null = null

  function scheduleUpdate(): void {
    if (scrollFrame !== null) return
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null
      update()
    })
  }

  function update(): void {
    const article = articleRef.value
    if (!article) return

    const articleTop = article.offsetTop
    const articleHeight = article.offsetHeight
    const viewportBottom = window.scrollY + window.innerHeight
    const progress = articleHeight <= window.innerHeight
      ? 1
      : (viewportBottom - articleTop) / articleHeight
    const clamped = Math.min(Math.max(progress, 0), 1)

    readProgress.value = clamped

    if (clamped >= threshold) onThreshold()
  }

  function start(): void {
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    scheduleUpdate()
  }

  function stop(): void {
    window.removeEventListener('scroll', scheduleUpdate)
    window.removeEventListener('resize', scheduleUpdate)
    if (scrollFrame !== null) {
      window.cancelAnimationFrame(scrollFrame)
      scrollFrame = null
    }
  }

  function reset(): void {
    readProgress.value = 0
  }

  onBeforeUnmount(stop)

  return { readProgress, readPercent, start, stop, reset }
}
