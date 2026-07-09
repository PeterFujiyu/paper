import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'

const MIN_QUERY = 2
const DEBOUNCE_MS = 200

export interface DebouncedSearch<T> {
  query: Ref<string>
  results: Ref<T[]>
  searching: Ref<boolean>
  trimmedQuery: ComputedRef<string>
  isSearching: ComputedRef<boolean>
  displayItems: ComputedRef<T[]>
}

// Debounced, race-safe server search bound to a text query. While the trimmed
// query is shorter than MIN_QUERY the full `list` shows through unchanged; once
// it's long enough the query is debounced and sent to `${endpoint}?q=…`, and only
// the latest in-flight request may settle `searching` — stale ones are aborted and
// ignored. `displayItems` is what the template renders: search hits while
// searching, the full list otherwise. Mirrors the posts/notes search that
// previously lived twice in HomeView.
export function useDebouncedSearch<T>(endpoint: string, list: Ref<T[]>): DebouncedSearch<T> {
  const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

  const query = ref('')
  const results = ref<T[]>([]) as Ref<T[]>
  const searching = ref(false)

  const trimmedQuery = computed(() => query.value.trim())
  const isSearching = computed(() => trimmedQuery.value.length >= MIN_QUERY)
  const displayItems = computed(() => (isSearching.value ? results.value : list.value))

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let activeController: AbortController | undefined

  watch(trimmedQuery, (q) => {
    clearTimeout(debounceTimer)
    activeController?.abort()
    activeController = undefined

    if (q.length < MIN_QUERY) {
      searching.value = false
      results.value = []
      return
    }

    searching.value = true
    debounceTimer = setTimeout(() => void runSearch(q), DEBOUNCE_MS)
  })

  async function runSearch(q: string): Promise<void> {
    const controller = new AbortController()
    activeController = controller
    try {
      const res = await fetch(`${API_BASE}${endpoint}?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
      if (res.ok) results.value = await res.json() as T[]
    } catch (err) {
      if ((err as Error).name !== 'AbortError') results.value = []
    } finally {
      // Only the latest request may clear the pending flag; stale ones are ignored.
      if (activeController === controller) {
        searching.value = false
        activeController = undefined
      }
    }
  }

  onBeforeUnmount(() => {
    clearTimeout(debounceTimer)
    activeController?.abort()
  })

  return { query, results, searching, trimmedQuery, isSearching, displayItems }
}
