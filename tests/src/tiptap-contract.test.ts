import { describe, it, expect } from 'vitest'
import { getSchema } from '@tiptap/core'
import { buildContentExtensions, readOnlyExtensions } from '../../src/shared/tiptap-extensions'
import { allowedNodeTypes, allowedMarkTypes } from '../../server/lib/validation.js'

// The "content contract" lives in three places that must agree on which TipTap
// node/mark types a stored document may contain:
//   1. the editor      — TiptapEditor.vue (can emit them)
//   2. the renderer     — readOnlyExtensions (can render them)
//   3. the sanitizer    — allowedNode/MarkTypes in validation.ts (accepts them)
// Legs 1 and 2 are now built from the same buildContentExtensions() factory, so
// they share one schema by construction. This test binds leg 3 to that schema:
// if they drift, stored content is silently rejected on save or rendered as a
// fallback, with no other signal. Keep them in lockstep here.

const renderSchema = getSchema(readOnlyExtensions)
const renderNodes = Object.keys(renderSchema.nodes).sort()
const renderMarks = Object.keys(renderSchema.marks).sort()

describe('TipTap content contract', () => {
  it('sanitizer node allowlist exactly matches the rendered schema', () => {
    expect([...allowedNodeTypes].sort()).toEqual(renderNodes)
  })

  it('sanitizer mark allowlist exactly matches the rendered schema', () => {
    expect([...allowedMarkTypes].sort()).toEqual(renderMarks)
  })

  it('editor and renderer contribute an identical node/mark schema', () => {
    // The editor adds only Placeholder (a decoration extension with no schema
    // nodes or marks) on top of the shared factory, so its schema must match the
    // renderer's exactly. This catches an extension added to one path but not the
    // shared factory.
    const editorSchema = getSchema(buildContentExtensions({ resizableTables: true }))
    expect(Object.keys(editorSchema.nodes).sort()).toEqual(renderNodes)
    expect(Object.keys(editorSchema.marks).sort()).toEqual(renderMarks)
  })
})
