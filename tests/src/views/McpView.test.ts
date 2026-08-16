import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// The index hands scrolling to the router, whose scrollBehavior already clears
// the fixed header (see src/router/index.ts).
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

import McpView from '../../../src/views/McpView.vue'

// Attached to the document because the view measures real elements: the
// scroll-spy reads getBoundingClientRect, and the index links resolve by id.
function mountDocs() {
  return mount(McpView, { attachTo: document.body })
}

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  replace.mockClear()
})

describe('McpView structure', () => {
  it('exposes a focusable main landmark', () => {
    const wrapper = mountDocs()
    const main = wrapper.find('main#main')
    expect(main.exists()).toBe(true)
    expect(main.attributes('tabindex')).toBe('-1')
  })

  it('lists the five read tools in their canonical order', () => {
    const wrapper = mountDocs()
    const names = wrapper
      .findAll('#read-tools .tools tbody tr td:first-child')
      .map(td => td.text())
    expect(names).toEqual([
      'list_essays',
      'search_essays',
      'get_essay',
      'list_notes',
      'list_brews',
    ])
  })

  it('marks publish_essay as the destructive authoring tool', () => {
    const wrapper = mountDocs()
    const row = wrapper.find('#t-publish_essay')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('destructiveHint: true')
  })

  // The policy is the section that earns trust; losing it to a refactor should
  // fail loudly rather than quietly.
  it('states that authoring writes land as drafts', () => {
    const wrapper = mountDocs()
    expect(wrapper.find('#policy').text()).toContain('starts as a draft')
    expect(wrapper.find('#t-add_note').text()).toContain('unpublished draft')
  })

  it('describes the rate limit as best-effort rather than a quota', () => {
    const wrapper = mountDocs()
    expect(wrapper.find('#limits').text()).toContain('best-effort and per-instance, not a quota')
  })
})

describe('McpView index', () => {
  // A nav entry pointing at an id that no longer exists is a dead link, and it
  // is invisible until someone clicks it.
  it('every index link resolves to a section on the page', () => {
    const wrapper = mountDocs()
    const hrefs = wrapper.findAll('.nav-link').map(a => a.attributes('href') ?? '')
    expect(hrefs.length).toBeGreaterThan(10)
    for (const href of hrefs) {
      expect(document.getElementById(href.replace(/^#/, ''))).not.toBeNull()
    }
  })

  it('filters the index, keeping a parent that only matches through a child', async () => {
    const wrapper = mountDocs()
    await wrapper.find('.search-input').setValue('brew')

    const labels = wrapper.findAll('.nav-link').map(a => a.text())
    expect(labels).toContain('list_brews')
    expect(labels).toContain('Tools')       // kept as the surviving child's parent
    expect(labels).not.toContain('Caching')
  })

  it('routes a section click through the router rather than a raw jump', async () => {
    const wrapper = mountDocs()
    const link = wrapper.findAll('.nav-link').find(a => a.text() === 'Publication policy')

    await link!.trigger('click')

    expect(replace).toHaveBeenCalledWith({ hash: '#policy' })
  })

  it('focuses the filter on the / key', async () => {
    const wrapper = mountDocs()
    const input = wrapper.find('.search-input').element as HTMLInputElement

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))
    await wrapper.vm.$nextTick()

    expect(document.activeElement).toBe(input)
  })
})

describe('McpView connect snippets', () => {
  // Origin, not host: a hardcoded https:// would print a URL that does not
  // resolve on the plain-http dev server.
  it('builds the remote command against the page origin, scheme included', () => {
    const wrapper = mountDocs()
    expect(wrapper.text()).toContain(`claude mcp add --transport http paper ${window.location.origin}/api/mcp`)
    expect(window.location.origin).not.toBe('')
  })

  it('switches snippet format with the selected client', async () => {
    const wrapper = mountDocs()
    const cursor = wrapper.findAll('.segment').find(b => b.text() === 'Cursor')
    expect(cursor).toBeDefined()

    await cursor!.trigger('click')

    const text = wrapper.text()
    expect(text).toContain('"mcpServers"')
    expect(text).toContain('MCP_AUTHOR_ID')
    expect(localStorage.getItem('mcp-docs-client')).toBe('cursor')
  })

  it('restores the stored client on mount', () => {
    localStorage.setItem('mcp-docs-client', 'vscode')
    const wrapper = mountDocs()
    expect(wrapper.text()).toContain('"servers"')
  })

  // A stale or hand-edited value must not blank the connect section. The second
  // case is the one a plain `in` check waves through: every object inherits
  // toString, so the lookup would yield a function and render nothing.
  it.each(['not-a-client', 'toString'])('falls back to the default when the stored client is %s', key => {
    localStorage.setItem('mcp-docs-client', key)
    const wrapper = mountDocs()
    expect(wrapper.text()).toContain('claude mcp add --transport http paper')
  })
})
