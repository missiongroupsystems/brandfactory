/**
 * The creator-lookup spike — Phase E of the quick-add plan.
 *
 * ```
 * pnpm -F @brandfactory/agent lookup-spike            # every model, every case
 * pnpm -F @brandfactory/agent lookup-spike --model anthropic/claude-sonnet-4.6:online
 * pnpm -F @brandfactory/agent lookup-spike --case novitalam
 * pnpm -F @brandfactory/agent lookup-spike --dry-run  # print the prompts, call nothing
 * ```
 *
 * **Nothing ships from this file.** It exists to answer four questions with
 * measurements rather than with the vendor's documentation, and to leave behind
 * the captures that Phase F's parser gets written against — `research/3A`'s
 * lesson, which the plan quotes: the parser is written against a real answer, not
 * against the docs.
 *
 * 1. Does a search-grounded model find **the right person** from a platform and a
 *    handle alone?
 * 2. Is the **follower count** it returns close enough to be worth showing?
 * 3. Does it cite a page **for that handle on that platform**, or a page about
 *    somebody else with a similar name?
 * 4. Does it **invent** anything — a figure with no source, an engagement rate no
 *    platform publishes, a vertical outside the closed enum?
 *
 * ## Why this calls OpenRouter directly instead of `generateObject`
 *
 * Every other model-backed path in this repository goes through the LLM port, and
 * Phase F's engine will too. This script does not, for two reasons that are both
 * about what a spike is for:
 *
 * - **`generateObject` throws the evidence away.** It returns a parsed object and
 *   discards the raw body — including OpenRouter's `annotations`, which is where
 *   the web plugin puts the URL and the page excerpt it actually read. Question 3
 *   is unanswerable without that array, and question 4 is only answerable by
 *   reading what the model said next to what it cited.
 * - **One of the three candidates cannot do structured output at all.** See
 *   `SPIKE_MODELS`: the Perplexity Sonar family lists neither `response_format`
 *   nor `structured_outputs` nor `tools` in its OpenRouter capabilities, so a
 *   harness built on `generateObject` could not run the search-native candidate,
 *   which is the comparison this phase exists to make.
 *
 * The HTTP call here sends `response_format: { type: 'json_schema' }` for the
 * models that support it, which is what the AI SDK sends under `generateObject`.
 * The path is the same; what differs is that this one keeps the envelope.
 *
 * `verifyPortPath()` at the end makes exactly one call the ordinary way — through
 * `createLLMProvider` and `generateObject` — so the spike also reports whether
 * Phase F's prescribed path runs at all against a search-grounded model.
 *
 * ## What it found
 *
 * The full write-up is
 * `docs/completions/influencer-quick-add-phase-e-the-lookup-spike.md`. The five
 * results that change how Phase F is built:
 *
 * 1. **`generateObject` never engages the web plugin.** It succeeds, returns a
 *    well-formed object, and quietly contains nothing — identical output to the
 *    non-search model. The engine must be the raw endpoint or `generateText`.
 * 2. **The user message is a search query, not a brief.** See `buildLookupPrompt`.
 *    Worth 1/10 → 6/10 on identity, with the rules unchanged.
 * 3. **`response_format` with `strict: true` is not enforced.** Every winning
 *    capture returned `"Instagram"` against an enum listing `instagram`.
 * 4. **A citation the model wrote is not evidence.** `openai/gpt-5.1:online`
 *    retrieved nothing across 26 calls and still returned invented sources —
 *    including two XiaoHongShu answers with plausible Chinese page titles and a
 *    real-looking RED profile id, both of which scored *close*. Rule 3 has to be
 *    checked against `annotations`, which is the retrieval log.
 * 5. **Instagram and TikTok work; XiaoHongShu does not.** Five figures on the
 *    first two, all within 7% of the media list, no wrong answer. Nought of three
 *    identified on the third.
 *
 * ## What a run costs
 *
 * A web-plugin lookup carries the search results in the prompt, so a call is
 * ~9,500 prompt tokens rather than the ~400 the prompt itself weighs. Measured at
 * roughly **$0.04 per lookup** on `anthropic/claude-sonnet-4.6:online`. A full
 * run is 13 cases × 3 models + 1 = 40 calls. The plan's *"one search-grounded
 * completion, same category as the Post Planner, no cap"* survives that — it is
 * two orders below the $0.38 a deep-research run costs — but the figure is an
 * order above what the plan assumed, so it is reported per run and written into
 * the completion document.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateObject, jsonSchema } from 'ai'
import { createLLMProvider } from '@brandfactory/adapter-llm'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(HERE, '../src/influencer/fixtures')

const apiKey = process.env['OPENROUTER_API_KEY']
if (!apiKey) {
  console.error('lookup-spike: OPENROUTER_API_KEY is required. Set it and re-run.')
  process.exit(1)
}
const resolvedKey: string = apiKey

// ---------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------
//
// **The plan asked for ten handles "spanning all six platforms". The roster
// cannot supply that, and this is the phase that found out.** The 146 creators
// 1.47.0 imported hold 216 accounts across exactly three platforms:
//
//     instagram 139    tiktok 71    xiaohongshu 6
//     youtube 0        facebook 0   linkedin 0
//
// That is a fact about the Curly's media list rather than about the enum — the
// enum is right, because the list this product is for is a Singapore F&B one and
// a YouTube-first creator will arrive the day somebody adds one. But it means the
// three empty platforms cannot be measured against a known truth, and pretending
// otherwise by inventing roster entries would make the scores fiction.
//
// So the set is split and the split is labelled:
//
// - **Ten roster cases**, whose `expect` figures are the media list's own — real
//   people, real handles, a truth to score against.
// - **Three ceiling cases** on YouTube, Facebook and LinkedIn, off the roster,
//   picked to be the *easiest possible* account on each: a global name with
//   millions of followers and an unambiguous handle. They answer "does grounding
//   work on this platform at all". A model that misses Jamie Oliver's YouTube
//   will certainly miss a Singapore micro-creator's, so a pass here is a ceiling
//   and not a promise, and a failure here is decisive.
//
// Three XiaoHongShu cases where the plan asked for two, because XHS is the
// platform this feature is most likely to fail on: it addresses users by an
// opaque numeric id, so `InfluencerAccountSchema.url` exists precisely because a
// handle does not resolve to a URL there. Two of the three carry non-Latin
// handles, where the plan asked for one.

type Platform = 'instagram' | 'tiktok' | 'xiaohongshu' | 'youtube' | 'facebook' | 'linkedin'

interface SpikeCase {
  /** The fixture's filename stem, and `--case`'s argument. */
  id: string
  platform: Platform
  handle: string
  /** `roster` cases carry a truth to score against; `ceiling` cases do not. */
  kind: 'roster' | 'ceiling'
  /**
   * What the media list says, where there is a media list.
   *
   * **These are a snapshot, not live truth.** The CSV 1.47.0 imported was
   * compiled around the September–November 2025 seeding window and it is now
   * 2026-08. A probe against `@novitalam` returned 448,000 where the roster says
   * 412,000 — an 8.7% drift over roughly ten months, which is a creator growing
   * rather than a model lying. `scoreFollowers` bands accordingly.
   */
  expect?: { name: string; followers: number; vertical: string | null }
  /** Why this case is in the set — printed in the report so a reader can weigh it. */
  note: string
}

export const SPIKE_CASES: readonly SpikeCase[] = [
  // ---- Instagram: 139 of the roster's 216 accounts ----
  {
    id: 'novitalam',
    platform: 'instagram',
    handle: 'novitalam',
    kind: 'roster',
    expect: { name: 'Novita Lam', followers: 412_000, vertical: 'fitness' },
    note: 'Handle equals the name. The easy case, and the plan’s own worked example.',
  },
  {
    id: 'ec24m',
    platform: 'instagram',
    handle: 'ec24m',
    kind: 'roster',
    expect: { name: 'Jamie Chua', followers: 1_500_000, vertical: 'fashion' },
    note: 'The roster’s largest account, behind a handle that resembles nothing. Identity resolution with no lexical help at all.',
  },
  {
    id: 'tippytapp',
    platform: 'instagram',
    handle: 'tippytapp',
    kind: 'roster',
    expect: { name: 'Jessica Tham', followers: 108_000, vertical: 'parenting' },
    note: 'Mid-tier, opaque handle, sits 8k over the 100k tier boundary — the case where a drifting figure changes the band.',
  },
  {
    id: 'lennardy-ig',
    platform: 'instagram',
    handle: 'lennardy',
    kind: 'roster',
    expect: { name: 'Lennard Yeong', followers: 534_000, vertical: 'food' },
    note: 'Paired with lennardy-tt: the same person on two platforms, so a model that answers the person rather than the account is visible.',
  },
  // ---- TikTok: 71 accounts ----
  {
    id: 'lennardy-tt',
    platform: 'tiktok',
    handle: 'lennardy',
    kind: 'roster',
    expect: { name: 'Lennard Yeong', followers: 981_600, vertical: 'food' },
    note: 'The pair. A model returning the Instagram figure here has answered the wrong question, and 1.47.0 records that this creator is Mega only as a sum.',
  },
  {
    id: 'chloeabeth',
    platform: 'tiktok',
    handle: 'chloeabeth',
    kind: 'roster',
    expect: { name: 'Chloe', followers: 1_200_000, vertical: 'fashion' },
    note: 'The roster’s largest TikTok, held by a creator the media list records under a single given name. A model that returns a surname has invented one.',
  },
  {
    id: 'thepantryboy',
    platform: 'tiktok',
    handle: 'thepantryboy',
    kind: 'roster',
    expect: { name: 'Daren Teo', followers: 248_800, vertical: 'food' },
    note: 'A handle that reads as a brand rather than a person, on the platform whose profile pages are hostile to crawlers.',
  },
  // ---- XiaoHongShu: 6 accounts, and the platform most likely to fail ----
  {
    id: 'xhs-luodaxiong',
    platform: 'xiaohongshu',
    handle: '罗大雄',
    kind: 'roster',
    expect: { name: '罗大雄', followers: 392_800, vertical: 'fitness' },
    note: 'Non-Latin handle #1. XHS addresses users by an opaque numeric id, so there is no URL to guess — grounding has to come from search alone.',
  },
  {
    id: 'xhs-wangkaihua',
    platform: 'xiaohongshu',
    handle: '王开花',
    kind: 'roster',
    expect: { name: '王开花', followers: 283_700, vertical: 'food' },
    note: 'Non-Latin handle #2. Also tests whether the answer comes back in the handle’s own script or transliterated.',
  },
  {
    id: 'xhs-coolmumdianna',
    platform: 'xiaohongshu',
    handle: 'coolmumdianna',
    kind: 'roster',
    expect: { name: 'Dianna', followers: 198_200, vertical: 'parenting' },
    note: 'A Latin handle on XHS — the trap case, because it is equally plausible as an Instagram handle and a model may resolve it on the wrong platform.',
  },
  // ---- The three platforms the roster cannot supply. Ceiling tests. ----
  {
    id: 'ceiling-youtube',
    platform: 'youtube',
    handle: 'JamieOliver',
    kind: 'ceiling',
    note: 'No YouTube account exists on the roster. The easiest possible case on the platform: a global food name with millions of subscribers.',
  },
  {
    id: 'ceiling-facebook',
    platform: 'facebook',
    handle: 'JamieOliver',
    kind: 'ceiling',
    note: 'No Facebook account on the roster. Same person, so a model confusing the two platforms shows up as an identical figure.',
  },
  {
    id: 'ceiling-linkedin',
    platform: 'linkedin',
    handle: 'williamhgates',
    kind: 'ceiling',
    note: 'No LinkedIn account on the roster. LinkedIn is the most crawler-hostile of the six; if grounding works anywhere there it works here.',
  },
]

// ---------------------------------------------------------------------------
// The models
// ---------------------------------------------------------------------------
//
// **Two families, two mechanisms.** OpenRouter offers search two ways and they
// are not interchangeable:
//
// - A **`:online` suffix** on an ordinary model runs OpenRouter's own web plugin,
//   which searches, pastes the results into the prompt and lets the model answer
//   normally. Structured output still works, because the model underneath is
//   unchanged. Both `:online` candidates below carry `structured_outputs` and
//   `tools` in their OpenRouter capability list.
// - A **search-native model** — the Perplexity Sonar family — does its own
//   retrieval. Its OpenRouter capability list is
//   `frequency_penalty, max_tokens, presence_penalty, temperature, top_k, top_p,
//   web_search_options` and nothing else: **no `response_format`, no
//   `structured_outputs`, no `tools`.** It cannot be asked for JSON by contract,
//   only by instruction, and Phase F's `generateObject` cannot run against it.
//
// That asymmetry is the finding this list exists to measure. If the search-native
// model is materially better at finding creators, Phase F pays for it with a text
// parser and loses the schema guarantee. If it is not, the `:online` suffix on the
// model this app already runs is the answer and `INFLUENCER_LOOKUP_MODEL` needs no
// second provider.
//
// `anthropic/claude-sonnet-4.6` is the app's own `LLM_MODEL`, so the first
// candidate is literally *"what we already run, plus search"*.

interface SpikeModel {
  id: string
  /** Whether OpenRouter will accept `response_format: json_schema` for this id. */
  structured: boolean
  why: string
}

export const SPIKE_MODELS: readonly SpikeModel[] = [
  {
    id: 'anthropic/claude-sonnet-4.6:online',
    structured: true,
    why: "The app's own LLM_MODEL with the web plugin. If this wins, Phase F adds a config key and no provider.",
  },
  {
    id: 'openai/gpt-5.1:online',
    structured: true,
    why: 'A second family behind the same plugin, so a bad score can be blamed on the mechanism rather than on one model.',
  },
  {
    id: 'perplexity/sonar-pro',
    structured: false,
    why: 'Search-native. Better retrieval in principle, and no structured output at all — the trade this list is here to price.',
  },
]

// ---------------------------------------------------------------------------
// The candidate prompt — Phase F lifts this
// ---------------------------------------------------------------------------
//
// Written for the model even though three of the four rules are enforced in code
// afterwards, which is `applyBoundaries`' precedent stated in `social/ideate.ts`:
// *"the rules below are written for the model because a model that understands
// them produces better ideas, and then `applyBoundaries` drops whatever ignored
// them anyway."* The spike measures how much of the work the prompt does on its
// own, because that is what decides how brutal `applyLookupBoundaries` has to be.
//
// **The canonical profile URL goes in the prompt for five of the six platforms.**
// It is the strongest grounding signal available and costs nothing to supply, and
// naming it is also what makes rule 3 checkable — a model told which page to read
// has no excuse for citing a different one. XiaoHongShu gets no URL because there
// is none to give: it addresses users by an opaque numeric id, which is the same
// fact `InfluencerAccountSchema.url` records.

const PROFILE_URL: Record<Platform, ((handle: string) => string) | null> = {
  instagram: (h) => `https://www.instagram.com/${h}/`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}/`,
  // No guess. XHS user URLs are `/user/profile/<opaque id>` and a handle does not
  // produce one — the reason the column exists.
  xiaohongshu: null,
}

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  xiaohongshu: 'XiaoHongShu (小红书, RED)',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
}

/** The closed enum, quoted to the model verbatim. There is no `other` member. */
const VERTICALS = [
  'beauty',
  'fashion',
  'food',
  'fitness',
  'travel',
  'home',
  'tech',
  'parenting',
  'motoring',
  'family',
] as const

/**
 * The two messages, and **the split is load-bearing rather than stylistic.**
 *
 * Every other model-backed path in this repository puts the whole brief in the
 * system message — `ideatePostThemes` sends `buildSystemPrompt(brand) + the
 * planning brief` as `system` and the literal string *"Plan the window described
 * in the brief"* as the user turn. The first version of this file copied that
 * shape and it **broke grounding completely**: the first live call returned
 * `not-found` for `@novitalam`, an account a plain curl had read 448,000
 * followers off ten minutes earlier.
 *
 * The captured `annotations` said why. OpenRouter's web plugin derives its search
 * query from the **last user message**, and the last user message was *"Look up
 * the creator described in the brief"* — so it searched that sentence and
 * retrieved a marketing blog called *"The Best Platform to Find Influencers"*.
 * The model then behaved correctly on evidence it had never been given: nothing
 * in the retrieved pages named the handle, so rule 1 made the answer
 * `not-found`.
 *
 * **The platform, the handle and the profile URL therefore go in the user
 * message.** The rules stay in the system message, where they belong and where
 * they cost nothing.
 *
 * ## …and then that was not enough either, which is what `variant` is for
 *
 * Moving the brief into the user message rescued `@novitalam` and nothing else.
 * The baseline run returned `not-found` on **six of the first seven roster
 * cases**, and the captures name the cause: the plugin does not extract a query
 * from the user message, it *searches the user message*. Asked
 *
 * > Instagram profile @lennardy — follower count, real name, and what they post
 * > about.  Read https://www.instagram.com/lennardy/. That is the account. If it
 * > does not exist… Return the JSON object described in the system message…
 *
 * it retrieved a Bubble forum thread on reading Instagram without the Graph API,
 * a Quora question, and a StackOverflow post about the Instagram API. Every
 * retrieved page was about *the act of looking up an Instagram follower count*,
 * because that is what the message says. The handle was one token in a paragraph
 * of instructions and it was drowned.
 *
 * `@novitalam` survived only because the handle is a distinctive single token
 * that a general search surfaces anyway.
 *
 * So the user message has **two variants**, and the difference between their
 * scores is this phase's most useful measurement:
 *
 * - `brief` — the request plus its instructions, which is what any careful
 *   author writes first and what every other prompt in this repository looks
 *   like.
 * - `query` — the user message is *only the search query*, five words with no
 *   instruction in it at all. Everything else, including which URL to read and
 *   what to return, moves into the system message where the plugin cannot see it.
 *
 * **The lesson generalises past this feature**: when a web plugin sits between
 * the prompt and the model, the user message stops being a prompt and becomes a
 * query string. Phase F must treat it as one.
 */
export type PromptVariant = 'brief' | 'query'

export function buildLookupPrompt(
  platform: Platform,
  handle: string,
  variant: PromptVariant = 'query',
): { system: string; user: string } {
  const url = PROFILE_URL[platform]?.(handle) ?? null

  const user =
    variant === 'query'
      ? // Nothing but search terms. No verb, no instruction, no URL — a URL in the
        // query is itself a phrase the search engine matches against, and the
        // model is told which URL to read from the system message instead.
        `${PLATFORM_LABEL[platform]} @${handle} followers`
      : [
          `${PLATFORM_LABEL[platform]} profile @${handle} — follower count, real name, and what they post about.`,
          url
            ? `Read ${url}. That is the account. If it does not exist, or the handle on it is not \`${handle}\`, return outcome "not-found".`
            : `Search for the ${PLATFORM_LABEL[platform]} account with the handle \`${handle}\`. There is no URL that can be derived from a handle on this platform, so find whatever page names it.`,
          'Return the JSON object described in the system message and nothing else.',
        ].join('\n\n')

  const lines: string[] = [
    '## Creator lookup',
    '',
    'You look up one public social media creator and report what you can verify about them. You are answering into a media list that a company negotiates rates against, so a blank field is cheap and a wrong figure is not.',
    '',
    // **The request is restated here under `query`**, because there the user
    // message is a search string rather than a brief and carries no instruction.
    // Under `brief` this block is omitted: the user message already says all of
    // it, and repeating it would change two things between the variants when the
    // experiment is about one.
    ...(variant === 'query'
      ? [
          '## This request',
          '',
          `Platform: ${PLATFORM_LABEL[platform]}`,
          `Handle: \`${handle}\``,
          url
            ? `Profile URL: ${url} — that is the account. If it does not exist, or the handle on it is not \`${handle}\`, the outcome is "not-found".`
            : 'Profile URL: none. This platform addresses users by an opaque internal id, so no URL can be derived from the handle. Use whatever page names the handle.',
          '',
          'The search results in this conversation were retrieved for that handle. Read them for the account above and ignore any page about a different person.',
          '',
        ]
      : []),
    'Rules, in order of importance:',
    '',
    // Rule 1 first because its violation is the one that costs money: an invented
    // follower count lands in the column a rate is negotiated against.
    '1. **Never invent a number.** If you cannot find a follower count on a page you actually read, return `null` for it. A missing number is a blank field somebody fills in; a wrong number is a fact this company acts on. There is no credit for completeness here.',
    "2. **Every figure carries the URL you read it from.** Put it in that account's `sourceUrl`. A figure with no source will be discarded before anyone sees it, so returning one is wasted work.",
    '3. **A source must be a page for the handle you were asked about, on the platform you were asked about.** The handle has to appear in the URL or in the page title. A page about a different person with a similar name is worse than no answer.',
    '4. **Report the account you were asked about, on the platform you were asked about.** You may add other accounts the same creator holds if the profile itself links them, but the requested one comes first and is never omitted.',
    `5. **\`vertical\` is one of exactly these, or \`null\`:** ${VERTICALS.join(', ')}. There is no "other" and no "lifestyle" — a creator who fits none of them is \`null\`, which this product reads as a genuine generalist.`,
    '6. **`engagementRate` is almost always `null`.** No platform publishes it. Return a number only if you read one on a page you cite, and never compute one from a sample.',
    "7. **`name` is the person's real name as the profile presents it**, not the handle and not a channel title. If the profile shows only a given name, return only the given name.",
    '8. **`outcome` is `not-found`** when the account does not exist, is private with nothing readable, or you cannot tell whether the page you found is the right person. Guessing is the failure mode this field exists to avoid.',
    '',
    'Return exactly this shape, and nothing outside it — no prose before it, no code fence around it:',
    '',
    '```',
    '{"outcome":"ok"|"not-found","name":string|null,"vertical":string|null,',
    ' "accounts":[{"platform":string,"handle":string,"followers":integer|null,',
    '              "engagementRate":number|null,"url":string|null,"sourceUrl":string|null}],',
    ' "sources":[{"title":string,"url":string}]}',
    '```',
  ]

  return { system: lines.join('\n'), user }
}

/**
 * What the model is asked to return.
 *
 * Hand-written JSON Schema rather than derived from a zod type, because Phase F
 * has not written those types yet — that is Phase F's step 1, and writing them
 * here would mean this throwaway script owned a wire contract. The field names are
 * `CreateInfluencerInput`'s on purpose, so the capture reads as a draft.
 *
 * `sourceUrl` sits **on the account** rather than in a flat source list. A per-
 * account source is what rule 3 needs to be checkable: a single list of URLs
 * cannot say which figure came from which page, and a two-account answer with one
 * citation would score as sourced when half of it is not.
 */
const LOOKUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'name', 'vertical', 'accounts', 'sources'],
  properties: {
    outcome: { type: 'string', enum: ['ok', 'not-found'] },
    name: { type: ['string', 'null'] },
    vertical: { type: ['string', 'null'], enum: [...VERTICALS, null] },
    accounts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['platform', 'handle', 'followers', 'engagementRate', 'url', 'sourceUrl'],
        properties: {
          platform: {
            type: 'string',
            enum: ['instagram', 'tiktok', 'youtube', 'xiaohongshu', 'facebook', 'linkedin'],
          },
          handle: { type: 'string' },
          followers: { type: ['integer', 'null'] },
          engagementRate: { type: ['number', 'null'] },
          url: { type: ['string', 'null'] },
          sourceUrl: { type: ['string', 'null'] },
        },
      },
    },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'url'],
        properties: { title: { type: 'string' }, url: { type: 'string' } },
      },
    },
  },
} as const

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

interface Capture {
  caseId: string
  modelId: string
  /** Which user-message shape produced this answer. See `buildLookupPrompt`. */
  variant: PromptVariant
  platform: Platform
  handle: string
  /** Wall-clock, because eight seconds and forty seconds are different products. */
  elapsedMs: number
  /** OpenRouter's own reported cost for this call, in USD. */
  costUsd: number | null
  /** The parsed draft, or `null` when the answer was not JSON at all. */
  draft: unknown
  /** The raw assistant text, always. This is what Phase F's parser is written against. */
  rawText: string
  /** OpenRouter's `annotations` — what the search layer actually retrieved. */
  annotations: unknown
  error: string | null
}

async function callModel(
  model: SpikeModel,
  spikeCase: SpikeCase,
  variant: PromptVariant,
): Promise<Capture> {
  const started = Date.now()
  const base: Omit<
    Capture,
    'elapsedMs' | 'costUsd' | 'draft' | 'rawText' | 'annotations' | 'error'
  > = {
    caseId: spikeCase.id,
    modelId: model.id,
    variant,
    platform: spikeCase.platform,
    handle: spikeCase.handle,
  }

  const prompt = buildLookupPrompt(spikeCase.platform, spikeCase.handle, variant)
  const body: Record<string, unknown> = {
    model: model.id,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    max_tokens: 1500,
  }

  // The shape is stated in the system message for every candidate, because the
  // search-native family has no `response_format` and asking is the only lever it
  // offers. `response_format` is added on top for the models that accept it, so
  // the two mechanisms can be compared on identical wording.
  if (model.structured) {
    body['response_format'] = {
      type: 'json_schema',
      json_schema: { name: 'creator_lookup', strict: true, schema: LOOKUP_SCHEMA },
    }
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as {
      choices?: { message?: { content?: string; annotations?: unknown } }[]
      usage?: { cost?: number }
      error?: { message?: string }
    }
    const elapsedMs = Date.now() - started

    if (json.error) {
      return {
        ...base,
        elapsedMs,
        costUsd: null,
        draft: null,
        rawText: '',
        annotations: null,
        error: json.error.message ?? 'unknown provider error',
      }
    }

    const message = json.choices?.[0]?.message
    const rawText = message?.content ?? ''
    return {
      ...base,
      elapsedMs,
      costUsd: json.usage?.cost ?? null,
      draft: extractJson(rawText),
      rawText,
      annotations: message?.annotations ?? null,
      error: null,
    }
  } catch (err) {
    return {
      ...base,
      elapsedMs: Date.now() - started,
      costUsd: null,
      draft: null,
      rawText: '',
      annotations: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Pull an object out of whatever the model sent.
 *
 * A structured-output model sends JSON and this is a `JSON.parse`. The
 * search-native one sends prose, or a fenced block, or prose wrapped around a
 * fenced block — so the fallback takes the first `{` to the last `}`. **This is a
 * measurement instrument, not a proposal**: if Phase F ends up needing it, that is
 * itself the finding, because a parser that scrapes a brace out of prose is a
 * parser with no schema behind it.
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

// ---------------------------------------------------------------------------
// The scoring
// ---------------------------------------------------------------------------
//
// Four columns, one per question the phase asks, plus the two that decide whether
// the answer is safe to show: is every figure sourced, and is every source about
// the handle we asked for.

type FollowerVerdict = 'close' | 'band' | 'wrong' | 'null' | 'no-truth'

/**
 * How close is close enough.
 *
 * **The bands are generous on purpose and the reason is in the data.** The roster
 * is a media-list snapshot from late 2025 and this runs in 2026-08; `@novitalam`
 * measured 448,000 against a recorded 412,000, which is a creator growing by 8.7%
 * over ten months rather than a model being wrong. Scoring that as a miss would
 * make every honest answer look like a failure.
 *
 * - `close` — within 20%. Indistinguishable from drift.
 * - `band` — within 60% **and** the same reach tier. Wrong in the second digit,
 *   right about what the creator is, and the tier is what the table groups by.
 * - `wrong` — anything else, which includes any answer that changes the band.
 */
function scoreFollowers(got: number | null, truth: number | undefined): FollowerVerdict {
  if (truth === undefined) return 'no-truth'
  if (got === null || got === undefined) return 'null'
  const ratio = got / truth
  if (ratio >= 0.8 && ratio <= 1.2) return 'close'
  if (ratio >= 0.4 && ratio <= 1.6 && tierOf(got) === tierOf(truth)) return 'band'
  return 'wrong'
}

/** `REACH_TIERS`' boundaries, copied rather than imported — `web-next` is not a dependency of this package. */
function tierOf(n: number): string {
  if (n >= 1_000_000) return 'mega'
  if (n >= 500_000) return 'macro'
  if (n >= 100_000) return 'mid'
  if (n >= 10_000) return 'micro'
  return 'nano'
}

/**
 * Did it find the right person?
 *
 * Compared loosely — case-folded, and a match either way round — because
 * `Chloe` against `Chloe Abeth` is a model adding a surname the media list does
 * not carry, not a model finding the wrong person. A containment match scores
 * that as found and the `name` column in the report prints what was actually
 * returned, so a reader can see the surname and judge it.
 */
function scoreIdentity(got: string | null | undefined, truth: string | undefined): boolean | null {
  if (truth === undefined) return null
  if (!got) return false
  const a = got.trim().toLowerCase()
  const b = truth.trim().toLowerCase()
  return a.includes(b) || b.includes(a)
}

interface Scored {
  capture: Capture
  outcome: string
  /** The account the case asked about, found by (platform, handle) in the draft. */
  requested: {
    followers: number | null
    engagementRate: number | null
    sourceUrl: string | null
  } | null
  identity: boolean | null
  name: string | null
  followers: FollowerVerdict
  vertical: 'match' | 'differs' | 'null' | 'off-enum' | 'no-truth'
  /** Rule 2: every non-null follower count carries a source. */
  everyFigureSourced: boolean
  /**
   * **Rule 3, strictly** — the handle appears in the URL the model *cited* for
   * the figure.
   *
   * This is the one the plan names as enforced in code, and the first capture
   * showed why it has to be measured on its own. `@novitalam` came back with a
   * correct name and a correct-looking 441,000 sourced to `wiki.sg/p/Novita_Lam`
   * — a page about the person that carries no handle at all, so a rule-3 filter
   * would discard the figure even though the answer was right.
   */
  citedSourceNamesHandle: boolean
  /**
   * The same question asked of the **retrieval log** rather than of the claim.
   *
   * Kept apart from the column above because conflating them makes a lenient
   * instrument: the same capture retrieved `storify.me/ig/novitalam`, which does
   * name the handle, while the model cited the wiki page instead. One column
   * scoring both would have read as a pass and hidden the gap between what the
   * search layer found and what the model said it read.
   */
  retrievalNamesHandle: boolean
  /**
   * The model spelled `platform` outside the enum — `"Instagram"` for
   * `"instagram"`.
   *
   * Observed on the very first good capture, and it is the cheapest possible
   * defect to miss: a Phase F parser matching the enum exactly would drop a
   * complete, correct, well-sourced account and report `not-found`.
   */
  platformOffEnum: boolean
  /** Rule 6: an engagement rate is an invention until a platform publishes one. */
  inventedEngagement: boolean
  /** Rule 4/8: accounts returned that were never asked for. Not a fault — reported. */
  extraAccounts: number
}

function score(capture: Capture, spikeCase: SpikeCase): Scored {
  const draft = capture.draft as
    | {
        outcome?: string
        name?: string | null
        vertical?: string | null
        accounts?: {
          platform?: string
          handle?: string
          followers?: number | null
          engagementRate?: number | null
          url?: string | null
          sourceUrl?: string | null
        }[]
        sources?: { title?: string; url?: string }[]
      }
    | null
    | undefined

  const accounts = draft?.accounts ?? []

  // **Matched case-insensitively and with the `@` stripped**, which is a decision
  // about the instrument rather than about the product. Phase F's parser must
  // fold the platform and refuse a leading `@` on the handle — the schema's rule —
  // but a scorer that failed the strict comparison would report `followers: null`
  // for an answer that carried a perfectly good figure under `"Instagram"`. It did
  // on the first capture. `platformOffEnum` below records the spelling instead of
  // losing the row over it.
  const foldedHandle = spikeCase.handle.trim().toLowerCase().replace(/^@/, '')
  const wanted = accounts.find(
    (a) =>
      (a.platform ?? '').trim().toLowerCase() === spikeCase.platform &&
      (a.handle ?? '').trim().toLowerCase().replace(/^@/, '') === foldedHandle,
  )

  const requested = wanted
    ? {
        followers: wanted.followers ?? null,
        engagementRate: wanted.engagementRate ?? null,
        sourceUrl: wanted.sourceUrl ?? null,
      }
    : null

  // Two haystacks, never one. `sourceUrl` plus the declared `sources` is what the
  // model **claims** it read; `annotations` is what OpenRouter's search layer
  // **actually** retrieved. A model can write a plausible URL it never opened, and
  // it can read the right page and cite the wrong one — those are different
  // defects and one column cannot hold both.
  const needle = foldedHandle
  const claimed = [
    requested?.sourceUrl ?? '',
    ...(draft?.sources ?? []).flatMap((s) => [s.url ?? '', s.title ?? '']),
  ]
    .join(' ')
    .toLowerCase()
  const retrieved = JSON.stringify(capture.annotations ?? '').toLowerCase()

  const vertical = (() => {
    if (spikeCase.expect === undefined) return 'no-truth' as const
    const got = draft?.vertical ?? null
    if (got === null) return 'null' as const
    if (!(VERTICALS as readonly string[]).includes(got)) return 'off-enum' as const
    return got === spikeCase.expect.vertical ? ('match' as const) : ('differs' as const)
  })()

  return {
    capture,
    outcome: draft?.outcome ?? (capture.error ? 'error' : 'no-json'),
    requested,
    identity: scoreIdentity(draft?.name ?? null, spikeCase.expect?.name),
    name: draft?.name ?? null,
    followers: scoreFollowers(requested?.followers ?? null, spikeCase.expect?.followers),
    vertical,
    everyFigureSourced: accounts.every(
      (a) => a.followers === null || a.followers === undefined || Boolean(a.sourceUrl),
    ),
    citedSourceNamesHandle: needle.length > 0 && claimed.includes(needle),
    retrievalNamesHandle: needle.length > 0 && retrieved.includes(needle),
    platformOffEnum: accounts.some(
      (a) =>
        typeof a.platform === 'string' &&
        !(
          ['instagram', 'tiktok', 'youtube', 'xiaohongshu', 'facebook', 'linkedin'] as string[]
        ).includes(a.platform),
    ),
    inventedEngagement: accounts.some((a) => typeof a.engagementRate === 'number'),
    extraAccounts: Math.max(0, accounts.length - (wanted ? 1 : 0)),
  }
}

// ---------------------------------------------------------------------------
// Phase F's actual path, exercised once
// ---------------------------------------------------------------------------
//
// Everything above talks to OpenRouter over HTTP so the captures keep their
// envelopes. This one call goes the ordinary way — `createLLMProvider` →
// `getModel` → `generateObject` — against the first structured candidate, so the
// run reports whether the shape Phase F is specified in actually runs against a
// search-grounded model, rather than assuming it from a capability list.

async function verifyPortPath(modelId: string, variant: PromptVariant): Promise<string> {
  const provider = createLLMProvider({ openrouter: { apiKey: resolvedKey } })
  const prompt = buildLookupPrompt('instagram', 'novitalam', variant)
  try {
    const { object } = await generateObject({
      model: provider.getModel({ providerId: 'openrouter', modelId }),
      schema: jsonSchema<unknown>(LOOKUP_SCHEMA as unknown as Record<string, unknown>),
      system: prompt.system,
      prompt: prompt.user,
    })
    const draft = object as { name?: string; accounts?: { followers?: number | null }[] } | null
    const followers = draft?.accounts?.[0]?.followers ?? null
    return `ok — generateObject returned an object; name=${draft?.name ?? '(none)'}, followers=${followers ?? '(null)'}`
  } catch (err) {
    return `FAILED — ${err instanceof Error ? err.message : String(err)}`
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function tick(value: boolean | null): string {
  if (value === null) return ' – '
  return value ? ' ✓ ' : ' ✗ '
}

function pad(s: string, width: number): string {
  // Pads by display width, counting CJK as two columns, so the XHS rows line up.
  const w = [...s].reduce((n, ch) => n + (/[⺀-꓏豈-﫿＀-｠]/.test(ch) ? 2 : 1), 0)
  return s + ' '.repeat(Math.max(0, width - w))
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const modelArg = argv[argv.indexOf('--model') + 1]
  const caseArg = argv[argv.indexOf('--case') + 1]

  const variantArg = argv[argv.indexOf('--variant') + 1]
  const variant: PromptVariant = variantArg === 'brief' ? 'brief' : 'query'

  const models = argv.includes('--model')
    ? SPIKE_MODELS.filter((m) => m.id === modelArg)
    : SPIKE_MODELS
  const cases = argv.includes('--case') ? SPIKE_CASES.filter((c) => c.id === caseArg) : SPIKE_CASES

  if (models.length === 0 || cases.length === 0) {
    console.error('lookup-spike: --model or --case matched nothing.')
    process.exit(1)
  }

  if (dryRun) {
    for (const c of cases) {
      const p = buildLookupPrompt(c.platform, c.handle, variant)
      console.log(`\n=== ${c.id} (${c.platform}/${c.handle}) [${variant}] ===\n`)
      console.log('--- system ---')
      console.log(p.system)
      console.log('\n--- user ---')
      console.log(p.user)
    }
    return
  }

  mkdirSync(FIXTURE_DIR, { recursive: true })
  console.log(
    `lookup-spike: variant=${variant}  ${models.length} models × ${cases.length} cases = ${models.length * cases.length} calls\n`,
  )

  const scored: Scored[] = []

  for (const model of models) {
    console.log(`\n── ${model.id} [${variant}] ──`)
    for (const spikeCase of cases) {
      const capture = await callModel(model, spikeCase, variant)
      const result = score(capture, spikeCase)
      scored.push(result)

      // **The variant is in the filename.** Both runs are evidence and neither
      // supersedes the other: the `brief` captures are what the failure looked
      // like, and a Phase F author who only ever sees the `query` ones has no way
      // to know the shape was chosen rather than assumed.
      const stem = `${spikeCase.id}__${model.id.replace(/[/:.]/g, '-')}__${variant}.json`
      writeFileSync(
        join(FIXTURE_DIR, stem),
        `${JSON.stringify({ case: spikeCase, model: model.id, variant, capture }, null, 2)}\n`,
        'utf8',
      )

      const f = result.requested?.followers
      console.log(
        `  ${pad(spikeCase.id, 20)} ${pad(result.outcome, 10)} ` +
          `name=${pad(result.name ?? '—', 22)} ` +
          `followers=${pad(f === null || f === undefined ? '—' : f.toLocaleString('en-US'), 12)} ` +
          `${pad(result.followers, 8)} ${(capture.elapsedMs / 1000).toFixed(1)}s ` +
          `$${(capture.costUsd ?? 0).toFixed(4)}` +
          (capture.error ? `  ERROR ${capture.error}` : ''),
      )
    }
  }

  // ---- the report ----
  console.log('\n\n=== Scores ===\n')
  console.log(
    `${pad('model', 36)}${pad('case', 20)}${pad('ident', 7)}${pad('followers', 11)}${pad('vertical', 10)}${pad('sourced', 9)}${pad('cite→h', 8)}${pad('retr→h', 8)}${pad('enum', 6)}${pad('no-eng', 8)}extra`,
  )
  for (const s of scored) {
    console.log(
      pad(s.capture.modelId, 36) +
        pad(s.capture.caseId, 20) +
        pad(tick(s.identity), 7) +
        pad(s.followers, 11) +
        pad(s.vertical, 10) +
        pad(tick(s.everyFigureSourced), 9) +
        pad(tick(s.citedSourceNamesHandle), 8) +
        pad(tick(s.retrievalNamesHandle), 8) +
        pad(tick(!s.platformOffEnum), 6) +
        pad(tick(!s.inventedEngagement), 8) +
        String(s.extraAccounts),
    )
  }

  console.log('\n=== Per model ===\n')
  for (const model of models) {
    const mine = scored.filter((s) => s.capture.modelId === model.id)
    const roster = mine.filter(
      (s) => SPIKE_CASES.find((c) => c.id === s.capture.caseId)?.kind === 'roster',
    )
    const count = (p: (s: Scored) => boolean, of: Scored[]): string =>
      `${of.filter(p).length}/${of.length}`
    const cost = mine.reduce((n, s) => n + (s.capture.costUsd ?? 0), 0)
    const median =
      [...mine].map((s) => s.capture.elapsedMs).sort((a, b) => a - b)[
        Math.floor(mine.length / 2)
      ] ?? 0

    console.log(model.id)
    console.log(`  answered ok         ${count((s) => s.outcome === 'ok', mine)}`)
    console.log(`  parsed as JSON      ${count((s) => s.capture.draft !== null, mine)}`)
    console.log(
      `  right person        ${count((s) => s.identity === true, roster)}  (roster cases only)`,
    )
    console.log(`  followers close     ${count((s) => s.followers === 'close', roster)}`)
    console.log(
      `  followers in band   ${count((s) => s.followers === 'close' || s.followers === 'band', roster)}`,
    )
    console.log(`  followers wrong     ${count((s) => s.followers === 'wrong', roster)}`)
    console.log(`  followers null      ${count((s) => s.followers === 'null', roster)}`)
    console.log(`  vertical match      ${count((s) => s.vertical === 'match', roster)}`)
    console.log(`  vertical off-enum   ${count((s) => s.vertical === 'off-enum', mine)}`)
    console.log(`  every figure sourced ${count((s) => s.everyFigureSourced, mine)}`)
    console.log(
      `  cited src names hnd  ${count((s) => s.citedSourceNamesHandle, mine)}   <- rule 3, as Phase F would enforce it`,
    )
    console.log(`  retrieval saw handle ${count((s) => s.retrievalNamesHandle, mine)}`)
    console.log(`  platform off-enum    ${count((s) => s.platformOffEnum, mine)}`)
    console.log(`  invented engagement  ${count((s) => s.inventedEngagement, mine)}`)
    console.log(`  median latency      ${(median / 1000).toFixed(1)}s`)
    console.log(`  cost                $${cost.toFixed(4)}\n`)
  }

  const total = scored.reduce((n, s) => n + (s.capture.costUsd ?? 0), 0)
  console.log(
    `total cost  $${total.toFixed(4)} over ${scored.length} calls  ($${(total / scored.length).toFixed(4)}/call)`,
  )

  const structured = models.find((m) => m.structured)
  if (structured) {
    console.log('\n=== Phase F path (generateObject through the LLM port) ===\n')
    console.log(`  ${structured.id}: ${await verifyPortPath(structured.id, variant)}`)
  }

  console.log(`\ncaptures written to ${FIXTURE_DIR}`)
}

main().catch((err: unknown) => {
  console.error('lookup-spike: fatal', err)
  process.exit(1)
})
