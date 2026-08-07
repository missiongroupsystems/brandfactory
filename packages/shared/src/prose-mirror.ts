import type { ProseMirrorDoc } from './json'

// Walk a ProseMirror / TipTap JSON doc and flatten it to plain text.
// Deliberately lossy — this is LLM context, not a faithful rendering.
// Every block-level node (paragraph, heading, list_item, blockquote,
// code block, …) becomes its own block; text nodes concatenate into
// the block currently being built.
//
// **It lives in `shared` rather than in `agent`, where it was written, because
// it stopped having one consumer.** The prompt builders were the only callers
// while the only thing anyone flattened a section body *for* was a model. The
// brand hub's description line flattens one for a person, and `packages/web`
// must not import `packages/agent` (architecture.md: agent is backend-consumed,
// server-side only). A pure walk over JSON with no dependency beyond a type is
// exactly what `shared` is for; copying it into `web` would have left two
// flatteners to keep in step, differing in which node types they call blocks.
export function proseMirrorDocToPlainText(doc: ProseMirrorDoc): string {
  const blocks: string[] = []
  const state = { current: '' }
  walk(doc, blocks, state)
  flush(blocks, state)
  return blocks.join('\n\n').trim()
}

type PMNode = { type?: unknown; text?: unknown; content?: unknown }

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'code_block',
  'codeBlock',
  'list_item',
  'listItem',
  'bullet_list',
  'bulletList',
  'ordered_list',
  'orderedList',
  'horizontal_rule',
  'horizontalRule',
])

function walk(node: unknown, blocks: string[], state: { current: string }): void {
  if (node === null || typeof node !== 'object') return
  const n = node as PMNode
  if (typeof n.text === 'string') {
    state.current += n.text
    return
  }
  const type = typeof n.type === 'string' ? n.type : ''
  const isBlock = BLOCK_TYPES.has(type)
  if (isBlock) flush(blocks, state)
  if (Array.isArray(n.content)) {
    for (const child of n.content) walk(child, blocks, state)
  }
  if (isBlock) flush(blocks, state)
}

function flush(blocks: string[], state: { current: string }): void {
  if (state.current.length > 0) {
    blocks.push(state.current)
    state.current = ''
  }
}
