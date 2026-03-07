import mongoose from 'mongoose'

const postSchema = new mongoose.Schema(
  {
    slug:      { type: String, required: true, unique: true, trim: true },
    title:     { type: String, required: true, trim: true },
    excerpt:   { type: String, default: '' },
    // Tiptap JSON document stored as-is
    content:   { type: mongoose.Schema.Types.Mixed, default: null },
    published: { type: Boolean, default: false },
    author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    // createdAt used as display date
  }
)

// Auto-generate slug from title if not provided
postSchema.pre('validate', function () {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '')
  }
})

export default mongoose.models.Post ?? mongoose.model('Post', postSchema)
