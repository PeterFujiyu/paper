import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

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

// A single cup, logged. The recipe fields are all optional: plenty of cups get
// drunk without a scale nearby, and a brew with only a bean and a tasting note
// is still worth keeping. Route-level validation owns the real rules; the limits
// repeated here are the last line of defence for a direct write.
const brewSchema = new Schema(
  {
    bean: { type: String, required: true, trim: true, maxlength: MAX_BEAN_LENGTH },
    origin: { type: String, default: '', trim: true, maxlength: MAX_ORIGIN_LENGTH },
    roaster: { type: String, default: '', trim: true, maxlength: MAX_ROASTER_LENGTH },
    method: { type: String, required: true, enum: BREW_METHODS },

    // The recipe. 0 means "not recorded" throughout — the views test for
    // truthiness, so an unrecorded figure simply doesn't render.
    dose: { type: Number, default: 0, min: 0, max: MAX_DOSE_GRAMS },
    water: { type: Number, default: 0, min: 0, max: MAX_WATER_GRAMS },
    temperature: { type: Number, default: 0, min: MIN_TEMPERATURE_C, max: MAX_TEMPERATURE_C },
    brewSeconds: { type: Number, default: 0, min: 0, max: MAX_BREW_SECONDS },

    rating: { type: Number, default: 0, min: 0, max: MAX_RATING },
    tastingNote: { type: String, default: '', trim: true, maxlength: MAX_TASTING_NOTE_LENGTH },

    // Slug of the essay this cup was brewed alongside. Stored as a plain string
    // rather than a ref: the link is a piece of colour, and a retitled essay
    // should not be able to break a brew document.
    pairedSlug: { type: String, default: '', trim: true },

    // Lowercased projection of the searchable fields, kept in sync on every
    // write. Searched by case-insensitive regex; excluded from normal reads
    // (`select: false`) so it never bloats a list response. Mirrors the same
    // arrangement on Note.contentText.
    searchText: { type: String, default: '', select: false },

    // Same arrangement as Note.published. `log_brew` is the only path that
    // *creates* a draft, so nothing an agent logs reaches the coffee log or its
    // shelf totals until a person publishes it; the admin editor can move a cup
    // either way afterwards. Cups logged before this field existed carry no
    // value, which is why public reads match `$ne: false` rather than `true`.
    published: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

export type Brew = InferSchemaType<typeof brewSchema> & {
  createdAt?: Date
  updatedAt?: Date
}

type BrewModel = Model<Brew>

const BrewModelInstance =
  (mongoose.models.Brew as BrewModel | undefined) ??
  mongoose.model<Brew, BrewModel>('Brew', brewSchema)

export default BrewModelInstance
