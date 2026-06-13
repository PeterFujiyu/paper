export type PostMetricFields = {
  viewCount?: number | null
  readCompletionCount?: number | null
}

export type PostMetrics = {
  viewCount: number
  readCompletionCount: number
  readCompletionRate: number
}

function normalizeCount(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}

export function getPostMetrics(post: PostMetricFields): PostMetrics {
  const viewCount = normalizeCount(post.viewCount)
  const readCompletionCount = normalizeCount(post.readCompletionCount)
  const readCompletionRate =
    viewCount === 0
      ? 0
      : Math.min(100, Math.round((readCompletionCount / viewCount) * 100))

  return {
    viewCount,
    readCompletionCount,
    readCompletionRate,
  }
}

export function withPostMetrics<T extends PostMetricFields>(post: T): T & PostMetrics {
  return {
    ...post,
    ...getPostMetrics(post),
  }
}
