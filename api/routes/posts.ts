import { Hono } from 'hono'
import { connectDB } from '../lib/db'
import { getUser, requireAuth, type AppBindings } from '../lib/auth'
import { getRequestMeta } from '../lib/logger'
import Post from '../models/Post'

type PostBody = {
  title?: string
  slug?: string
  excerpt?: string
  content?: unknown
  published?: boolean
}

const posts = new Hono<AppBindings>()

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase()
}

function validatePostBody(body: PostBody): string | null {
  const title = body.title?.trim() ?? ''
  const slug = normalizeSlug(body.slug ?? '')
  const excerpt = body.excerpt?.trim() ?? ''
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

  if (!title) return 'Title is required.'
  if (title.length < 3) return 'Title must be at least 3 characters.'
  if (!slug) return 'Slug is required.'
  if (!slugPattern.test(slug)) return 'Slug must use lowercase letters, numbers, and hyphens only.'
  if (!excerpt) return 'Excerpt is required.'
  if (excerpt.length < 12) return 'Excerpt should be at least 12 characters.'
  if (body.content == null) return 'Body content is required.'
  if (typeof body.published !== 'undefined' && typeof body.published !== 'boolean') {
    return 'Published must be a boolean.'
  }

  return null
}

async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const query: Record<string, unknown> = { slug }
  if (excludeId) {
    query._id = { $ne: excludeId }
  }
  const existing = await Post.findOne(query).select('_id').lean()
  return !!existing
}

posts.get('/', async (ctx) => {
  try {
    await connectDB()
    const all = await Post.find({ published: true })
      .sort({ createdAt: -1 })
      .select('slug title excerpt createdAt')
      .lean()
    return ctx.json(all)
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[GET /posts] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

posts.get('/admin/all', requireAuth, async (ctx) => {
  try {
    await connectDB()
    const all = await Post.find()
      .sort({ createdAt: -1 })
      .select('slug title published createdAt')
      .lean()
    return ctx.json(all)
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[GET /posts/admin/all] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

posts.get('/admin/:id', requireAuth, async (ctx) => {
  try {
    await connectDB()
    const post = await Post.findById(ctx.req.param('id')).lean()
    if (!post) return ctx.json({ error: 'Not found' }, 404)
    return ctx.json(post)
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[GET /posts/admin/:id] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

posts.get('/admin/slug/check', requireAuth, async (ctx) => {
  try {
    await connectDB()
    const slug = normalizeSlug(ctx.req.query('slug') ?? '')
    const excludeId = ctx.req.query('excludeId') ?? undefined

    if (!slug) return ctx.json({ error: 'Slug is required.' }, 400)

    const exists = await slugExists(slug, excludeId)
    return ctx.json({ available: !exists })
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[GET /posts/admin/slug/check] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

posts.get('/:slug', async (ctx) => {
  try {
    await connectDB()
    const post = await Post.findOne({ slug: ctx.req.param('slug'), published: true }).lean()
    if (!post) return ctx.json({ error: 'Not found' }, 404)
    return ctx.json(post)
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[GET /posts/:slug] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

posts.post('/', requireAuth, async (ctx) => {
  try {
    await connectDB()
    const body = await ctx.req.json<PostBody>()
    const validationError = validatePostBody(body)
    if (validationError) return ctx.json({ error: validationError }, 400)

    const slug = normalizeSlug(body.slug ?? '')
    if (await slugExists(slug)) {
      return ctx.json({ error: 'Slug is already in use.' }, 409)
    }

    const post = await Post.create({
      ...body,
      title: body.title!.trim(),
      slug,
      excerpt: body.excerpt!.trim(),
      author: getUser(ctx).id,
    })
    return ctx.json(post, 201)
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[POST /posts] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

posts.put('/:id', requireAuth, async (ctx) => {
  try {
    await connectDB()
    const body = await ctx.req.json<PostBody>()
    const validationError = validatePostBody(body)
    if (validationError) return ctx.json({ error: validationError }, 400)

    const slug = normalizeSlug(body.slug ?? '')
    if (await slugExists(slug, ctx.req.param('id'))) {
      return ctx.json({ error: 'Slug is already in use.' }, 409)
    }

    const post = await Post.findByIdAndUpdate(
      ctx.req.param('id'),
      {
        $set: {
          ...body,
          title: body.title!.trim(),
          slug,
          excerpt: body.excerpt!.trim(),
        },
      },
      { new: true, runValidators: true }
    )
    if (!post) return ctx.json({ error: 'Not found' }, 404)
    return ctx.json(post)
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[PUT /posts/:id] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

posts.delete('/:id', requireAuth, async (ctx) => {
  try {
    await connectDB()
    await Post.findByIdAndDelete(ctx.req.param('id'))
    return ctx.json({ ok: true })
  } catch (error) {
    const { requestId } = getRequestMeta(ctx)
    console.error(`[DELETE /posts/:id] ${requestId}`, getErrorMessage(error))
    return ctx.json({ error: getErrorMessage(error) }, 500)
  }
})

export default posts
