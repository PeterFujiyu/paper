const CHECK_ORDER = [
  'behavior',
  'sanitizer',
  'auth',
  'client-session',
  'security-headers',
  'typecheck',
  'build',
]

const CHECK_LABELS = Object.freeze({
  behavior: '行为测试',
  sanitizer: '富文本清洗',
  auth: '认证',
  'client-session': '客户端会话',
  'security-headers': '安全头',
  typecheck: '类型检查',
  build: '生产构建',
})

export function resultCheckEntries(checks) {
  if (Array.isArray(checks)) {
    return checks
      .filter(check => check && typeof check.id === 'string')
      .map(check => [check.id, check])
  }
  return Object.entries(checks ?? {}).filter(([, check]) => check != null)
}

export function orderedResultCheckIds(...collections) {
  const observed = new Set()
  for (const checks of collections) {
    for (const [id] of resultCheckEntries(checks)) observed.add(id)
  }
  return [
    ...CHECK_ORDER.filter(id => observed.delete(id)),
    ...observed,
  ]
}

export function resultCheckLabel(id) {
  return CHECK_LABELS[id] ?? id
}

export function resultCheck(checks, id) {
  return resultCheckEntries(checks).find(([checkId]) => checkId === id)?.[1]
}
