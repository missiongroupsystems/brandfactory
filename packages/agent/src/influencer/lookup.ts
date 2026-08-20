import { z } from 'zod'
import type { GroundedResult, LLMProvider, LLMProviderSettings } from '@brandfactory/adapter-llm'
import {
  InfluencerNameSchema,
  InfluencerVerticalSchema,
  LookupAccountDraftSchema,
  LookupUrlSchema,
  type LookupDraft,
  type LookupFound,
  type LookupInfluencerInput,
  type LookupInfluencerResult,
  type LookupPlatform,
  type ResearchSource,
} from '@brandfactory/shared'

// ---------------------------------------------------------------------------
// The creator-lookup engine — one grounded completion, four rules in code
// ---------------------------------------------------------------------------
//
// A platform and a handle in; a draft somebody confirms out. Nothing here writes
// a row, reads the database or knows what a workspace is, which is
// `ideatePostThemes`' property and is why both are safe to retry.
//
// **Everything in this file is a consequence of Phase E's measurements.** The
// spike ran 78 calls across three models and two prompt shapes and the write-up
// is `docs/completions/influencer-quick-add-phase-e-the-lookup-spike.md`. Four
// of its findings are load-bearing here and each is marked where it lands:
//
// 1. The engine cannot be `generateObject` — it never engages the web plugin and
//    fails **silently**. Hence `llmProvider.completeGrounded`, whose own
//    docstring carries the table.
// 2. The user turn is a search query, not a brief. See `buildLookupPrompt`.
// 3. `response_format` is not enforced, so the shape is asked for in the prompt
//    and validated here. See `readEnvelope`.
// 4. A citation the model wrote is not evidence. See `applyLookupBoundaries`.
//
// The rules are written for the model *and* enforced afterwards, which is
// `applyBoundaries`' precedent from `social/ideate.ts`: *"the rules below are
// written for the model because a model that understands them produces better
// ideas, and then `applyBoundaries` drops whatever ignored them anyway."*

/**
 * The response shape the model is asked for.
 *
 * Hand-written JSON Schema rather than `z.toJSONSchema(LookupDraftSchema)`, and
 * the reason is finding 3: the provider does not enforce this, so its only job
 * is to *describe*. A schema generated from the wire type would be stricter than
 * the model can follow — `LookupDraftSchema` refuses a handle with a leading
 * `@`, and a model that returns one should have it stripped rather than have the
 * whole answer rejected. What is sent is loose; what is kept is strict.
 */
const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'name', 'vertical', 'accounts'],
  properties: {
    outcome: { type: 'string', enum: ['ok', 'not-found'] },
    name: { type: ['string', 'null'] },
    vertical: { type: ['string', 'null'] },
    accounts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['platform', 'handle', 'followers', 'engagementRate', 'url', 'sourceUrl'],
        properties: {
          platform: { type: 'string' },
          handle: { type: 'string' },
          followers: { type: ['integer', 'null'] },
          engagementRate: { type: ['number', 'null'] },
          url: { type: ['string', 'null'] },
          sourceUrl: { type: ['string', 'null'] },
        },
      },
    },
  },
}

/**
 * The envelope, parsed loosely.
 *
 * `ideatePostThemes`' rule, for its reason: an all-or-nothing `safeParse` over
 * the whole answer throws away a good account because a sibling was malformed,
 * and this call is paid for. The envelope only has to *be* an object with an
 * `accounts` array; each account is then read alone.
 */
const EnvelopeSchema = z.object({
  outcome: z.string().optional(),
  name: z.unknown().optional(),
  vertical: z.unknown().optional(),
  accounts: z.array(z.unknown()).default([]),
})

/** The canonical profile URL, for the five platforms where a handle produces one. */
const PROFILE_URL: Record<LookupPlatform, (handle: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}/`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}/`,
}

/**
 * How each platform is named **to the model and to the search engine**.
 *
 * Deliberately not `INFLUENCER_PLATFORM_LABELS`, which is `packages/web-next`'s
 * and is a screen label. This one goes into a search query, so it is the word a
 * person would type — and the two would drift apart the moment either had a
 * reason to change. `web-next` is not a dependency of this package in any case.
 */
const SEARCH_LABEL: Record<LookupPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
}

export interface LookupCreatorInput extends LookupInfluencerInput {
  llmProvider: LLMProvider
  llmSettings: LLMProviderSettings
  signal?: AbortSignal
  /**
   * What the call cost, handed to whoever composed this.
   *
   * **A callback rather than a field on the result**, because the result
   * crosses the wire to a browser and a price does not belong there. The
   * caller that pays for the call is the deployment, and the deployment's
   * record of it is its log — `server/src/influencer/lookup.ts` is where that
   * happens.
   *
   * `costUsd` is `null` where the provider did not say, which is not zero.
   * `GroundedResult.costUsd` makes the same distinction for the same reason.
   */
  onUsage?: (usage: { costUsd: number | null }) => void
}

/**
 * The two messages. **The split is load-bearing and it is finding 2.**
 *
 * Every other model-backed path in this repository puts the whole brief in the
 * system message and a one-line instruction in the user turn — `ideatePostThemes`
 * sends *"Plan the window described in the brief"*. That shape **breaks grounding
 * here**, and it does so quietly.
 *
 * A grounding layer does not extract a query from the user message; it searches
 * the user message. The spike's first shape asked
 *
 * > Instagram profile @lennardy — follower count, real name, and what they post
 * > about. Read https://www.instagram.com/lennardy/. That is the account…
 *
 * and retrieved a Bubble forum thread on reading Instagram without the Graph
 * API, a Quora question about finding somebody's Instagram, and a StackOverflow
 * post about the Instagram API. Every page was about *the act of looking up a
 * follower count*, because that is what the sentence is about. The handle was one
 * token in a paragraph of instructions and it drowned; the model then reported
 * `not-found` correctly, on evidence it had never been given.
 *
 * Moving to a bare query took identity resolution from **1/10 to 6/10** with the
 * rules unchanged. So `query` is four words and holds no instruction, no URL and
 * no verb, and everything else — including which page to read — is in `system`,
 * where the search layer cannot see it.
 *
 * Exported for its test: that the platform, the handle and the canonical profile
 * URL all reach the model is not observable through `completeGrounded`.
 */
export function buildLookupPrompt(
  platform: LookupPlatform,
  handle: string,
): { system: string; query: string } {
  const url = PROFILE_URL[platform](handle)
  const label = SEARCH_LABEL[platform]

  const system = [
    '## Creator lookup',
    '',
    'You look up one public social media creator and report what you can verify about them. You are answering into a media list that a company negotiates rates against, so a blank field is cheap and a wrong figure is not.',
    '',
    '## This request',
    '',
    `Platform: ${label}`,
    `Handle: \`${handle}\``,
    `Profile URL: ${url} — that is the account. If it does not exist, or the handle on it is not \`${handle}\`, the outcome is "not-found".`,
    '',
    'The search results in this conversation were retrieved for that handle. Read them for the account above, and ignore any page about a different person with a similar name.',
    '',
    'Rules, in order of importance:',
    '',
    // Rule 1 first because its violation is the one that costs money: an
    // invented follower count lands in the column a rate is negotiated against.
    '1. **Never invent a number.** If you cannot find a follower count on a page you actually read, return `null` for it. A missing number is a blank field somebody fills in; a wrong number is a fact this company acts on. There is no credit for completeness here.',
    "2. **Every figure carries the URL you read it from**, in that account's `sourceUrl`. A figure with no source is discarded before anyone sees it, so returning one is wasted work.",
    '3. **A source must be a page for the handle you were asked about, on the platform you were asked about.** A page about a different person with a similar name is worse than no answer.',
    '4. **Report the account you were asked about, on the platform you were asked about.** You may add other accounts the same creator holds if the profile itself links them, but the requested one comes first and is never omitted.',
    `5. **\`vertical\` is one of exactly these, or \`null\`:** ${InfluencerVerticalSchema.options.join(', ')}. There is no "other" and no "lifestyle" — a creator who fits none of them is \`null\`, which this product reads as a genuine generalist.`,
    '6. **`engagementRate` is almost always `null`.** No platform publishes it. Return a number only if you read one on a page you cite, and never compute one from a sample.',
    "7. **`name` is the person's real name as the profile presents it**, not the handle and not a channel title. If the profile shows only a given name, return only the given name.",
    '8. **`outcome` is `not-found`** when the account does not exist, is private with nothing readable, or you cannot tell whether the page you found is the right person. Guessing is the failure mode this field exists to avoid.',
    '',
    // The shape is stated here as well as sent as a schema, because finding 3
    // says the schema is not enforced. This paragraph is what actually produces
    // well-formed JSON.
    'Return exactly this shape, and nothing outside it — no prose before it, no code fence around it:',
    '',
    '{"outcome":"ok"|"not-found","name":string|null,"vertical":string|null,',
    ' "accounts":[{"platform":string,"handle":string,"followers":integer|null,',
    '              "engagementRate":number|null,"url":string|null,"sourceUrl":string|null}]}',
  ].join('\n')

  // Search terms only. A URL here is itself a phrase the engine matches on, so
  // it stays in `system`.
  return { system, query: `${label} @${handle} followers` }
}

/**
 * Pull the object out of whatever came back.
 *
 * `response_format` reliably produces an unfenced body and unreliably produces a
 * conforming one, so the fast path is a plain `JSON.parse` and the fallback
 * handles a fenced or prose-wrapped answer. **The fallback is not a licence** —
 * an answer needing it is an answer whose shape was ignored, and everything
 * after this point assumes nothing about what the fields contain.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    // fall through
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

/** Case-folded, `@`-stripped, whitespace-trimmed. The comparison every rule uses. */
function fold(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/^@/, '') : ''
}

/**
 * The characters a handle is made of, and therefore the characters that must
 * **not** sit against one for it to count as named.
 *
 * Instagram and TikTok both allow letters, digits, `.` and `_`; YouTube adds
 * `-`. So `lennardy` inside `.../lennardy/` is the handle, and `lennardy`
 * inside `.../lennardyeong/` is not.
 */
const HANDLE_CHAR = '[a-z0-9._-]'

/**
 * The shortest handle a **page title** may ground.
 *
 * A title is prose, and a one- or two-character run bounded by spaces is an
 * ordinary English word: "How to read **a** follower count" names the handle
 * `a` by any boundary rule anybody can write. A URL is an address rather than a
 * sentence, so it carries no such runs by accident and stays the evidence for
 * the short handles. A real profile page's URL always contains the handle —
 * that is what a profile URL is — so this costs nothing that was ever real.
 */
const MIN_TITLE_HANDLE = 3

/**
 * Does this text name the handle — as a handle, not as a run of letters?
 *
 * **A bare `String.includes` is not enough, and the failure is not theoretical.**
 * `InfluencerHandleSchema` is `.min(1)`, so a one- or two-character handle
 * (`@a`, `@me`) appears somewhere inside almost every URL and page title ever
 * retrieved — which would make rule 3 below pass against a retrieval log about
 * nobody in particular, and rule 3 is the whole of this feature's safety
 * argument. `@a` matched `https://openrouter.ai/…` before this existed.
 *
 * So the match has to be bounded on both sides by something a handle cannot
 * contain. `/lennardy/` matches, `(@lennardy)` matches, `lennardyeong` does
 * not, and the `a` in `instagram` does not.
 *
 * The handle is escaped before it becomes a pattern: it may legitimately carry
 * a `.`, and an unescaped one would match any character. Nothing here can
 * backtrack — the pattern is a literal run between two lookarounds.
 */
function bounded(haystack: string, handle: string): boolean {
  if (handle === '' || haystack === '') return false
  const literal = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<!${HANDLE_CHAR})${literal}(?!${HANDLE_CHAR})`).test(haystack)
}

/** Was this retrieved page about the handle that was asked for? */
function pageNamesHandle(source: ResearchSource, handle: string): boolean {
  return (
    bounded(fold(source.url), handle) ||
    (handle.length >= MIN_TITLE_HANDLE && bounded(fold(source.title), handle))
  )
}

/**
 * A URL field, read **on its own rather than as part of the account**.
 *
 * Anything that is not an `http(s)` URL becomes `null`, which is what the two
 * URL fields mean when the lookup has nothing for them. The alternative — the
 * shape this file shipped with — was to let the field fail
 * `LookupAccountDraftSchema` and take the whole account with it, so a model
 * answering `url: "instagram.com/lennardy"` (no scheme, an ordinary thing for a
 * model to write) produced `not-found` for a creator whose follower count had
 * been read from a real page and grounded against a real retrieval log. The
 * person was then told the account could not be verified, which was untrue.
 *
 * `EnvelopeSchema`'s docstring makes this argument one level up — a sibling's
 * malformation must not discard a good answer — and this is the same argument
 * one level down. Refusing the `javascript:` URL is still absolute: it is
 * dropped, never rendered, and never stored.
 */
function readUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = LookupUrlSchema.safeParse(value.trim())
  return parsed.success ? parsed.data : null
}

/**
 * The follower figure, read on its own for the same reason as the URLs above.
 *
 * A model that answers `1200.5` or `-4` has not given a follower count, and the
 * honest reading of that is the blank the person fills in — not the loss of the
 * name, the vertical and the profile URL that came back correct beside it.
 * The zero is handled later, by rule 1, because a zero is a different failure:
 * it is a *claim* rather than a malformation.
 */
function readFollowers(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * The name, read on its own and **through the record's own schema**.
 *
 * `InfluencerNameSchema` is `.trim().min(1).max(200)`, and this was the one
 * field in this function that did not go through a shared schema: rule 7 kept
 * anything non-empty, so a model answering with a channel title and its tagline
 * produced a `LookupDraft` that **fails `LookupDraftSchema`** — a value whose own
 * declared type it does not satisfy. Nothing parses the result on the way out
 * (`routes/influencers.ts` answers `c.json(result)`), so it crossed the wire,
 * filled the sheet's name box, and was refused by the *create* the person then
 * submitted — after they had paid for the lookup.
 *
 * **Refused rather than truncated.** `readUrl` and `readFollowers` make the same
 * call for the same reason: a 400-character string cut at 200 is not a name, it
 * is a sentence with its end removed, and this feature's whole argument is that
 * a blank a person fills in beats a value they cannot check. It becomes
 * `found.name === false`, which the sheet already renders as *"No name could be
 * verified — this one is yours to fill in."*
 *
 * The schema trims, so the parsed value is what the echo test below compares.
 */
function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parsed = InfluencerNameSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export interface BoundaryInput {
  platform: LookupPlatform
  handle: string
  /** The provider's retrieval log — what was really fetched. */
  retrieved: readonly ResearchSource[]
}

/**
 * **The four rules, as code.** This is the file's centre and its test is the
 * important one in this release.
 *
 * Each rule exists because a real model broke it in the spike, and the comment
 * on each says which one and how.
 */
export function applyLookupBoundaries(
  raw: unknown,
  input: BoundaryInput,
): { draft: LookupDraft; found: LookupFound; matched: boolean } {
  const envelope = EnvelopeSchema.safeParse(raw)
  const wantedHandle = fold(input.handle)

  const empty = {
    draft: { name: null, accounts: [], vertical: null } satisfies LookupDraft,
    found: { name: false, followers: false, vertical: false, url: false } satisfies LookupFound,
    matched: false,
  }
  if (!envelope.success) return empty

  // ---- Rule 3, first, because it gates everything else -------------------
  //
  // **Checked against the retrieval log, never against the model's citation.**
  // The plan's wording — "the handle has to appear in the URL or the page title,
  // checked here, not promised in the prompt" — reads as satisfied by inspecting
  // the returned `sourceUrl`. It is not: the spike's `openai/gpt-5.1:online`
  // fetched nothing across 26 calls and passed exactly that check 9 times out of
  // 13, by echoing back the profile URL it had been handed and, on the cases
  // where it had nothing at all, by inventing an analytics URL carrying a
  // real-looking profile id.
  //
  // So the question is not "did the model cite this handle" but "was a page
  // naming this handle actually fetched". `retrieved` comes from the provider's
  // own log and the model cannot write to it.
  //
  // An empty log fails this. `GroundedResult.retrieved` documents that empty
  // means *no evidence* and is indistinguishable from *no search* — and a
  // follower count with no evidence behind it is the thing this whole function
  // exists to stop.
  //
  // **Matched as a handle rather than as a substring** — see `pageNamesHandle`.
  // A bare `includes` passes for any one- or two-character handle against any
  // retrieval log at all, which turns this gate off for exactly the accounts a
  // reviewer is least able to check.
  const grounded = input.retrieved.some((source) => pageNamesHandle(source, wantedHandle))

  // ---- Rule 4: the account that was asked for --------------------------
  //
  // **Matched case-folded on the platform.** Finding 3 again: the provider does
  // not enforce the schema and every winning capture in the spike returned
  // `"Instagram"` where the enum lists `instagram`. An exact match here would
  // have discarded thirteen complete, correct, well-sourced accounts and
  // reported `not-found` — the cheapest possible defect to miss, because the
  // answer looks like an honest failure.
  //
  // The handle is folded for the same reason and one more: `InfluencerHandleSchema`
  // refuses a leading `@`, so a model returning `@lennardy` would fail the
  // *create* the person then submits. Stripping it here is the one place that
  // repair belongs — the schema's refusal is about what may be stored, not about
  // what a model may say.
  const accounts = envelope.data.accounts
    .map((candidate) => {
      const record = candidate as Record<string, unknown> | null
      if (!record || typeof record !== 'object') return null
      // **Only `platform` and `handle` may fail this parse**, and that is
      // deliberate: they are the account's identity, and an answer that cannot
      // say which account it is about is not an answer. Every other field is
      // read on its own and falls to `null` — a malformed figure or link is a
      // blank somebody fills in, never a reason to discard a grounded answer.
      // `readUrl` and `readFollowers` carry the argument.
      const parsed = LookupAccountDraftSchema.safeParse({
        platform: fold(record['platform']),
        handle: fold(record['handle']),
        followers: readFollowers(record['followers']),
        // Rule 6 drops this unconditionally a few lines below, so parsing what
        // the model sent could only ever lose a good account over a figure that
        // was never going to be kept.
        engagementRate: null,
        url: readUrl(record['url']),
        sourceUrl: readUrl(record['sourceUrl']),
      })
      return parsed.success ? parsed.data : null
    })
    .filter((account): account is NonNullable<typeof account> => account !== null)

  const wanted = accounts.find(
    (account) => account.platform === input.platform && account.handle === wantedHandle,
  )

  // The requested account is the whole answer. **Other accounts the model
  // volunteered are dropped**, and that is a narrowing of the plan's rule 4,
  // which allowed them. Quick add asks about one account; a second one arrives
  // ungrounded — nothing was searched for *its* handle, so rule 3 cannot be
  // applied to it, and shipping an unverified account beside a verified one puts
  // the person in the position of telling them apart. The full form is where a
  // creator's other accounts get added.
  if (!wanted) return empty

  // ---- Rules 1 and 2: a figure needs a source, and the source must be real --
  //
  // Three conditions, all of which must hold for the number to survive:
  // the model cited something, a page naming the handle was actually fetched,
  // and — the cheap one — the figure is not a zero standing in for "unknown".
  //
  // **A zero is dropped rather than kept.** `InfluencerFollowersSchema` accepts
  // 0 as a real count and a genuinely new account can have one, but a model that
  // could not find a figure and wrote `0` rather than `null` is the exact failure
  // rule 1 describes, and 0 would file a real creator in Nano. Losing the
  // hypothetical brand-new account costs one typed digit; keeping the false zero
  // costs a wrong tier.
  const sourced = wanted.followers !== null && wanted.sourceUrl !== null
  const keepFollowers = sourced && grounded && wanted.followers !== 0

  // ---- Rule 5: the closed enum, or null ----------------------------------
  //
  // The union has no `other` member on purpose, so a model returning
  // `"lifestyle"` produces a generalist rather than a new enum member. Folded
  // first, because the same capitalisation problem applies.
  const verticalParsed = InfluencerVerticalSchema.safeParse(fold(envelope.data.vertical))
  const vertical = verticalParsed.success ? verticalParsed.data : null

  // ---- Rule 7: a name is a name, not the handle --------------------------
  //
  // **A `name` equal to the handle is discarded.** A model that cannot identify
  // the person often echoes the handle back — the spike's `generateObject` probes
  // returned `"name":"lennardy"` every time — and that is not a name, it is the
  // question restated. Letting it through would put `lennardy` in the Creator
  // column of a media list.
  //
  // Ungrounded names go too: a name is an identity claim about a real person and
  // it is as inventable as a number.
  //
  // **Read through `InfluencerNameSchema` rather than tested for emptiness**, so
  // what this returns is a `LookupDraft` the wire type actually accepts. See
  // `readName`: a name the record could not hold is a blank somebody fills in.
  const rawName = readName(envelope.data.name)
  const nameIsEcho = rawName !== null && fold(rawName) === wantedHandle
  const keepName = rawName !== null && !nameIsEcho && grounded

  // `url` is the profile URL. It is kept without the grounding check, because it
  // is derived from the handle rather than discovered — the prompt handed the
  // model the canonical URL and getting it back is not evidence of anything. It
  // is also harmless: it points at the account the person typed.
  const draft: LookupDraft = {
    name: keepName ? rawName : null,
    vertical,
    accounts: [
      {
        ...wanted,
        followers: keepFollowers ? wanted.followers : null,
        // **Engagement is dropped unconditionally.** No platform publishes it, so
        // a model reporting one has computed it from a sample or invented it —
        // and across all 78 spike calls not one model returned a figure here, so
        // this drops nothing that was ever offered. The plan's "no engagement
        // rate from the lookup unless the spike proves it" as a line of code.
        engagementRate: null,
        sourceUrl: keepFollowers ? wanted.sourceUrl : null,
      },
    ],
  }

  return {
    draft,
    found: {
      name: keepName,
      followers: keepFollowers,
      vertical: vertical !== null,
      url: wanted.url !== null,
    },
    matched: true,
  }
}

/**
 * One lookup. A platform and a handle in, a draft out.
 *
 * Throws only what the provider throws — network, vendor refusal, abort — which
 * the caller maps the way it maps every vendor failure. **`not-found` is not an
 * exception**, because it is not a fault the user can act on by retrying; it
 * rides in the body, which is why the route answers 200.
 */
export async function lookupCreator(input: LookupCreatorInput): Promise<LookupInfluencerResult> {
  const prompt = buildLookupPrompt(input.platform, input.handle)

  const result: GroundedResult = await input.llmProvider.completeGrounded({
    settings: input.llmSettings,
    system: prompt.system,
    query: prompt.query,
    jsonSchema: RESPONSE_SCHEMA,
    signal: input.signal,
  })

  // Reported before the answer is judged, so a `not-found` and an `invalid-shape`
  // are recorded as the paid calls they are. A lookup that found nobody cost the
  // same as one that found somebody.
  input.onUsage?.({ costUsd: result.costUsd })

  const raw = extractJson(result.text)
  const nothing = { name: false, followers: false, vertical: false, url: false }

  // **An answer that is not an object at all is `invalid-shape`.** It names the
  // model rather than the creator, which is a different sentence to the user
  // than "we could not find them" — `ideatePostThemes` draws the same line
  // between `invalid-shape` and `no-ideas`.
  if (raw === null || typeof raw !== 'object') {
    return { outcome: 'invalid-shape', draft: null, found: nothing, sources: result.retrieved }
  }

  const { draft, found, matched } = applyLookupBoundaries(raw, {
    platform: input.platform,
    handle: input.handle,
    retrieved: result.retrieved,
  })

  // **The model's own `outcome` is read as a veto, never as a licence.** A
  // `not-found` from the model is believed, because a model saying it could not
  // find something is the one claim it has no incentive to fabricate. An `ok` is
  // not believed on its own — `matched` is this file's judgement and it is what
  // decides.
  const modelSaysMissing = String((raw as Record<string, unknown>)['outcome'] ?? '') === 'not-found'
  if (modelSaysMissing || !matched) {
    return { outcome: 'not-found', draft: null, found: nothing, sources: result.retrieved }
  }

  return { outcome: 'ok', draft, found, sources: result.retrieved }
}
