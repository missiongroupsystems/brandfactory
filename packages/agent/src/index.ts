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
  type ShapeResearchResult,
  type ShapeOutcome,
} from './research/shape'
export { markdownToDraftBody } from './research/markdown'
// Guideline auto-fill, Phase B: the single-section shaper (Path R — extract one
// label from the stored report, on the workspace's model). `stripCitationMarkers`
// is exported for Phase C, whose Path S applies the same rule to the section
// search's output.
export {
  shapeSectionFromReport,
  buildSectionShapePrompt,
  stripCitationMarkers,
  type ShapeSectionInput,
  type ShapeSectionResult,
  type SectionShapeOutcome,
} from './research/shapeSection'

// The Post Planner's engine (Phase E). Two stateless passes over a brand and a
// window: ideas, then copy. No DB, no project, no canvas — the caller hands in
// `BrandWithSections` and gets structured objects back.
export {
  ideatePostThemes,
  writePostCopy,
  buildThemesPrompt,
  buildCopyPrompt,
  applyBoundaries,
  type IdeateThemesAgentInput,
  type IdeateCopyAgentInput,
} from './social/ideate'

// The creator lookup (quick add, Phase F). One search-grounded completion over a
// platform and a handle, returning a draft a person confirms. It is the second
// stateless model-backed engine here and the first that reads the live web
// through `LLMProvider.completeGrounded` rather than `getModel` — see that
// method's docstring, and Phase E's write-up, for why `generateObject` cannot
// do this.
export {
  lookupCreator,
  buildLookupPrompt,
  applyLookupBoundaries,
  extractJson,
  type LookupCreatorInput,
  type BoundaryInput,
} from './influencer/lookup'
