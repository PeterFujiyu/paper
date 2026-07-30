import 'dotenv/config'
import mongoose from 'mongoose'

import { connectDB } from '../lib/db.js'
import { extractPlainText } from '../lib/content-text.js'
import Post from '../models/Post.js'
import { estimateReadingMinutes } from '../../src/shared/reading-time.js'

/**
 * One-time migration: populate `readingMinutes` for posts written before the
 * estimate existed, so the listing and essay pages show one without waiting for
 * each post to be re-saved. An author override is left alone. Safe to re-run.
 * Run with: `npm run backfill:reading-time`, or
 * `npm run backfill:reading-time -- --dry-run` to print the changes and write
 * nothing.
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')

  await connectDB()

  const posts = await Post.find({}).select('slug content readingMinutes readingMinutesOverride').lean()
  let changed = 0
  for (const post of posts) {
    if (post.readingMinutesOverride) continue

    const readingMinutes = estimateReadingMinutes(extractPlainText(post.content))
    if (readingMinutes === post.readingMinutes) continue

    changed += 1
    if (dryRun) {
      console.log(
        `  ${post.slug}: ${post.readingMinutes ?? 'unset'} → ${readingMinutes} min`
      )
      continue
    }
    await Post.updateOne({ _id: post._id }, { $set: { readingMinutes } })
  }

  const verb = dryRun ? 'would update' : 'updated'
  console.log(`[backfill-reading-time] ${verb} ${changed} of ${posts.length} post(s).`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error('[backfill-reading-time] failed', error)
  process.exitCode = 1
  void mongoose.disconnect()
})
