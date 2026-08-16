import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type RouteRecordRaw,
} from 'vue-router'
import { loadSession } from '../admin/store'
import { PAGE_LEAVE_MS, prefersReducedMotion } from '../shared/motion'
import { hashElement, headerOffset, scrollMotion } from '../shared/scroll'
import HomeView from '../views/HomeView.vue'
import PostView from '../views/PostView.vue'

const McpView = () => import('../views/McpView.vue')
const AdminLayout = () => import('../admin/AdminLayout.vue')
const LoginView = () => import('../admin/views/LoginView.vue')
const PostsListView = () => import('../admin/views/PostsListView.vue')
const PostEditView = () => import('../admin/views/PostEditView.vue')
const NotesListView = () => import('../admin/views/NotesListView.vue')
const NoteEditView = () => import('../admin/views/NoteEditView.vue')
const BrewsListView = () => import('../admin/views/BrewsListView.vue')
const BrewEditView = () => import('../admin/views/BrewEditView.vue')

const routes: RouteRecordRaw[] = [
  // ─── Public ───
  { path: '/',                name: 'home', component: HomeView },
  { path: '/writing/:slug',   name: 'post', component: PostView, props: true },
  // Reference docs, not reading: the index rail needs more room than --measure.
  { path: '/mcp',             name: 'mcp',  component: McpView, meta: { wide: true } },

  // ─── Admin ───
  { path: '/admin/login', name: 'login', component: LoginView },
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '',           name: 'admin-posts', component: PostsListView },
      { path: 'posts/new',  name: 'post-new',    component: PostEditView },
      { path: 'posts/:id',  name: 'post-edit',   component: PostEditView },
      { path: 'notes',      name: 'admin-notes', component: NotesListView },
      { path: 'notes/new',  name: 'note-new',    component: NoteEditView },
      { path: 'notes/:id',  name: 'note-edit',   component: NoteEditView },
      { path: 'brews',      name: 'admin-brews', component: BrewsListView },
      { path: 'brews/new',  name: 'brew-new',    component: BrewEditView },
      { path: 'brews/:id',  name: 'brew-edit',   component: BrewEditView },
    ],
  },
]

/**
 * Whether the `page` transition will actually run for this navigation. It only
 * does when some level of the view tree swaps components — reusing a view
 * (`/writing/a` → `/writing/b`, which PostView refetches in place, or a
 * hash-only move within the home page) does not animate, so the scroll must not
 * wait on a transition that never happens.
 */
function viewSwaps(to: RouteLocationNormalized, from: RouteLocationNormalized): boolean {
  const depth = Math.max(to.matched.length, from.matched.length)
  for (let i = 0; i < depth; i += 1) {
    if (to.matched[i]?.components?.default !== from.matched[i]?.components?.default) return true
  }
  return false
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // Resolve the hash to an element rather than handing the raw selector on:
    // essay section ids keep the letters of any script, so they arrive
    // percent-encoded and would not survive querySelector. Falls back to the
    // literal hash when nothing matches, which is the router's own behaviour.
    const target = savedPosition
      ?? (to.hash
        ? { el: hashElement(to.hash) ?? to.hash, top: headerOffset(), behavior: scrollMotion() }
        : { top: 0 })

    // The route <Transition> is `out-in`, so scrolling straight away would yank
    // the page while the outgoing view is still on screen. Land it in the gap.
    if (prefersReducedMotion() || !viewSwaps(to, from)) return target
    return new Promise(resolve => { window.setTimeout(() => resolve(target), PAGE_LEAVE_MS) })
  },
})

router.beforeEach(async (to) => {
  if (to.name === 'login') {
    const loggedIn = await loadSession()
    if (loggedIn) {
      return { name: 'admin-posts' }
    }
    return true
  }

  if (to.meta.requiresAuth) {
    const loggedIn = await loadSession()
    if (!loggedIn) {
      return { name: 'login' }
    }
  }

  return true
})

export default router
