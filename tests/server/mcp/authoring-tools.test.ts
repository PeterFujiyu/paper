import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryTransport, McpServer, type JSONRPCMessage } from '@modelcontextprotocol/server'

const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockPostFindOne = vi.hoisted(() => vi.fn())
const mockPostCreate = vi.hoisted(() => vi.fn())
const mockPostFindByIdAndUpdate = vi.hoisted(() => vi.fn())
const mockPostFindOneAndUpdate = vi.hoisted(() => vi.fn())
const mockPostFindById = vi.hoisted(() => vi.fn())
const mockNoteCreate = vi.hoisted(() => vi.fn())
const mockBrewCreate = vi.hoisted(() => vi.fn())
const mockUserFindById = vi.hoisted(() => vi.fn())

vi.mock('../../../server/lib/db.js', () => ({
  connectDB: mockConnectDB,
}))

vi.mock('../../../server/models/Post.js', () => ({
  default: {
    findOne: mockPostFindOne,
    findById: mockPostFindById,
    create: mockPostCreate,
    findByIdAndUpdate: mockPostFindByIdAndUpdate,
    findOneAndUpdate: mockPostFindOneAndUpdate,
  },
}))

vi.mock('../../../server/models/Note.js', () => ({
  default: { create: mockNoteCreate },
}))

vi.mock('../../../server/models/Brew.js', () => ({
  default: { create: mockBrewCreate },
}))

vi.mock('../../../server/models/User.js', () => ({
  default: { findById: mockUserFindById },
}))

import {
  registerAuthoringTools,
  resolveMcpAuthorId,
} from '../../../server/mcp/authoring-tools.js'
import {
  createPaperMcpServer,
  LOCAL_MCP_CACHE_HINT,
} from '../../../server/mcp/factory.js'

type JsonRpcResponse = {
  id: string | number
  result?: unknown
  error?: unknown
}

type ToolResult = {
  content: Array<{ type: string; text?: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

const essayContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'hello world' }],
    },
  ],
}

const essayArgs = {
  title: 'On Craft',
  excerpt: 'A long enough excerpt.',
  content: essayContent,
  tags: ['Craft'],
  readingMinutesOverride: 0,
}

function queryResult(value: unknown): {
  lean: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
} {
  const lean = vi.fn().mockResolvedValue(value)
  const select = vi.fn().mockReturnValue({ lean })
  return { lean, select }
}

function updateResult(value: unknown): { lean: ReturnType<typeof vi.fn> } {
  return { lean: vi.fn().mockResolvedValue(value) }
}

function documentResult(value: Record<string, unknown>): { toObject: () => Record<string, unknown> } {
  return { toObject: () => value }
}

class McpTestClient {
  private readonly pending = new Map<string | number, (response: JsonRpcResponse) => void>()
  private nextId = 1

  constructor(private readonly transport: InMemoryTransport) {
    transport.onmessage = (message: JSONRPCMessage) => {
      if (!('id' in message) || message.id == null) return
      const resolve = this.pending.get(message.id)
      if (!resolve) return
      this.pending.delete(message.id)
      resolve(message as JsonRpcResponse)
    }
  }

  async start(server: McpServer, serverTransport: InMemoryTransport): Promise<void> {
    await this.transport.start()
    await server.connect(serverTransport)
    await this.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'paper-test', version: '1.0.0' },
    })
    await this.transport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })
  }

  async request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId
    this.nextId += 1

    const response = new Promise<JsonRpcResponse>((resolve) => {
      this.pending.set(id, resolve)
    })
    await this.transport.send({ jsonrpc: '2.0', id, method, params })
    return response
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const response = await this.request('tools/call', { name, arguments: args })
    expect(response.error).toBeUndefined()
    return response.result as ToolResult
  }
}

describe('stdio MCP authoring tools', () => {
  let server: McpServer
  let client: McpTestClient

  beforeEach(async () => {
    vi.clearAllMocks()
    mockConnectDB.mockResolvedValue(undefined)

    server = createPaperMcpServer({
      name: 'paper-author-test',
      cacheHint: LOCAL_MCP_CACHE_HINT,
    })
    registerAuthoringTools(server, 'author-1')
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new McpTestClient(clientTransport)
    await client.start(server, serverTransport)
  })

  afterEach(async () => {
    await server.close()
  })

  it('registers the five read tools then the five authoring tools in canonical order', async () => {
    const response = await client.request('tools/list', {})
    const tools = (response.result as { tools: Array<Record<string, unknown>> }).tools

    expect(LOCAL_MCP_CACHE_HINT).toEqual({ ttlMs: 0, cacheScope: 'private' })
    expect(tools.map((tool) => tool.name)).toEqual([
      'list_essays',
      'search_essays',
      'get_essay',
      'list_notes',
      'list_brews',
      'create_draft',
      'update_essay',
      'publish_essay',
      'add_note',
      'log_brew',
    ])
    expect(tools.slice(0, 5).map((tool) => tool.annotations)).toEqual(
      Array.from({ length: 5 }, () => ({ readOnlyHint: true, idempotentHint: true })),
    )
    expect(tools.slice(5).map((tool) => tool.annotations)).toEqual([
      { readOnlyHint: false },
      { readOnlyHint: false },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      { readOnlyHint: false },
      { readOnlyHint: false },
    ])
    // Nothing this surface writes reaches the site on its own; publish_essay
    // is the only tool that changes what a reader can see.
    expect(tools.find((tool) => tool.name === 'add_note')?.description).toContain(
      'unpublished draft',
    )
    expect(tools.find((tool) => tool.name === 'log_brew')?.description).toContain(
      'unpublished draft',
    )
    expect(tools.find((tool) => tool.name === 'update_essay')?.description).toContain(
      'allowPublished',
    )
  })

  it('creates an unpublished draft with a derived slug and only public result fields', async () => {
    mockPostFindOne.mockReturnValueOnce(queryResult(null))
    mockPostCreate.mockResolvedValueOnce(documentResult({
      _id: 'post-1',
      slug: 'on-craft',
      title: 'On Craft',
      excerpt: 'A long enough excerpt.',
      tags: ['Craft'],
      content: essayContent,
      contentText: 'hello world',
      readingMinutes: 1,
      readingMinutesOverride: 0,
      published: false,
      author: 'author-1',
      viewCount: 4,
      readCompletionCount: 2,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    }))

    const result = await client.callTool('create_draft', {
      ...essayArgs,
      published: true,
      author: 'attacker',
    })

    expect(mockConnectDB).toHaveBeenCalledTimes(1)
    expect(mockPostFindOne).toHaveBeenCalledWith({ slug: 'on-craft' })
    expect(mockPostCreate).toHaveBeenCalledWith({
      title: 'On Craft',
      slug: 'on-craft',
      excerpt: 'A long enough excerpt.',
      coverImage: '',
      tags: ['Craft'],
      content: essayContent,
      contentText: 'hello world',
      readingMinutes: 1,
      readingMinutesOverride: 0,
      published: false,
      author: 'author-1',
    })
    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toEqual({
      slug: 'on-craft',
      title: 'On Craft',
      excerpt: 'A long enough excerpt.',
      tags: ['Craft'],
      readingMinutes: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
      viewCount: 4,
      readCompletionCount: 2,
      readCompletionRate: 50,
      body: 'hello world',
      published: false,
    })
    expect(JSON.stringify(result)).not.toMatch(
      /author|contentText|readingMinutesOverride|"_id"/,
    )
  })

  it('asks for a slug when the title cannot produce one', async () => {
    const cjk = await client.callTool('create_draft', { ...essayArgs, title: '论手艺' })

    expect(cjk).toMatchObject({
      isError: true,
      content: [{
        type: 'text',
        text: 'Could not derive a usable slug from that title. Pass slug explicitly.',
      }],
    })
    expect(mockPostFindOne).not.toHaveBeenCalled()
    expect(mockPostCreate).not.toHaveBeenCalled()

    // The same title with a slug supplied goes through.
    mockPostFindOne.mockReturnValueOnce(queryResult(null))
    mockPostCreate.mockResolvedValueOnce(documentResult({
      _id: 'post-1',
      slug: 'on-craft',
      title: '论手艺',
      excerpt: 'A long enough excerpt.',
    }))

    const withSlug = await client.callTool('create_draft', {
      ...essayArgs,
      title: '论手艺',
      slug: 'on-craft',
    })

    expect(withSlug.isError).toBeUndefined()
    expect(mockPostCreate).toHaveBeenCalledWith(expect.objectContaining({ slug: 'on-craft' }))
  })

  it('rejects missing content before an authoring handler or mutation runs', async () => {
    const draft = await client.callTool('create_draft', {
      title: essayArgs.title,
      excerpt: essayArgs.excerpt,
    })
    const note = await client.callTool('add_note', {})

    expect(draft.isError).toBe(true)
    expect(note.isError).toBe(true)
    expect(mockConnectDB).not.toHaveBeenCalled()
    expect(mockPostFindOne).not.toHaveBeenCalled()
    expect(mockPostCreate).not.toHaveBeenCalled()
    expect(mockNoteCreate).not.toHaveBeenCalled()
  })

  it('returns the public duplicate-slug message for a create race', async () => {
    mockPostFindOne.mockReturnValueOnce(queryResult(null))
    mockPostCreate.mockRejectedValueOnce({ code: 11000, keyPattern: { slug: 1 } })

    const result = await client.callTool('create_draft', essayArgs)

    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Slug is already in use.' }],
      structuredContent: { error: 'Slug is already in use.' },
    })
  })

  it('refuses to edit a published essay unless the caller allows it', async () => {
    mockPostFindOne.mockReturnValueOnce(queryResult({ _id: 'post-1', published: true }))

    const refused = await client.callTool('update_essay', { slug: 'on-craft', ...essayArgs })

    expect(refused).toMatchObject({
      isError: true,
      content: [{
        type: 'text',
        text: 'That essay is published. Pass allowPublished: true to edit live content.',
      }],
    })
    expect(mockPostFindOneAndUpdate).not.toHaveBeenCalled()

    // The same call with the flag goes through, and leaves it published. The
    // filter drops the draft condition, which is what the flag buys.
    mockPostFindOne
      .mockReturnValueOnce(queryResult({ _id: 'post-1', published: true }))
      .mockReturnValueOnce(queryResult(null))
    mockPostFindOneAndUpdate.mockReturnValueOnce(updateResult({
      _id: 'post-1',
      slug: 'on-craft',
      title: 'On Craft',
      excerpt: 'A long enough excerpt.',
      published: true,
    }))

    const allowed = await client.callTool('update_essay', {
      slug: 'on-craft',
      allowPublished: true,
      ...essayArgs,
    })

    expect(allowed.isError).toBeUndefined()
    expect(allowed.structuredContent).toMatchObject({ published: true })
    expect(mockPostFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'post-1' },
      expect.anything(),
      { new: true, runValidators: true },
    )
  })

  it('refuses an essay published between the check and the write', async () => {
    mockPostFindOne
      // A draft when read...
      .mockReturnValueOnce(queryResult({ _id: 'post-1', published: false }))
      .mockReturnValueOnce(queryResult(null))
    // ...but the guarded update matches nothing, because it went live meanwhile.
    mockPostFindOneAndUpdate.mockReturnValueOnce(updateResult(null))
    // The essay is still there, so the miss was the guard, not a deletion.
    mockPostFindById.mockReturnValueOnce(queryResult({ _id: 'post-1' }))

    const result = await client.callTool('update_essay', { slug: 'on-craft', ...essayArgs })

    expect(mockPostFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'post-1', published: { $ne: true } },
      expect.anything(),
      { new: true, runValidators: true },
    )
    expect(result).toMatchObject({
      isError: true,
      content: [{
        type: 'text',
        text: 'That essay is published. Pass allowPublished: true to edit live content.',
      }],
    })
  })

  it('says Not found when the essay was deleted rather than published', async () => {
    mockPostFindOne
      .mockReturnValueOnce(queryResult({ _id: 'post-1', published: false }))
      .mockReturnValueOnce(queryResult(null))
    // The guarded update matches nothing, same as the publish race...
    mockPostFindOneAndUpdate.mockReturnValueOnce(updateResult(null))
    // ...but the essay is gone, not live, so the answer must differ.
    mockPostFindById.mockReturnValueOnce(queryResult(null))

    const result = await client.callTool('update_essay', { slug: 'on-craft', ...essayArgs })

    expect(mockPostFindById).toHaveBeenCalledWith('post-1')
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Not found' }],
    })
  })

  it('fully replaces editable essay fields without changing publication state', async () => {
    mockPostFindOne
      .mockReturnValueOnce(queryResult({ _id: 'post-1', published: false }))
      .mockReturnValueOnce(queryResult(null))
    // A draft, and still a draft afterwards: the guarded filter only matches
    // `published != true` and the $set never mentions the field, so this is the
    // document such an update can actually return.
    mockPostFindOneAndUpdate.mockReturnValueOnce(updateResult({
      _id: 'post-1',
      slug: 'craft-revised',
      title: 'On Craft',
      excerpt: 'A long enough excerpt.',
      tags: ['Craft'],
      readingMinutes: 1,
      published: false,
      viewCount: 10,
      readCompletionCount: 3,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    }))

    const result = await client.callTool('update_essay', {
      slug: 'On-Craft',
      newSlug: 'Craft-Revised',
      ...essayArgs,
    })

    expect(mockPostFindOne).toHaveBeenNthCalledWith(1, { slug: 'on-craft' })
    expect(mockPostFindOne).toHaveBeenNthCalledWith(2, {
      slug: 'craft-revised',
      _id: { $ne: 'post-1' },
    })
    expect(mockPostFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'post-1', published: { $ne: true } },
      {
        $set: {
          title: 'On Craft',
          slug: 'craft-revised',
          excerpt: 'A long enough excerpt.',
          coverImage: '',
          tags: ['Craft'],
          content: essayContent,
          contentText: 'hello world',
          readingMinutes: 1,
          readingMinutesOverride: 0,
        },
      },
      { new: true, runValidators: true },
    )
    expect(result.structuredContent).toEqual(expect.objectContaining({
      slug: 'craft-revised',
      published: false,
      body: 'hello world',
    }))
  })

  it('publishes or unpublishes one essay without changing any other field', async () => {
    mockPostFindOneAndUpdate.mockReturnValueOnce(updateResult({
      slug: 'on-craft',
      title: 'On Craft',
      published: false,
    }))

    const result = await client.callTool('publish_essay', {
      slug: 'On-Craft',
      published: false,
    })

    expect(mockPostFindOneAndUpdate).toHaveBeenCalledWith(
      { slug: 'on-craft' },
      { $set: { published: false } },
      { new: true, runValidators: true },
    )
    expect(result.structuredContent).toEqual({
      slug: 'on-craft',
      title: 'On Craft',
      published: false,
      url: '/writing/on-craft',
    })
  })

  it('adds a sanitized note as a draft rather than publishing it', async () => {
    mockNoteCreate.mockResolvedValueOnce(documentResult({
      _id: 'note-1',
      content: essayContent,
      contentText: 'hello world',
      published: false,
      createdAt: new Date('2026-08-04T00:00:00.000Z'),
    }))

    const result = await client.callTool('add_note', { content: essayContent })

    expect(mockNoteCreate).toHaveBeenCalledWith({
      content: essayContent,
      contentText: 'hello world',
      published: false,
    })
    expect(result.structuredContent).toEqual({
      id: 'note-1',
      text: 'hello world',
      createdAt: '2026-08-04T00:00:00.000Z',
      published: false,
    })
    expect(result.content[0].text).toContain('Note drafted')
  })

  it('logs a normalized brew as a draft, off the log and off the shelf', async () => {
    mockBrewCreate.mockImplementationOnce(async (value: Record<string, unknown>) => documentResult({
      _id: 'brew-1',
      ...value,
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
    }))

    const result = await client.callTool('log_brew', {
      bean: '  Kochere  ',
      method: 'V60',
      origin: 'Ethiopia',
    })

    expect(mockBrewCreate).toHaveBeenCalledWith(expect.objectContaining({
      bean: 'Kochere',
      method: 'V60',
      origin: 'Ethiopia',
      dose: 0,
      water: 0,
      temperature: 0,
      brewSeconds: 0,
      rating: 0,
      published: false,
    }))
    expect(result.structuredContent).toEqual({
      bean: 'Kochere',
      origin: 'Ethiopia',
      roaster: '',
      method: 'V60',
      dose: 0,
      water: 0,
      temperature: 0,
      brewSeconds: 0,
      rating: 0,
      tastingNote: '',
      pairedSlug: '',
      createdAt: '2026-08-05T00:00:00.000Z',
      published: false,
    })
    expect(result.content[0].text).toContain('Brew drafted')
    expect(JSON.stringify(result)).not.toMatch(/brew-1|searchText/)
  })

  it('masks unexpected infrastructure failures', async () => {
    mockConnectDB.mockRejectedValueOnce(new Error('mongodb://secret-host'))

    const result = await client.callTool('create_draft', essayArgs)

    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Request failed' }],
      structuredContent: { error: 'Request failed' },
    })
    expect(JSON.stringify(result)).not.toContain('secret-host')
  })

  it('preserves domain error messages across the authoring surface', async () => {
    mockPostFindOne
      .mockReturnValueOnce(queryResult(null))
      .mockReturnValueOnce(queryResult({ _id: 'post-1' }))
      .mockReturnValueOnce(queryResult({ _id: 'post-2' }))
    mockPostFindOneAndUpdate.mockReturnValueOnce(updateResult(null))

    const missingUpdate = await client.callTool('update_essay', {
      slug: 'missing-essay',
      ...essayArgs,
    })
    const duplicateUpdate = await client.callTool('update_essay', {
      slug: 'on-craft',
      newSlug: 'already-used',
      ...essayArgs,
    })
    const missingPublish = await client.callTool('publish_essay', {
      slug: 'missing-essay',
    })
    const emptyNote = await client.callTool('add_note', {
      content: { type: 'doc', content: [] },
    })
    const emptyBean = await client.callTool('log_brew', {
      bean: '   ',
      method: 'V60',
    })

    expect(missingUpdate.content[0].text).toBe('Not found')
    expect(duplicateUpdate.content[0].text).toBe('Slug is already in use.')
    expect(missingPublish.content[0].text).toBe('Not found')
    expect(mockPostFindOneAndUpdate).toHaveBeenCalledWith(
      { slug: 'missing-essay' },
      { $set: { published: true } },
      { new: true, runValidators: true },
    )
    expect(emptyNote.content[0].text).toBe('Note cannot be empty.')
    expect(emptyBean.content[0].text).toBe('Bean is required.')
    for (const result of [
      missingUpdate,
      duplicateUpdate,
      missingPublish,
      emptyNote,
      emptyBean,
    ]) {
      expect(result.isError).toBe(true)
    }
  })
})

describe('resolveMcpAuthorId', () => {
  const previousAuthorId = process.env.MCP_AUTHOR_ID

  beforeEach(() => {
    vi.clearAllMocks()
    mockConnectDB.mockResolvedValue(undefined)
    delete process.env.MCP_AUTHOR_ID
  })

  afterEach(() => {
    if (previousAuthorId === undefined) delete process.env.MCP_AUTHOR_ID
    else process.env.MCP_AUTHOR_ID = previousAuthorId
  })

  it('fails before connecting when MCP_AUTHOR_ID is missing', async () => {
    await expect(resolveMcpAuthorId()).rejects.toThrow('MCP_AUTHOR_ID is not configured')
    expect(mockConnectDB).not.toHaveBeenCalled()
  })

  it('fails startup when MCP_AUTHOR_ID does not name a user', async () => {
    process.env.MCP_AUTHOR_ID = 'missing-user'
    mockUserFindById.mockReturnValueOnce(queryResult(null))

    await expect(resolveMcpAuthorId()).rejects.toThrow(
      'MCP_AUTHOR_ID does not match an existing user',
    )
  })

  it('returns the canonical stored user id after validating it', async () => {
    process.env.MCP_AUTHOR_ID = '  author-1  '
    mockUserFindById.mockReturnValueOnce(queryResult({ _id: 'canonical-author-1' }))

    await expect(resolveMcpAuthorId()).resolves.toBe('canonical-author-1')
    expect(mockConnectDB).toHaveBeenCalledTimes(1)
    expect(mockUserFindById).toHaveBeenCalledWith('author-1')
  })
})
