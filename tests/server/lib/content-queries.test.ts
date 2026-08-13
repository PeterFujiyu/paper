import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPostFind = vi.hoisted(() => vi.fn())
const mockPostFindOne = vi.hoisted(() => vi.fn())
const mockBrewFind = vi.hoisted(() => vi.fn())
const mockBrewAggregate = vi.hoisted(() => vi.fn())

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
  default: { find: mockBrewFind, aggregate: mockBrewAggregate },
}))

import {
  findPublishedPost,
  invalidateShelfCache,
  listBrews,
  listPublishedPosts,
} from '../../../server/lib/content-queries.js'

describe('content queries used by MCP', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateShelfCache()
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

  it('aggregates the shelf once per window and again after a write', async () => {
    const lean = vi.fn().mockResolvedValue([])
    const limit = vi.fn().mockReturnValue({ lean })
    const select = vi.fn().mockReturnValue({ limit })
    const sort = vi.fn().mockReturnValue({ select })
    mockBrewFind.mockReturnValue({ sort })
    mockBrewAggregate.mockResolvedValue([{ _id: 'V60', count: 2, origins: ['Ethiopia'] }])

    const first = await listBrews({ limit: 5 })
    const second = await listBrews({ limit: 5 })

    // The brew list is re-read every call; only the whole-collection tally is held.
    expect(mockBrewFind).toHaveBeenCalledTimes(2)
    expect(mockBrewAggregate).toHaveBeenCalledTimes(1)
    expect(second.shelf).toEqual(first.shelf)
    expect(first.shelf).toEqual({ cups: 2, origins: 1, topMethod: 'V60' })

    invalidateShelfCache()
    await listBrews({ limit: 5 })
    expect(mockBrewAggregate).toHaveBeenCalledTimes(2)
  })

  it('does not hold a failed aggregation for the rest of the window', async () => {
    const lean = vi.fn().mockResolvedValue([])
    const limit = vi.fn().mockReturnValue({ lean })
    const select = vi.fn().mockReturnValue({ limit })
    const sort = vi.fn().mockReturnValue({ select })
    mockBrewFind.mockReturnValue({ sort })
    mockBrewAggregate
      .mockRejectedValueOnce(new Error('aggregation failed'))
      .mockResolvedValueOnce([])

    await expect(listBrews({ limit: 5 })).rejects.toThrow('aggregation failed')
    await expect(listBrews({ limit: 5 })).resolves.toMatchObject({
      shelf: { cups: 0, origins: 0, topMethod: '' },
    })
  })
})
