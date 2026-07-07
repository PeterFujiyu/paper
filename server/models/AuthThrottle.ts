import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// Durable, cross-instance rate-limit state for the auth endpoints. Serverless
// functions get their own per-instance memory that is discarded on cold start
// and never shared between concurrent invocations, so an in-process Map cannot
// enforce a global lockout. This collection holds one document per
// `${action}:${clientIp}` bucket; the TTL index reaps stale entries. Mirrors the
// pattern already used by MetricThrottle.
const authThrottleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    action: { type: String, required: true },
    count: { type: Number, default: 0, min: 0 },
    // Timestamp (or null) until which further attempts are rejected.
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
)

authThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type AuthThrottle = InferSchemaType<typeof authThrottleSchema>

type AuthThrottleModel = Model<AuthThrottle>

const AuthThrottleModelInstance =
  (mongoose.models.AuthThrottle as AuthThrottleModel | undefined) ??
  mongoose.model<AuthThrottle, AuthThrottleModel>('AuthThrottle', authThrottleSchema)

export default AuthThrottleModelInstance
