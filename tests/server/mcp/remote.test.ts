// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockListPublishedPosts = vi.hoisted(() => vi.fn())
const mockSearchPublishedPosts = vi.hoisted(() => vi.fn())
const mockFindPublishedPost = vi.hoisted(() => vi.fn())
const mockListNotes = vi.hoisted(() => vi.fn())
const mockListBrews = vi.hoisted(() => vi.fn())

vi.mock('../../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../../server/lib/content-queries.js', () => ({
  findPublishedPost: mockFindPublishedPost,
  listBrews: mockListBrews,
  listNotes: mockListNotes,
  listPublishedPosts: mockListPublishedPosts,
  searchPublishedPosts: mockSearchPublishedPosts,
}))

import { resetRateLimits } from '../../../server/lib/rate-limit.js'
import { paperMcpFetch } from '../../../server/mcp/server.js'

const clientMeta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'paper-test', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
}

type RpcResponse = {
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

async function requestMcp(
  method: string,
  params: Record<string, unknown> = {},
  options: { name?: string; headers?: Record<string, string> } = {},
): Promise<{ response: Response; body: RpcResponse }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': method,
    ...options.headers,
  }
  if (options.name) headers['Mcp-Name'] = options.name

  const response = await paperMcpFetch(new Request('https://paper.test/api/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: { ...params, _meta: clientMeta },
    }),
  }))

  return { response, body: await response.json() as RpcResponse }
}

async function callTool(
  name: string,
  args: Record<string, unknown> = {},
  headers?: Record<string, string>,
): Promise<{ response: Response; body: RpcResponse }> {
  return requestMcp('tools/call', { name, arguments: args }, { name, headers })
}

function toolPayload(body: RpcResponse): Record<string, unknown> {
  return body.result ?? {}
}

describe('remote Paper MCP server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimits()
    mockListPublishedPosts.mockResolvedValue([])
    mockSearchPublishedPosts.mockResolvedValue([])
    mockFindPublishedPost.mockResolvedValue(null)
    mockListNotes.mockResolvedValue([])
    mockListBrews.mockResolvedValue({
      brews: [],
      shelf: { cups: 0, origins: 0, topMethod: '' },
    })
  })

  it('advertises only the canonical read surface, in order, with public cache hints', async () => {
    const { response, body } = await requestMcp('tools/list')

    expect(response.status).toBe(200)
    expect((body.result?.tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual([
      'list_essays',
      'search_essays',
      'get_essay',
      'list_notes',
      'list_brews',
    ])
    expect(body.result).toMatchObject({ ttlMs: 60_000, cacheScope: 'public' })
    expect(JSON.stringify(body)).not.toContain('create_draft')
  })

  it('discovers the modern protocol with tools and resources only', async () => {
    const { body } = await requestMcp('server/discover')

    expect(body.result).toMatchObject({
      supportedVersions: ['2026-07-28'],
      capabilities: {
        tools: expect.any(Object),
        resources: expect.any(Object),
      },
      ttlMs: 60_000,
      cacheScope: 'public',
    })
    const capabilities = body.result?.capabilities as Record<string, unknown>
    expect(capabilities).not.toHaveProperty('roots')
    expect(capabilities).not.toHaveProperty('sampling')
    expect(capabilities).not.toHaveProperty('logging')
    expect(capabilities).not.toHaveProperty('tasks')
  })

  it('advertises the single essay resource template with public caching', async () => {
    const { body } = await requestMcp('resources/templates/list')

    expect(body.result).toMatchObject({
      resourceTemplates: [{
        uriTemplate: 'paper://essay/{slug}',
        name: 'essay',
        mimeType: 'text/plain',
      }],
      ttlMs: 60_000,
      cacheScope: 'public',
    })
  })

  it('lists shaped published essay summaries without private fields', async () => {
    mockListPublishedPosts.mockResolvedValue([{
      _id: 'post-internal-id',
      slug: 'on-craft',
      title: 'On Craft',
      excerpt: 'An essay about overlooked details.',
      coverImage: 'https://cdn.test/cover.jpg',
      tags: ['Craft'],
      readingMinutes: 7,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      viewCount: 10,
      readCompletionCount: 5,
      author: 'user-secret',
      readingMinutesOverride: 99,
    }])

    const { body } = await callTool('list_essays', { tag: ' craft ', limit: 10 })

    expect(mockListPublishedPosts).toHaveBeenCalledWith({ tag: 'craft', limit: 10 })
    expect(toolPayload(body).structuredContent).toEqual({
      essays: [{
        slug: 'on-craft',
        title: 'On Craft',
        excerpt: 'An essay about overlooked details.',
        tags: ['Craft'],
        readingMinutes: 7,
        createdAt: '2026-06-01T00:00:00.000Z',
        viewCount: 10,
        readCompletionCount: 5,
        readCompletionRate: 50,
      }],
      total: 1,
    })
    expect(JSON.stringify(toolPayload(body))).not.toMatch(
      /post-internal-id|user-secret|coverImage|readingMinutesOverride|contentText/,
    )
  })

  it('searches with the schema-trimmed query and the caller limit', async () => {
    await callTool('search_essays', { q: '  typography  ', limit: 3 })

    expect(mockSearchPublishedPosts).toHaveBeenCalledWith('typography', 3)
  })

  it('rejects schema-invalid arguments before a query runs', async () => {
    const { response, body } = await callTool('search_essays', { q: 'x'.repeat(101) })

    expect(response.status).toBe(200)
    expect(toolPayload(body).isError).toBe(true)
    expect(mockSearchPublishedPosts).not.toHaveBeenCalled()
  })

  it('returns a full essay as sanitized plain text and never increments views', async () => {
    mockFindPublishedPost.mockResolvedValue({
      _id: 'post-internal-id',
      slug: 'on-craft',
      title: 'On Craft',
      excerpt: 'An essay about overlooked details.',
      tags: ['Craft'],
      readingMinutes: 7,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      viewCount: 10,
      readCompletionCount: 5,
      contentText: '',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy body.' }] }],
      },
      author: 'user-secret',
      readingMinutesOverride: 12,
    })

    const { body } = await callTool('get_essay', { slug: 'ON-CRAFT' })

    expect(mockFindPublishedPost).toHaveBeenCalledWith('on-craft', { withText: true })
    expect(toolPayload(body).structuredContent).toEqual({
      slug: 'on-craft',
      title: 'On Craft',
      excerpt: 'An essay about overlooked details.',
      tags: ['Craft'],
      readingMinutes: 7,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      viewCount: 10,
      readCompletionCount: 5,
      readCompletionRate: 50,
      body: 'Legacy body.',
    })
    expect(JSON.stringify(toolPayload(body))).not.toMatch(
      /post-internal-id|user-secret|readingMinutesOverride|contentText|"content":\{/,
    )
  })

  it('hides missing and unpublished essays behind the same Not found result', async () => {
    const { body } = await callTool('get_essay', { slug: 'draft-essay' })

    expect(toolPayload(body)).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Not found' }],
      structuredContent: { error: 'Not found' },
    })
  })

  it('sanitizes note content before flattening it to text', async () => {
    mockListNotes.mockResolvedValue([
      {
        _id: 'note-1',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A small note.' }] }],
        },
        createdAt: '2026-07-01T00:00:00.000Z',
      },
      {
        _id: 'note-2',
        content: { type: 'doc', content: [{ type: 'script', content: [] }] },
        createdAt: '2026-07-02T00:00:00.000Z',
      },
    ])

    const { body } = await callTool('list_notes', { q: ' small ', limit: 2 })

    expect(mockListNotes).toHaveBeenCalledWith({ q: 'small', limit: 2 })
    expect(toolPayload(body).structuredContent).toEqual({
      notes: [
        { id: 'note-1', text: 'A small note.', createdAt: '2026-07-01T00:00:00.000Z' },
        { id: 'note-2', text: '', createdAt: '2026-07-02T00:00:00.000Z' },
      ],
    })
  })

  it('returns brew summaries and whole-shelf totals without searchText or ids', async () => {
    mockListBrews.mockResolvedValue({
      brews: [{
        _id: 'brew-internal-id',
        bean: 'Kochere',
        origin: 'Ethiopia',
        roaster: 'Passenger',
        method: 'V60',
        dose: 18,
        water: 300,
        temperature: 94,
        brewSeconds: 195,
        rating: 4,
        tastingNote: 'Jasmine.',
        pairedSlug: 'on-craft',
        createdAt: '2026-07-01T00:00:00.000Z',
        searchText: 'secret projection',
      }],
      shelf: { cups: 12, origins: 4, topMethod: 'V60' },
    })

    const { body } = await callTool('list_brews', { limit: 1 })

    expect(toolPayload(body).structuredContent).toEqual({
      brews: [{
        bean: 'Kochere',
        origin: 'Ethiopia',
        roaster: 'Passenger',
        method: 'V60',
        dose: 18,
        water: 300,
        temperature: 94,
        brewSeconds: 195,
        rating: 4,
        tastingNote: 'Jasmine.',
        pairedSlug: 'on-craft',
        createdAt: '2026-07-01T00:00:00.000Z',
      }],
      shelf: { cups: 12, origins: 4, topMethod: 'V60' },
    })
    expect(JSON.stringify(toolPayload(body))).not.toMatch(/brew-internal-id|searchText|secret projection/)
  })

  it('serves the essay resource with public caching and a -32602 miss', async () => {
    mockFindPublishedPost.mockResolvedValueOnce({
      slug: 'on-craft',
      title: 'On Craft',
      excerpt: 'An essay about overlooked details.',
      contentText: 'The full essay.',
    })

    const found = await requestMcp(
      'resources/read',
      { uri: 'paper://essay/on-craft' },
      { name: 'paper://essay/on-craft' },
    )

    expect(found.body.result).toMatchObject({
      contents: [{
        uri: 'paper://essay/on-craft',
        mimeType: 'text/plain',
        text: 'The full essay.',
      }],
      ttlMs: 60_000,
      cacheScope: 'public',
    })

    const missing = await requestMcp(
      'resources/read',
      { uri: 'paper://essay/missing' },
      { name: 'paper://essay/missing' },
    )
    expect(missing.body.error).toMatchObject({ code: -32602 })
  })

  it('masks unexpected infrastructure failures', async () => {
    mockListPublishedPosts.mockRejectedValue(new Error('mongodb://secret-host'))

    const { body } = await callTool('list_essays')

    expect(toolPayload(body)).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Request failed' }],
    })
    expect(JSON.stringify(body)).not.toContain('mongodb://secret-host')
  })

  it('rejects an invalid Origin before dispatch', async () => {
    const { response } = await requestMcp('tools/list', {}, {
      headers: { Origin: 'https://evil.test' },
    })

    expect(response.status).toBe(403)
    expect(mockConnectDB).not.toHaveBeenCalled()
  })

  it('rejects a localhost Origin unless the machine opts in', async () => {
    const previous = process.env.MCP_ALLOW_LOCALHOST_ORIGIN
    delete process.env.MCP_ALLOW_LOCALHOST_ORIGIN

    try {
      const closed = await requestMcp('tools/list', {}, {
        headers: { Origin: 'http://localhost:5173' },
      })
      expect(closed.response.status).toBe(403)

      process.env.MCP_ALLOW_LOCALHOST_ORIGIN = 'true'
      const opened = await requestMcp('tools/list', {}, {
        headers: { Origin: 'http://localhost:5173' },
      })
      expect(opened.response.status).toBe(200)
    } finally {
      if (previous === undefined) delete process.env.MCP_ALLOW_LOCALHOST_ORIGIN
      else process.env.MCP_ALLOW_LOCALHOST_ORIGIN = previous
    }
  })

  it('meters one caller and answers 429 with a Retry-After, without touching the DB', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.7' }

    // The burst is 30; the 31st call must not reach a query.
    for (let i = 0; i < 30; i += 1) {
      const { response } = await requestMcp('tools/list', {}, { headers })
      expect(response.status).toBe(200)
    }

    const limited = await requestMcp('tools/call', { name: 'list_essays', arguments: {} }, {
      name: 'list_essays',
      headers,
    })

    expect(limited.response.status).toBe(429)
    expect(Number(limited.response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(limited.body.error).toMatchObject({ code: -32000, message: 'Too many requests' })
    expect(mockListPublishedPosts).not.toHaveBeenCalled()

    // A different caller is unaffected.
    const other = await requestMcp('tools/list', {}, {
      headers: { 'x-forwarded-for': '198.51.100.4' },
    })
    expect(other.response.status).toBe(200)
  })

  it('rejects Mcp-Name mismatches with the protocol cross-check error', async () => {
    const { response, body } = await requestMcp(
      'tools/call',
      { name: 'list_essays', arguments: {} },
      { name: 'get_essay' },
    )

    expect(response.status).toBe(400)
    expect(body.error?.code).toBe(-32020)
  })

  it.each(['GET', 'DELETE'])('answers %s with 405 and never reads the admin cookie', async (method) => {
    const response = await paperMcpFetch(new Request('https://paper.test/api/mcp', {
      method,
      headers: { Cookie: 'pf_admin_session=should-not-matter' },
    }))

    expect(response.status).toBe(405)
    expect(mockConnectDB).not.toHaveBeenCalled()
  })

  it('serves the same public surface when an admin cookie is present', async () => {
    const { body } = await requestMcp('tools/list', {}, {
      headers: { Cookie: 'pf_admin_session=ignored' },
    })

    expect((body.result?.tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual([
      'list_essays',
      'search_essays',
      'get_essay',
      'list_notes',
      'list_brews',
    ])
  })
})
