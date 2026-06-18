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
