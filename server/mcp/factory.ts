import { McpServer, type CacheHint } from '@modelcontextprotocol/server'

import { registerReadTools } from './read-tools.js'

/**
 * The version this MCP surface advertises to clients — the tool and resource
 * contract, not the npm package (which sits at 0.0.0 and would tell a client
 * nothing). Bump it when the contract changes shape.
 *
 * Deliberately a literal: importing package.json here was the only such import
 * in the codebase, and vercel.json ships `server/**` to the function without
 * it, so the deployed endpoint depended on the bundler inlining that JSON.
 */
const MCP_SERVER_VERSION = '1.0.0'

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
    { name: options.name ?? 'paper', version: MCP_SERVER_VERSION },
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
