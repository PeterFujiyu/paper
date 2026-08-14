import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

import {
  BREW_METHODS,
  MAX_BEAN_LENGTH,
  MAX_BREW_SECONDS,
  MAX_DOSE_GRAMS,
  MAX_ORIGIN_LENGTH,
  MAX_RATING,
  MAX_ROASTER_LENGTH,
  MAX_TASTING_NOTE_LENGTH,
  MAX_TEMPERATURE_C,
  MAX_WATER_GRAMS,
  MIN_TEMPERATURE_C,
} from '../../src/shared/brew.js'
import { slugify } from '../../src/shared/slug.js'
import { prepareBrew } from '../lib/brew-entry.js'
import { extractPlainText } from '../lib/content-text.js'
import { connectDB } from '../lib/db.js'
import { prepareNoteContent } from '../lib/note-content.js'
import { isDuplicateSlugError, slugExists } from '../lib/post-slugs.js'
import {
  normalizeCoverImage,
  normalizeReadingOverride,
  normalizeSlug,
  normalizeTags,
  resolveReadingMinutes,
  sanitizePostContent,
  validatePostBody,
  type PostBody,
} from '../lib/validation.js'
import Brew from '../models/Brew.js'
import Note from '../models/Note.js'
import Post from '../models/Post.js'
import User from '../models/User.js'
import {
  authorEssaySchema,
  brewSchema,
  draftNoteSchema,
  requiredUnknownSchema,
  serializeDate,
  shapeAuthorEssay,
  shapeBrew,
  shapeNote,
  slugSchema,
  toRecord,
  type BrewSummary,
  type DraftNote,
} from './content-contracts.js'

const essayFieldsSchema = {
  title: z.string().trim().min(3),
  excerpt: z.string().trim().min(12),
  content: requiredUnknownSchema,
  tags: z.array(z.string()).max(6).optional(),
  coverImage: z.string().max(2048).optional(),
  readingMinutesOverride: z.number().int().min(0).optional(),
}

const createDraftInputSchema = z.object({
  ...essayFieldsSchema,
  slug: slugSchema.optional(),
})

const updateEssayInputSchema = z.object({
  slug: slugSchema,
  ...essayFieldsSchema,
  newSlug: slugSchema.optional(),
  // Editing a draft is free; rewriting what readers can already see is a
  // deliberate act, so it takes a second sentence from the caller.
  allowPublished: z.boolean().default(false),
})

const publishEssayOutputSchema = z.object({
  slug: z.string(),
  title: z.string(),
  published: z.boolean(),
  url: z.string(),
})

/**
 * Resolve and validate the author used by the local stdio server. There is no
 * HTTP session on this transport, so startup must establish the owner before
 * any authoring tool is registered.
 */
export async function resolveMcpAuthorId(): Promise<string> {
  const authorId = process.env.MCP_AUTHOR_ID?.trim() ?? ''
  if (!authorId) throw new Error('MCP_AUTHOR_ID is not configured')

  await connectDB()
  const user = await User.findById(authorId).select('_id').lean()
  if (!user) throw new Error('MCP_AUTHOR_ID does not match an existing user')
  return String(user._id)
}

/** Register the local-only authoring surface in its canonical tool order. */
export function registerAuthoringTools(server: McpServer, authorId: string): void {
  server.registerTool(
    'create_draft',
    {
      description: 'Create an unpublished essay draft from TipTap JSON.',
      inputSchema: createDraftInputSchema,
      outputSchema: authorEssaySchema,
      annotations: { readOnlyHint: false },
    },
    async (args) => runAuthoringTool(async () => {
      // A derived slug is held to the same schema as a supplied one. A title
      // with no ASCII alphanumerics — Chinese, Japanese, emoji — slugifies to
      // nothing, and a very long one to something past the length cap.
      const derived = slugSchema.safeParse(args.slug ?? slugify(args.title))
      if (!derived.success) {
        return toolError('Could not derive a usable slug from that title. Pass slug explicitly.')
      }

      const slug = derived.data
      const body = postBody(args, slug)
      const prepared = prepareEssay(body)
      if (!prepared.ok) return toolError(prepared.error)

      if (await slugExists(slug)) return toolError('Slug is already in use.')

      const post = await Post.create({
        ...essayWriteFields(args, slug, prepared),
        published: false,
        author: authorId,
      })

      const output = shapeAuthorEssay(post, prepared.contentText, false)
      return toolSuccess(`Draft created: ${output.slug} — ${output.title}`, output)
    }),
  )

  server.registerTool(
    'update_essay',
    {
      description:
        'Replace every editable field of a draft essay addressed by slug. '
        + 'Editing a published essay requires allowPublished: true.',
      inputSchema: updateEssayInputSchema,
      outputSchema: authorEssaySchema,
      annotations: { readOnlyHint: false },
    },
    async (args) => runAuthoringTool(async () => {
      const currentSlug = normalizeSlug(args.slug)
      const existing = await Post.findOne({ slug: currentSlug }).select('_id published').lean()
      if (!existing) return toolError('Not found')

      if (existing.published === true && !args.allowPublished) {
        return toolError('That essay is published. Pass allowPublished: true to edit live content.')
      }

      const id = String(existing._id)
      const slug = normalizeSlug(args.newSlug ?? currentSlug)
      const body = postBody(args, slug)
      const prepared = prepareEssay(body)
      if (!prepared.ok) return toolError(prepared.error)

      if (await slugExists(slug, id)) return toolError('Slug is already in use.')

      const post = await Post.findByIdAndUpdate(
        id,
        {
          $set: essayWriteFields(args, slug, prepared),
        },
        { new: true, runValidators: true },
      ).lean()

      if (!post) return toolError('Not found')
      const output = shapeAuthorEssay(post, prepared.contentText, post.published === true)
      return toolSuccess(`Essay updated: ${output.slug} — ${output.title}`, output)
    }),
  )

  server.registerTool(
    'publish_essay',
    {
      description: 'Publish an essay, or unpublish it by passing published: false.',
      inputSchema: z.object({
        slug: slugSchema,
        published: z.boolean().default(true),
      }),
      outputSchema: publishEssayOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async ({ slug, published }) => runAuthoringTool(async () => {
      const normalizedSlug = normalizeSlug(slug)
      const post = await Post.findOneAndUpdate(
        { slug: normalizedSlug },
        { $set: { published } },
        { new: true, runValidators: true },
      ).lean()

      if (!post) return toolError('Not found')
      const output = {
        slug: post.slug,
        title: post.title,
        published: post.published === true,
        url: `/writing/${post.slug}`,
      }
      const action = output.published ? 'Published' : 'Unpublished'
      return toolSuccess(`${action}: ${output.slug} — ${output.title}`, output)
    }),
  )

  server.registerTool(
    'add_note',
    {
      description:
        'Add a note from TipTap JSON as an unpublished draft. '
        + 'It stays off the site until it is published from the admin Notes view.',
      inputSchema: z.object({ content: requiredUnknownSchema }),
      outputSchema: draftNoteSchema,
      annotations: { readOnlyHint: false },
    },
    async ({ content }) => runAuthoringTool(async () => {
      const prepared = prepareNoteContent(content)
      if (!prepared.ok) return toolError(prepared.error)

      const note = await Note.create({
        content: prepared.content,
        contentText: prepared.contentText,
        published: false,
      })
      const record = toRecord(note)
      const output: DraftNote = {
        ...shapeNote({
          _id: record._id,
          createdAt: serializeDate(record.createdAt),
        }, prepared.contentText),
        published: false,
      }
      return toolSuccess(`Note drafted: ${output.text}`, output)
    }),
  )

  server.registerTool(
    'log_brew',
    {
      description: 'Log one coffee brew.',
      inputSchema: z.object({
        bean: z.string().max(MAX_BEAN_LENGTH),
        method: z.enum(BREW_METHODS),
        origin: z.string().max(MAX_ORIGIN_LENGTH).optional(),
        roaster: z.string().max(MAX_ROASTER_LENGTH).optional(),
        tastingNote: z.string().max(MAX_TASTING_NOTE_LENGTH).optional(),
        dose: z.number().min(0).max(MAX_DOSE_GRAMS).optional(),
        water: z.number().min(0).max(MAX_WATER_GRAMS).optional(),
        temperature: z.number().min(MIN_TEMPERATURE_C).max(MAX_TEMPERATURE_C).optional(),
        brewSeconds: z.number().min(0).max(MAX_BREW_SECONDS).optional(),
        rating: z.number().int().min(0).max(MAX_RATING).optional(),
        pairedSlug: slugSchema.optional(),
      }),
      outputSchema: brewSchema,
      annotations: { readOnlyHint: false },
    },
    async (args) => runAuthoringTool(async () => {
      const prepared = prepareBrew(args)
      if (!prepared.ok) return toolError(prepared.error)

      const brew = await Brew.create(prepared.value)
      const record = toRecord(brew)
      const output: BrewSummary = shapeBrew({
        ...prepared.value,
        createdAt: serializeDate(record.createdAt),
      })
      return toolSuccess(`Brew logged: ${output.bean} — ${output.method}`, output)
    }),
  )
}

type PreparedEssay =
  | { ok: true; content: unknown; contentText: string }
  | { ok: false; error: string }

function postBody(
  args: z.infer<typeof createDraftInputSchema> | z.infer<typeof updateEssayInputSchema>,
  slug: string,
): PostBody {
  return {
    title: args.title,
    slug,
    excerpt: args.excerpt,
    content: args.content,
    tags: args.tags,
    coverImage: args.coverImage,
    // Product semantics use 0 for "not recorded"; the HTTP validator uses
    // null for the same intent, so adapt only at this shared-validation seam.
    readingMinutesOverride: args.readingMinutesOverride === 0
      ? null
      : args.readingMinutesOverride,
  }
}

function prepareEssay(body: PostBody): PreparedEssay {
  const validationError = validatePostBody(body)
  if (validationError) return { ok: false, error: validationError }

  const contentResult = sanitizePostContent(body.content)
  if (!contentResult.ok) return { ok: false, error: contentResult.error }
  return {
    ok: true,
    content: contentResult.value,
    contentText: extractPlainText(contentResult.value),
  }
}

function essayWriteFields(
  args: z.infer<typeof createDraftInputSchema> | z.infer<typeof updateEssayInputSchema>,
  slug: string,
  prepared: Extract<PreparedEssay, { ok: true }>,
): Record<string, unknown> {
  return {
    title: args.title,
    slug,
    excerpt: args.excerpt,
    coverImage: normalizeCoverImage(args.coverImage),
    tags: normalizeTags(args.tags),
    content: prepared.content,
    contentText: prepared.contentText,
    readingMinutes: resolveReadingMinutes(args.readingMinutesOverride, prepared.contentText),
    readingMinutesOverride: normalizeReadingOverride(args.readingMinutesOverride),
  }
}

async function runAuthoringTool(
  operation: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    await connectDB()
    return await operation()
  } catch (error) {
    if (isDuplicateSlugError(error)) return toolError('Slug is already in use.')
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[mcp] authoring tool failed', message)
    return toolError('Request failed')
  }
}

function toolSuccess<T extends Record<string, unknown>>(
  text: string,
  structuredContent: T,
): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent,
  }
}

function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { error: message },
    isError: true,
  }
}
