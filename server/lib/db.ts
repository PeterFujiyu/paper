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
    console.log('[db] connecting to MongoDB')
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverApi: { version: '1', strict: true, deprecationErrors: true },
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 20_000,
      family: 4,
    }).catch((error: unknown) => {
      cached!.promise = null
      console.error('[db] connection failed', error)
      throw error
    })
  }

  cached.conn = await cached.promise
  console.log('[db] connected')
  return cached.conn
}
