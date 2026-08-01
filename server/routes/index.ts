import type { ApiRequest, ApiResponse } from '../lib/logger.js'
import adminBrewsHandler from './admin-brews.js'
import adminNotesHandler from './admin-notes.js'
import adminPostHandler from './admin-post.js'
import adminPostsHandler from './admin-posts.js'
import authLoginHandler from './auth-login.js'
import authLogoutHandler from './auth-logout.js'
import authMeHandler from './auth-me.js'
import authRegisterHandler from './auth-register.js'
import brewHandler from './brew.js'
import brewsHandler from './brews.js'
import noteHandler from './note.js'
import notesHandler from './notes.js'
import postCompletionHandler from './post-completion.js'
import postHandler from './post.js'
import postShellHandler from './post-shell.js'
import postViewHandler from './post-view.js'
import postsHandler from './posts.js'
import slugCheckHandler from './slug-check.js'

export type RouteHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>
export type RouteTable = Record<string, RouteHandler>

// Vercel's Hobby plan allows 12 serverless functions, one per file in api/.
// Handlers live here instead, grouped behind four thin dispatchers in api/.
// Public URLs are unchanged — vercel.json rewrites /api/<name> onto its group.
export const authRoutes: RouteTable = {
  'auth-login': authLoginHandler,
  'auth-logout': authLogoutHandler,
  'auth-me': authMeHandler,
  'auth-register': authRegisterHandler,
}

export const adminRoutes: RouteTable = {
  'admin-brews': adminBrewsHandler,
  'admin-notes': adminNotesHandler,
  'admin-post': adminPostHandler,
  'admin-posts': adminPostsHandler,
  'slug-check': slugCheckHandler,
}

export const contentRoutes: RouteTable = {
  brew: brewHandler,
  brews: brewsHandler,
  note: noteHandler,
  notes: notesHandler,
  post: postHandler,
  posts: postsHandler,
}

export const metricRoutes: RouteTable = {
  'post-completion': postCompletionHandler,
  'post-view': postViewHandler,
}

// Answers with HTML, not JSON: the per-essay link-preview document. Its own group
// because vercel.json routes crawler traffic on /writing/:slug straight here.
export const shellRoutes: RouteTable = {
  'post-shell': postShellHandler,
}

/** Every route, keyed by the public path segment under /api. */
export const allRoutes: RouteTable = {
  ...authRoutes,
  ...adminRoutes,
  ...contentRoutes,
  ...metricRoutes,
  ...shellRoutes,
}
