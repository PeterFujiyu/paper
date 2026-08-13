import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const noteSchema = new Schema(
  {
    content: { type: Schema.Types.Mixed, default: null },
    // Plain-text projection of `content`, kept in sync on every write. Searched
    // (case-insensitive regex) for full-text lookups; excluded from normal reads
    // (`select: false`) so the heavy field never bloats list responses.
    contentText: { type: String, default: '', select: false },
    // Drafts exist so an agent can write a note without putting it on the site;
    // the MCP authoring tool is the only writer that leaves this false. The
    // default is the safe one, so a new writer has to opt into publishing.
    // Notes written before this field existed have no value at all, which is
    // why public reads match `$ne: false` rather than `true`.
    published: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

export type Note = InferSchemaType<typeof noteSchema> & {
  createdAt?: Date
  updatedAt?: Date
}

type NoteModel = Model<Note>

const NoteModelInstance =
  (mongoose.models.Note as NoteModel | undefined) ??
  mongoose.model<Note, NoteModel>('Note', noteSchema)

export default NoteModelInstance
