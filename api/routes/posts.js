import { Hono } from 'hono'
import { connectDB } from '../lib/db.js'
import { requireAuth } from '../lib/auth.js'
import Post from '../models/Post.js'

const posts = new Hono()

// ─── Public ───────────────────────────────────────────────

// GET /api/posts
posts.get('/', async (ctx) => {
  try {
    await connectDB()
    const all = await Post.find({ published: true })
      .sort({ createdAt: -1 })
      .select('slug title excerpt createdAt')
      .lean()
    return ctx.json(all)
  } catch (e) {
    console.error('[GET /posts]', e.message)
    return ctx.json({ error: e.message }, 500)
  }
})

// GET /api/posts/admin/all  — must come BEFORE /:slug
posts.get('/admin/all', requireAuth, async (ctx) => {
  try {
    await connectDB()
    const all = await Post.find()
      .sort({ createdAt: -1 })
      .select('slug title published createdAt')
      .lean()
    return ctx.json(all)
  } catch (e) {
    console.error('[GET /posts/admin/all]', e.message)
    return ctx.json({ error: e.message }, 500)
  }
})

// GET /api/posts/admin/:id
posts.get('/admin/:id', requireAuth, async (ctx) => {
  try {
    await connectDB()
    const post = await Post.findById(ctx.req.param('id')).lean()
    if (!post) return ctx.json({ error: 'Not found' }, 404)
    return ctx.json(post)
  } catch (e) {
    console.error('[GET /posts/admin/:id]', e.message)
    return ctx.json({ error: e.message }, 500)
  }
})

// GET /api/posts/:slug
posts.get('/:slug', async (ctx) => {
  try {
    await connectDB()
    const post = await Post.findOne({ slug: ctx.req.param('slug'), published: true }).lean()
    if (!post) return ctx.json({ error: 'Not found' }, 404)
    return ctx.json(post)
  } catch (e) {
    console.error('[GET /posts/:slug]', e.message)
    return ctx.json({ error: e.message }, 500)
  }
})

// POST /api/posts
posts.post('/', requireAuth, async (ctx) => {
  try {
    await connectDB()
    const body = await ctx.req.json()
    const post = await Post.create({ ...body, author: ctx.get('user').id })
    return ctx.json(post, 201)
  } catch (e) {
    console.error('[POST /posts]', e.message)
    return ctx.json({ error: e.message }, 500)
  }
})

// PUT /api/posts/:id
posts.put('/:id', requireAuth, async (ctx) => {
  try {
    await connectDB()
    const body = await ctx.req.json()
    const post = await Post.findByIdAndUpdate(
      ctx.req.param('id'),
      { $set: body },
      { new: true, runValidators: true }
    )
    if (!post) return ctx.json({ error: 'Not found' }, 404)
    return ctx.json(post)
  } catch (e) {
    console.error('[PUT /posts/:id]', e.message)
    return ctx.json({ error: e.message }, 500)
  }
})

// DELETE /api/posts/:id
posts.delete('/:id', requireAuth, async (ctx) => {
  try {
    await connectDB()
    await Post.findByIdAndDelete(ctx.req.param('id'))
    return ctx.json({ ok: true })
  } catch (e) {
    console.error('[DELETE /posts/:id]', e.message)
    return ctx.json({ error: e.message }, 500)
  }
})

export default posts
