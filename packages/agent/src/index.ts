// Agent orchestration — composes prompts, canvas context, and tool
// definitions and streams AgentEvents against an injected `LLMProvider`.
// Server-only (Phase 5). No DB, realtime, or HTTP deps — all side
// effects flow through the caller-supplied `CanvasOpApplier`.

export { streamResponse, type StreamResponseInput } from './stream'
export { buildSystemPrompt } from './prompts/system-prompt'
export {
  CANVAS_CONTEXT_UNPINNED_LIMIT,
  buildCanvasContext,
  type BuildCanvasContextInput,
} from './prompts/canvas-context'
export { buildCanvasTools, CANVAS_TOOL_NAMES } from './tools/definitions'
export type { CanvasOpApplier, AddCanvasBlockInput } from './tools/applier'
// Exported for 3F, which creates a brand-context thread server-side and needs
// the same literal `stream.ts` already branches on. Exporting the existing
// constant rather than declaring a third copy — see `templates.ts` on why a
// `shared` home for it is the deferred 1.4.0 refactor and not this phase.
export { BRAND_CONTEXT_TEMPLATE_ID } from './templates'

// Research, stage 2: the shaping pass (3D). Server-only, like everything here,
// and it runs on the *workspace's* configured model rather than on the search
// vendor that produced the report.
export {
  shapeResearchIntoSections,
  buildShapePrompt,
  DRAFT_TARGET_MAX_CHARS,
  type ShapeResearchInput,
} from './research/shape'
export { markdownToDraftBody } from './research/markdown'
