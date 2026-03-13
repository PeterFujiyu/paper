import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { loadSession } from '../admin/store'
import HomeView from '../views/HomeView.vue'
import PostView from '../views/PostView.vue'

const AdminLayout = () => import('../admin/AdminLayout.vue')
const LoginView = () => import('../admin/views/LoginView.vue')
const PostsListView = () => import('../admin/views/PostsListView.vue')
const PostEditView = () => import('../admin/views/PostEditView.vue')

const routes: RouteRecordRaw[] = [
  // ─── Public ───
  { path: '/',                name: 'home', component: HomeView },
  { path: '/writing/:slug',   name: 'post', component: PostView, props: true },

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
    ],
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
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
