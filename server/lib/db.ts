import mongoose, { type Mongoose } from 'mongoose'

type CachedConnection = {
  conn: Mongoose | null
  promise: Promise<Mongoose> | null
}

const globalCache = globalThis as typeof globalThis & {
  _mongoConn?: CachedConnection
}

let cached = globalCache._mongoConn

export async function connectDB(): Promise<Mongoose> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is not configured')
  }

  if (cached?.conn) return cached.conn

  if (!cached) {
    cached = globalCache._mongoConn = { conn: null, promise: null }
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverApi: { version: '1', strict: true, deprecationErrors: true },
    }).catch((error: unknown) => {
      cached!.promise = null
      throw error
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}
