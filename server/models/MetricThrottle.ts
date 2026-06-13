import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const metricThrottleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    action: { type: String, required: true },
    slug: { type: String, required: true },
    fingerprint: { type: String, required: true },
    bucket: { type: Number, required: true },
    count: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
)

metricThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type MetricThrottle = InferSchemaType<typeof metricThrottleSchema>

type MetricThrottleModel = Model<MetricThrottle>

const MetricThrottleModelInstance =
  (mongoose.models.MetricThrottle as MetricThrottleModel | undefined) ??
  mongoose.model<MetricThrottle, MetricThrottleModel>('MetricThrottle', metricThrottleSchema)

export default MetricThrottleModelInstance
