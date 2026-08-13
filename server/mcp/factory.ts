import { McpServer, type CacheHint } from '@modelcontextprotocol/server'

import packageJson from '../../package.json' with { type: 'json' }
import { registerReadTools } from './read-tools.js'

export const PUBLIC_MCP_CACHE_HINT = {
  ttlMs: 60_000,
  cacheScope: 'public',
} satisfies CacheHint

export const LOCAL_MCP_CACHE_HINT = {
  ttlMs: 0,
  cacheScope: 'private',
} satisfies CacheHint

type PaperMcpServerOptions = {
  name?: string
  cacheHint?: CacheHint
}

export function createPaperMcpServer(
  options: PaperMcpServerOptions = {},
): McpServer {
  const cacheHint = options.cacheHint ?? PUBLIC_MCP_CACHE_HINT
  const server = new McpServer(
    { name: options.name ?? 'paper', version: packageJson.version },
    {
      cacheHints: {
        'server/discover': cacheHint,
        'tools/list': cacheHint,
        'resources/list': cacheHint,
        'resources/templates/list': cacheHint,
        'resources/read': cacheHint,
      },
    },
  )

  registerReadTools(server, cacheHint)
  return server
}
