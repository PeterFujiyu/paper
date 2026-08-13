import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPostFind = vi.hoisted(() => vi.fn())
const mockPostFindOne = vi.hoisted(() => vi.fn())

vi.mock('../../../server/models/Post.js', () => ({
  default: {
    find: mockPostFind,
    findOne: mockPostFindOne,
  },
}))

vi.mock('../../../server/models/Note.js', () => ({
  default: { find: vi.fn() },
}))

vi.mock('../../../server/models/Brew.js', () => ({
  default: { find: vi.fn(), aggregate: vi.fn() },
}))

import {
  findPublishedPost,
  listPublishedPosts,
} from '../../../server/lib/content-queries.js'

describe('content queries used by MCP', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters tags exactly and keeps the published condition in MongoDB', async () => {
    const lean = vi.fn().mockResolvedValue([])
    const limit = vi.fn().mockReturnValue({ lean })
    const select = vi.fn().mockReturnValue({ limit })
    const sort = vi.fn().mockReturnValue({ select })
    mockPostFind.mockReturnValue({ sort })

    await listPublishedPosts({ tag: 'craft.*', limit: 10 })

    expect(mockPostFind).toHaveBeenCalledWith({
      published: true,
      tags: /^craft\.\*$/i,
    })
    expect(limit).toHaveBeenCalledWith(10)
  })

  it('selects the private text projection only for a published full read', async () => {
    const lean = vi.fn().mockResolvedValue({ slug: 'on-craft', contentText: 'Body' })
    const select = vi.fn().mockReturnValue({ lean })
    mockPostFindOne.mockReturnValue({ select })

    await findPublishedPost('on-craft', { withText: true })

    expect(mockPostFindOne).toHaveBeenCalledWith({
      slug: 'on-craft',
      published: true,
    })
    expect(select).toHaveBeenCalledWith('+contentText')
  })
})
