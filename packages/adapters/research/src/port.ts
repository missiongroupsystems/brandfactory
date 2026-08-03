import type { ResearchSource } from '@brandfactory/shared'

// ---------------------------------------------------------------------------
// The research port — two methods, because a job is start-then-wait
// ---------------------------------------------------------------------------
//
// **The port exists for replaceability, not for shipping two providers**
// (locked decision 5). One vendor is implemented; the second implementation
// that ships is `NoopResearchProvider`, which is a refusal rather than a
// finder.
//
// That is not hypothetical caution. 3A measured the surface this is built on
// and found the vendor's own migration guide pointing at a successor:
// *"Sonar's async API maps to Agent API background runs"* — `POST /v1/agent`
// with `background: true`, a different status vocabulary, and
// `sonar-deep-research` expressed as a preset rather than a model. The old line
// works, is documented, and has no published sunset date. When that changes,
// what changes here is one file behind this interface.

/**
 * What a finder needs. **`jobId` is ours**, and it is the vendor idempotency
 * key: a `start` that is retried after a timeout must not buy a second report.
 *
 * `model` is request input rather than provider construction, which is what
 * keeps decision 10 cheap to revisit — a Quick mode would be a config value and
 * an enum member, not a rewrite. 3A measured Deep at $0.377 so the decision
 * stands, but the shape that makes it revisable costs nothing to keep.
 */
export interface ResearchRequest {
  jobId: string
  brandName: string
  /** The hard gate (decision 4). No website, no research — enforced upstream. */
  websiteUrl: string
  model: string
}

/**
 * What one run consumed.
 *
 * **`costUsd` is reported by the vendor, not inferred by us** — 3A found
 * `usage.cost.total_cost` in the live body, agreeing with the published rate
 * card to five decimal places. That upgrades decision 12's daily budget guard
 * from an estimate to a ledger, and it is why this rides on the port rather
 * than being recomputed by a caller holding a stale rate card.
 *
 * `null` where a provider cannot say. The guard must treat unknown as
 * unknown — never as zero.
 */
export interface ResearchUsage {
  costUsd: number | null
  searchQueries: number | null
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  citationTokens: number | null
}

/**
 * Where a run has got to, in the provider's terms.
 *
 * **Three states, not five.** `NO_FINDINGS` and `CANCELLED` are ours, live in
 * `ResearchStatus`, and are decided by the caller: a report that says the site
 * gave it nothing to work with is a *completed* run to every vendor, and 3A's
 * live run proves the shape — its `Visual guidelines` section opens "Limited
 * explicit information", which is a finder doing its job honestly. Deciding
 * that here would put a domain judgement inside the vendor boundary.
 */
export type ResearchJobState =
  | { status: 'running' }
  | {
      status: 'completed'
      /** The report, as markdown. A deliverable in its own right (decision 5). */
      report: string
      /** Distinct citations, deduplicated by URL, in the order the vendor gave them. */
      sources: ResearchSource[]
      usage: ResearchUsage
    }
  | { status: 'failed'; error: string }

/**
 * What one section's auto-fill needs (guideline auto-fill, Phase A).
 *
 * The deep run profiles a whole brand; this asks for **one guideline section**,
 * synchronously — the caller is a user watching a spinner, not a ticker
 * sweeping job rows. `websiteUrl` is the same hard gate as `ResearchRequest`'s
 * and it works harder here: the A0 spike ran the identical prompt with and
 * without pinning search to this URL's domain, and the unpinned run wrote a
 * confident, cited section about a same-named other company. The URL in the
 * prompt is a suggestion; the domain filter derived from it is the enforcement.
 *
 * `existingLabels` keeps the vendor from restating a neighbouring section's
 * content — the same job `buildShapePrompt` does for the shaping pass.
 *
 * No `jobId` and no idempotency key, deliberately: nothing is persisted at the
 * vendor to retry into, and a double-send costs cents, not $0.38 — the plan
 * puts the double-click guard on the client and the per-day cap behind it.
 */
export interface SectionSearchRequest {
  brandName: string
  /** The hard gate (decision 4 / the Casa Vostra rule). Enforced upstream. */
  websiteUrl: string
  /** The section's label, e.g. "Voice & tone". Prompt input, echoed back by the caller. */
  label: string
  /** The `SUGGESTED_SECTIONS` description when the label matches one. */
  description?: string
  /** Labels the brand's guidelines already have, so the text does not restate them. */
  existingLabels: string[]
  model: string
}

/**
 * What the search wrote.
 *
 * **An empty `content` is a result, not an error** — the prompt tells the
 * model to say so plainly and stop when it finds too little, and classifying
 * that (`no-material`, per decision 7) is the service's domain judgement, not
 * an adapter guess. Network and HTTP failures still throw, same as the other
 * two methods.
 */
export interface SectionSearchResult {
  /** The section body, as markdown. May carry the model's "too little to go on". */
  content: string
  sources: ResearchSource[]
  usage: ResearchUsage
}

export interface ResearchProvider {
  start(req: ResearchRequest): Promise<{ externalId: string }>
  poll(externalId: string): Promise<ResearchJobState>
  /** One section, synchronously, on a search-grounded model. Seconds and cents. */
  searchSection(req: SectionSearchRequest): Promise<SectionSearchResult>
}

/**
 * The provider refused or the vendor did. Carries the HTTP status where there
 * was one, so a caller can tell "your key is wrong" (401, permanent) from "try
 * again" (429, 5xx) without parsing a message.
 */
export class ResearchProviderError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ResearchProviderError'
    this.status = status
  }
}

/**
 * Thrown by `NoopResearchProvider`. A separate type because it means something
 * different from a vendor failure: **nothing is wrong**, the deployment simply
 * has no research configured, and a caller that ever sees this has routed a
 * request past a gate that should have made the feature absent.
 */
export class ResearchNotConfiguredError extends ResearchProviderError {
  constructor() {
    super(
      'Research is not configured on this deployment. Set RESEARCH_PROVIDER and a provider key.',
      null,
    )
    this.name = 'ResearchNotConfiguredError'
  }
}
