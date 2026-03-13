import { describe, it, expect } from 'vitest'
import {
  normalizeSlug,
  validateLoginBody,
  validateRegisterBody,
  validatePostBody,
  sanitizePostContent,
} from '../../../server/lib/validation.js'

// ---------------------------------------------------------------------------
// normalizeSlug
// ---------------------------------------------------------------------------
describe('normalizeSlug', () => {
  it('trims whitespace', () => {
    expect(normalizeSlug('  hello  ')).toBe('hello')
  })

  it('lowercases the value', () => {
    expect(normalizeSlug('Hello-World')).toBe('hello-world')
  })

  it('returns an empty string for blank input', () => {
    expect(normalizeSlug('   ')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// validateLoginBody
// ---------------------------------------------------------------------------
describe('validateLoginBody', () => {
  it('returns null for a valid body', () => {
    expect(validateLoginBody({ email: 'user@example.com', password: 'password123' })).toBeNull()
  })

  it('requires email', () => {
    expect(validateLoginBody({ email: '', password: 'password123' })).toBe('Email is required.')
  })

  it('rejects malformed email', () => {
    expect(validateLoginBody({ email: 'not-an-email', password: 'password123' })).toBe(
      'Enter a valid email address.'
    )
  })

  it('requires password', () => {
    expect(validateLoginBody({ email: 'user@example.com', password: '' })).toBe(
      'Password is required.'
    )
  })

  it('requires password to be at least 8 chars', () => {
    expect(validateLoginBody({ email: 'user@example.com', password: 'short' })).toBe(
      'Password must be at least 8 characters.'
    )
  })

  it('trims and lowercases email before validating', () => {
    expect(
      validateLoginBody({ email: '  USER@EXAMPLE.COM  ', password: 'password123' })
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// validateRegisterBody
// ---------------------------------------------------------------------------
describe('validateRegisterBody', () => {
  const valid = {
    name: 'Alice',
    email: 'alice@example.com',
    password: 'password123',
    inviteCode: 'secret',
  }

  it('returns null for a fully valid body', () => {
    expect(validateRegisterBody(valid)).toBeNull()
  })

  it('requires name', () => {
    expect(validateRegisterBody({ ...valid, name: '' })).toBe('Name is required.')
  })

  it('requires name length >= 2', () => {
    expect(validateRegisterBody({ ...valid, name: 'A' })).toBe(
      'Name must be at least 2 characters.'
    )
  })

  it('requires invite code', () => {
    expect(validateRegisterBody({ ...valid, inviteCode: '' })).toBe('Invite code is required.')
  })

  it('requires email', () => {
    expect(validateRegisterBody({ ...valid, email: '' })).toBe('Email is required.')
  })

  it('rejects malformed email', () => {
    expect(validateRegisterBody({ ...valid, email: 'bad' })).toBe(
      'Enter a valid email address.'
    )
  })

  it('requires password', () => {
    expect(validateRegisterBody({ ...valid, password: '' })).toBe('Password is required.')
  })

  it('requires password length >= 8', () => {
    expect(validateRegisterBody({ ...valid, password: 'abc' })).toBe(
      'Password must be at least 8 characters.'
    )
  })
})

// ---------------------------------------------------------------------------
// validatePostBody
// ---------------------------------------------------------------------------
describe('validatePostBody', () => {
  const valid = {
    title: 'My Post Title',
    slug: 'my-post-title',
    excerpt: 'A brief excerpt for the post.',
    content: { type: 'doc', content: [] },
    published: false,
  }

  it('returns null for a fully valid body', () => {
    expect(validatePostBody(valid)).toBeNull()
  })

  it('requires title', () => {
    expect(validatePostBody({ ...valid, title: '' })).toBe('Title is required.')
  })

  it('requires title length >= 3', () => {
    expect(validatePostBody({ ...valid, title: 'Hi' })).toBe(
      'Title must be at least 3 characters.'
    )
  })

  it('requires slug', () => {
    expect(validatePostBody({ ...valid, slug: '' })).toBe('Slug is required.')
  })

  it('rejects invalid slug characters', () => {
    expect(validatePostBody({ ...valid, slug: 'My Post' })).toBe(
      'Slug must use lowercase letters, numbers, and hyphens only.'
    )
  })

  it('rejects slug with trailing hyphen', () => {
    expect(validatePostBody({ ...valid, slug: 'my-post-' })).toBe(
      'Slug must use lowercase letters, numbers, and hyphens only.'
    )
  })

  it('requires excerpt', () => {
    expect(validatePostBody({ ...valid, excerpt: '' })).toBe('Excerpt is required.')
  })

  it('requires excerpt length >= 12', () => {
    expect(validatePostBody({ ...valid, excerpt: 'Too short.' })).toBe(
      'Excerpt should be at least 12 characters.'
    )
  })

  it('requires content to be non-null', () => {
    expect(validatePostBody({ ...valid, content: null })).toBe('Body content is required.')
  })

  it('rejects non-boolean published value', () => {
    expect(validatePostBody({ ...valid, published: 'yes' as unknown as boolean })).toBe(
      'Published must be a boolean.'
    )
  })

  it('accepts published: true', () => {
    expect(validatePostBody({ ...valid, published: true })).toBeNull()
  })

  it('accepts omitted published (undefined)', () => {
    const { published: _published, ...rest } = valid
    expect(validatePostBody(rest)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// sanitizePostContent
// ---------------------------------------------------------------------------
describe('sanitizePostContent', () => {
  it('accepts a minimal valid doc', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects non-doc root nodes', () => {
    const result = sanitizePostContent({ type: 'paragraph', content: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/doc node/)
    }
  })

  it('rejects non-object input', () => {
    const result = sanitizePostContent('invalid')
    expect(result.ok).toBe(false)
  })

  it('rejects unknown node types', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [{ type: 'script', content: [] }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/Unsupported content node type/)
    }
  })

  it('rejects prototype-pollution keys', () => {
    const malicious = Object.create(null) as Record<string, unknown>
    malicious['__proto__'] = {}
    malicious['type'] = 'doc'
    malicious['content'] = []
    const result = sanitizePostContent(malicious)
    expect(result.ok).toBe(false)
  })

  it('accepts a text node with marks', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hello',
              marks: [{ type: 'bold' }],
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects unsupported mark types', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hello',
              marks: [{ type: 'xss' }],
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/Unsupported mark type/)
    }
  })

  it('rejects marks on non-text nodes', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          marks: [{ type: 'bold' }],
          content: [],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/Only text nodes can include marks/)
    }
  })

  it('accepts a safe https link mark', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Click',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects javascript: links', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/safe protocol/)
    }
  })

  it('accepts a valid heading with level', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Title' }],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects heading level out of range', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 5 },
          content: [{ type: 'text', text: 'Title' }],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/levels 1 to 3/)
    }
  })

  it('accepts a safe https image', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'https://example.com/photo.jpg', alt: 'A photo' },
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects http image sources', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'http://insecure.example.com/photo.jpg' },
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/safe source/)
    }
  })

  it('accepts a base64 data image', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'data:image/png;base64,abc123==' },
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects content exceeding max depth', () => {
    // Build a deeply nested structure (> 16 levels)
    let node: Record<string, unknown> = { type: 'paragraph', content: [] }
    for (let i = 0; i < 18; i++) {
      node = { type: 'blockquote', content: [node] }
    }
    const result = sanitizePostContent({ type: 'doc', content: [node] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/nested too deeply/)
    }
  })

  it('strips unknown fields from nodes', () => {
    const result = sanitizePostContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello' }],
          unknownField: 'evil',
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/Unsupported field/)
    }
  })
})
