import mongoose from 'mongoose'

let cached = global._mongoConn

export async function connectDB() {
  if (cached?.conn) return cached.conn

  if (!cached) {
    cached = global._mongoConn = { conn: null, promise: null }
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
      serverApi: { version: '1', strict: true, deprecationErrors: true },
    }).catch((err) => {
      // Reset so next request retries instead of hanging forever
      cached.promise = null
      throw err
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}
