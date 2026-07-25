import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// Persisted failed-attempt counter for auth endpoints. Stored in MongoDB (rather
// than a per-process Map) so a login/register lockout holds across serverless
// instances and cold starts, which is where an in-memory limit silently fails.
const authThrottleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    action: { type: String, required: true },
    ip: { type: String, required: true },
    count: { type: Number, default: 0, min: 0 },
    // Set once the failure count crosses the threshold; null while unlocked.
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
)

// TTL index reaps stale rows so the collection can't grow without bound.
authThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type AuthThrottle = InferSchemaType<typeof authThrottleSchema>

type AuthThrottleModel = Model<AuthThrottle>

const AuthThrottleModelInstance =
  (mongoose.models.AuthThrottle as AuthThrottleModel | undefined) ??
  mongoose.model<AuthThrottle, AuthThrottleModel>('AuthThrottle', authThrottleSchema)

export default AuthThrottleModelInstance
