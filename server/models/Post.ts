import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

import { slugify } from '../../src/shared/slug.js'

const postSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    excerpt: { type: String, default: '' },
    coverImage: { type: String, default: '', trim: true },
    tags: { type: [String], default: [] },
    content: { type: Schema.Types.Mixed, default: null },
    // Plain-text projection of `content`, kept in sync on every write. Searched
    // (case-insensitive regex) for full-essay lookups; excluded from normal
    // reads (`select: false`) so it never ships to the client or bloats lists.
    contentText: { type: String, default: '', select: false },
    // Minutes to read. `readingMinutes` is the figure the views show, refreshed
    // on every write; it is stored rather than computed per request so the
    // listing page can show it without loading every essay's body.
    // `readingMinutesOverride` records a deliberate author figure separately, so
    // re-deriving the estimate can never silently discard it. 0 means "none".
    readingMinutes: { type: Number, default: 0, min: 0 },
    readingMinutesOverride: { type: Number, default: 0, min: 0 },
    published: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0, min: 0 },
    readCompletionCount: { type: Number, default: 0, min: 0 },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
)

export type Post = InferSchemaType<typeof postSchema> & {
  createdAt?: Date
  updatedAt?: Date
}

type PostModel = Model<Post>

postSchema.pre('validate', function (this: Post) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title)
  }
})

const PostModelInstance =
  (mongoose.models.Post as PostModel | undefined) ??
  mongoose.model<Post, PostModel>('Post', postSchema)

export default PostModelInstance
