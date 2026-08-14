import {
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  ResourceNotFoundError,
  ResourceTemplate,
  type CacheHint,
  type CallToolResult,
} from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

import {
  findPublishedPost,
  listBrews,
  listNotes,
  listPublishedPosts,
  searchPublishedPosts,
  type PostSummaryLean,
} from '../lib/content-queries.js'
import { connectDB } from '../lib/db.js'
import {
  brewSchema,
  essayListSchema,
  essaySchema,
  noteSchema,
  plainTextEssayBody,
  shapeBrew,
  shapeEssay,
  shapeEssaySummary,
  shapeNote,
  slugSchema,
} from './content-contracts.js'

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
} as const

function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { error: message },
    isError: true,
  }
}

async function runReadTool(operation: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    await connectDB()
    return await operation()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[mcp] read tool failed', message)
    return errorResult('Request failed')
  }
}

/**
 * Shape a page of essays. Callers ask the database for one past the limit, so
 * `hasMore` is the fact that the extra row existed rather than a guess from a
 * full page — an archive holding exactly `limit` essays reports false.
 */
function essayListResult(posts: PostSummaryLean[], limit: number): CallToolResult {
  const hasMore = posts.length > limit
  const essays = posts.slice(0, limit).map(shapeEssaySummary)
  const structuredContent = {
    essays,
    returned: essays.length,
    hasMore,
  }
  const text = essays
    .map((essay) => (
      `${essay.slug} — ${essay.title} (${essay.readingMinutes} min, ${essay.createdAt}): ${essay.excerpt}`
    ))
    .join('\n')

  return {
    content: [{ type: 'text', text }],
    structuredContent,
  }
}

export function registerReadTools(
  server: McpServer,
  resourceCacheHint: CacheHint,
): void {
  server.registerTool(
    'list_essays',
    {
      description: 'Browse published Paper essays, newest first.',
      inputSchema: z.object({
        tag: z.string().trim().min(1).max(24).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      outputSchema: essayListSchema,
      annotations: READ_ANNOTATIONS,
    },
    async ({ tag, limit }) => runReadTool(async () => (
      // One past the page, so `hasMore` is observed rather than inferred.
      essayListResult(await listPublishedPosts({ tag, limit: limit + 1 }), limit)
    )),
  )

  server.registerTool(
    'search_essays',
    {
      description: 'Search published Paper essays by title, excerpt, tag, and full text.',
      inputSchema: z.object({
        q: z.string().trim().min(1).max(100),
        limit: z.number().int().min(1).max(20).default(20),
      }),
      outputSchema: essayListSchema,
      annotations: READ_ANNOTATIONS,
    },
    async ({ q, limit }) => runReadTool(async () => (
      essayListResult(await searchPublishedPosts(q, limit + 1), limit)
    )),
  )

  server.registerTool(
    'get_essay',
    {
      description: 'Read one published Paper essay in full as plain text.',
      inputSchema: z.object({ slug: slugSchema }),
      outputSchema: essaySchema,
      annotations: READ_ANNOTATIONS,
    },
    async ({ slug }) => runReadTool(async () => {
      const post = await findPublishedPost(slug, { withText: true })
      if (!post) return errorResult('Not found')

      const essay = shapeEssay(post)
      return {
        content: [{ type: 'text', text: `${essay.title}\n\n${essay.body}` }],
        structuredContent: essay,
      }
    }),
  )

  server.registerTool(
    'list_notes',
    {
      description: 'Read recent public Paper notes, optionally filtered by text.',
      inputSchema: z.object({
        q: z.string().trim().min(1).max(100).optional(),
        limit: z.number().int().min(1).max(30).default(20),
      }),
      outputSchema: z.object({ notes: z.array(noteSchema) }),
      annotations: READ_ANNOTATIONS,
    },
    async ({ q, limit }) => runReadTool(async () => {
      const notes = (await listNotes({ q, limit })).map((note) => shapeNote(note))
      return {
        content: [{
          type: 'text',
          text: notes.map((note) => `${note.createdAt} — ${note.text}`).join('\n'),
        }],
        structuredContent: { notes },
      }
    }),
  )

  server.registerTool(
    'list_brews',
    {
      description: 'Read Paper\'s public coffee log and whole-shelf totals.',
      inputSchema: z.object({
        q: z.string().trim().min(1).max(100).optional(),
        limit: z.number().int().min(1).max(30).default(20),
      }),
      outputSchema: z.object({
        brews: z.array(brewSchema),
        shelf: z.object({
          cups: z.number().int().nonnegative(),
          origins: z.number().int().nonnegative(),
          topMethod: z.string(),
        }),
      }),
      annotations: READ_ANNOTATIONS,
    },
    async ({ q, limit }) => runReadTool(async () => {
      const result = await listBrews({ q, limit })
      const brews = result.brews.map(shapeBrew)
      return {
        content: [{
          type: 'text',
          text: brews.map((brew) => (
            `${brew.createdAt} — ${brew.bean} (${brew.method}, ${brew.origin || 'origin not recorded'})`
          )).join('\n'),
        }],
        structuredContent: { brews, shelf: result.shelf },
      }
    }),
  )

  server.registerResource(
    'essay',
    new ResourceTemplate('paper://essay/{slug}', { list: undefined }),
    {
      title: 'Paper essay',
      mimeType: 'text/plain',
      cacheHint: resourceCacheHint,
    },
    async (uri, variables) => {
      try {
        // Held to the same slug schema as get_essay, so the two ways into one
        // essay agree on what a slug is — and a malformed URI costs no query.
        const value = variables.slug
        const slug = slugSchema.safeParse(Array.isArray(value) ? value[0] ?? '' : value ?? '')
        if (!slug.success) throw new ResourceNotFoundError(uri.href, 'Not found')

        await connectDB()
        const post = await findPublishedPost(slug.data, { withText: true })
        if (!post) throw new ResourceNotFoundError(uri.href, 'Not found')

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/plain',
            text: plainTextEssayBody(post),
          }],
        }
      } catch (error) {
        if (error instanceof ResourceNotFoundError) throw error
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[mcp] resource read failed', message)
        throw new ProtocolError(ProtocolErrorCode.InternalError, 'Request failed')
      }
    },
  )
}
