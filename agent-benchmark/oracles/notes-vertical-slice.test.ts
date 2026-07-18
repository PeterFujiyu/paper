import { flushPromises, mount } from '@vue/test-utils'
import type { Component } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import appRouter from '../../src/router'
import HomeView from '../../src/views/HomeView.vue'

const note = {
  _id: 'note-42',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'A quiet observation about type.' }],
      },
    ],
  },
  createdAt: '2026-03-01T00:00:00.000Z',
}

const searchResult = {
  ...note,
  _id: 'note-search-result',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Search result about kerning.' }],
      },
    ],
  },
}

function jsonResponse(value: unknown): Pick<Response, 'ok' | 'status' | 'json'> {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('notes vertical slice', () => {
  it('exposes the admin Notes routes and renders fetched notes in the list', async () => {
    const routes = appRouter.getRoutes()
    const notesRoute = routes.find(route => route.name === 'admin-notes')
    expect(notesRoute?.path).toBe('/admin/notes')
    expect(routes.some(route => route.name === 'note-new')).toBe(true)
    expect(routes.some(route => route.name === 'note-edit')).toBe(true)

    const loadNotesView: unknown = notesRoute?.components?.default
    if (typeof loadNotesView !== 'function') {
      throw new Error('The admin Notes route must load a view component')
    }
    const loaded = await (loadNotesView as () => Promise<unknown>)()
    const NotesListView = (loaded as { default?: Component }).default
      ?? (loaded as Component)

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([note]))
    vi.stubGlobal('fetch', fetchMock)

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin', component: { template: '<div />' } },
        { path: '/admin/notes/new', component: { template: '<div />' } },
        { path: '/admin/notes/:id', component: { template: '<div />' } },
      ],
    })

    const wrapper = mount(NotesListView, {
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin-notes',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    expect(wrapper.text()).toContain('A quiet observation about type.')
    expect(wrapper.get('a[href="/admin/notes/new"]')).toBeTruthy()
    expect(wrapper.get('a[href="/admin/notes/note-42"]')).toBeTruthy()

    wrapper.unmount()
  })

  it('loads, saves, and deletes an existing note through the admin editor', async () => {
    const editRoute = appRouter.getRoutes().find(route => route.name === 'note-edit')
    expect(editRoute?.path).toBe('/admin/notes/:id')

    const loadNoteEditor: unknown = editRoute?.components?.default
    if (typeof loadNoteEditor !== 'function') {
      throw new Error('The note edit route must load a view component')
    }
    const loaded = await (loadNoteEditor as () => Promise<unknown>)()
    const NoteEditView = (loaded as { default?: Component }).default
      ?? (loaded as Component)

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url !== '/api/note?id=note-42') {
        throw new Error(`Unexpected request: ${url}`)
      }
      if (init?.method === 'DELETE') return jsonResponse({ ok: true })
      return jsonResponse(note)
    })
    vi.stubGlobal('fetch', fetchMock)
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/notes', component: { template: '<div />' } },
        { path: '/admin/notes/:id', component: { template: '<div />' } },
      ],
    })
    await router.push('/admin/notes/note-42')
    await router.isReady()

    const wrapper = mount(NoteEditView, {
      global: {
        plugins: [router],
        stubs: { TiptapEditor: true },
      },
    })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/note?id=note-42',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    expect(wrapper.get('button.btn-save').attributes('disabled')).toBeUndefined()

    await wrapper.get('button.btn-save').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/note?id=note-42',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ content: note.content }),
      }),
    )

    await wrapper.get('button.btn-delete').trigger('click')
    await flushPromises()
    expect(confirmMock).toHaveBeenCalledWith('Delete this note? This cannot be undone.')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/note?id=note-42',
      expect.objectContaining({ method: 'DELETE' }),
    )

    wrapper.unmount()
  })

  it('searches public notes after the debounce and restores the default list when cleared', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === '/api/posts') return jsonResponse([])
      if (url === '/api/notes') return jsonResponse([note])
      if (url === '/api/notes?q=kerning') return jsonResponse([searchResult])
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/notes')
    expect(wrapper.get('#notes').text()).toContain('A quiet observation about type.')

    const searchInput = wrapper.get('input[aria-label="Search notes"]')
    await searchInput.setValue('kerning')
    await vi.advanceTimersByTimeAsync(199)
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/notes?q=kerning',
      expect.anything(),
    )

    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notes?q=kerning',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(wrapper.get('#notes').text()).toContain('Search result about kerning.')
    expect(wrapper.get('#notes').text()).not.toContain('A quiet observation about type.')

    await searchInput.setValue('')
    expect(wrapper.get('#notes').text()).toContain('A quiet observation about type.')
    expect(wrapper.get('#notes').text()).not.toContain('Search result about kerning.')

    wrapper.unmount()
  })
})
