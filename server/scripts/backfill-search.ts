import 'dotenv/config'
import mongoose from 'mongoose'

import { connectDB } from '../lib/db.js'
import { extractPlainText } from '../lib/content-text.js'
import Post from '../models/Post.js'

/**
 * One-time migration: populate `contentText` (the plain-text projection that
 * full-essay search reads) for posts created before the feature existed. Safe
 * to re-run — it simply recomputes the projection. Run with:
 * `npm run backfill:search`.
 */
async function main(): Promise<void> {
  await connectDB()

  const posts = await Post.find({}).select('content').lean()
  let updated = 0
  for (const post of posts) {
    const contentText = extractPlainText(post.content)
    await Post.updateOne({ _id: post._id }, { $set: { contentText } })
    updated += 1
  }

  console.log(`[backfill-search] updated ${updated} post(s).`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error('[backfill-search] failed', error)
  process.exitCode = 1
  void mongoose.disconnect()
})
