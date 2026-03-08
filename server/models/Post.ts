import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const postSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    excerpt: { type: String, default: '' },
    content: { type: Schema.Types.Mixed, default: null },
    published: { type: Boolean, default: false },
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
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '')
  }
})

const PostModelInstance =
  (mongoose.models.Post as PostModel | undefined) ??
  mongoose.model<Post, PostModel>('Post', postSchema)

export default PostModelInstance
