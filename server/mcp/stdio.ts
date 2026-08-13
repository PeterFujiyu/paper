import 'dotenv/config'

import { serveStdio } from '@modelcontextprotocol/server/stdio'

import { registerAuthoringTools, resolveMcpAuthorId } from './authoring-tools.js'
import { createPaperMcpServer, LOCAL_MCP_CACHE_HINT } from './factory.js'

async function main(): Promise<void> {
  // Resolve the owner before opening stdin/stdout so a bad configuration fails
  // as a normal process error, not halfway through an MCP exchange.
  const authorId = await resolveMcpAuthorId()

  serveStdio(
    () => {
      const server = createPaperMcpServer({
        name: 'paper-author',
        cacheHint: LOCAL_MCP_CACHE_HINT,
      })
      registerAuthoringTools(server, authorId)
      return server
    },
    {
      onerror(error) {
        console.error('[mcp:stdio] transport error', error.message)
      },
    },
  )
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error'
  console.error('[mcp:stdio] startup failed', message)
  process.exitCode = 1
})
