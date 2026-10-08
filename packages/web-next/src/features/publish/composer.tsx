'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Confetti } from '@/components/confetti'
import { Fold, Segmented, Switch } from '@/components/controls'
import { CheckIcon, ChevronIcon, CloseIcon, PlusIcon, SparkIcon } from '@/components/icons'
import { fromFile, Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import type { BrandId } from '@/data/brands'
import type { Format, Post, Stage } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'
import { dayLabel } from '@/features/ideate/calendar-slot'
import { composeChannels, sentChannels } from '@/features/schedule/calendar-items'
import { dayOf, storyTaken } from '@/features/schedule/move-post'
import { useBrand } from '@/features/schedule/posts-store'

import {
  activeChannels,
  blockers,
  CHANNELS,
  kindOn,
  lengthFor,
  PRIVACY,
  textFor,
  tiktokConsent,
  youtubeTitle,
  type ChannelKey,
  type Outcome,
} from './model'
import { PhoneMock } from './phone-mocks'
import { usePublishDraft, type PublishDraftApi } from './use-publish-draft'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
const CARD =
  'flex flex-col gap-4 rounded-[18px] bg-page p-6 shadow-[0_0_0_1px_var(--line)] max-md:p-4'

const NAME: Record<ChannelKey, string> = {
  ig: 'Instagram',
  tt: 'TikTok',
  yt: 'YouTube',
  li: 'LinkedIn',
  fb: 'Facebook',
}

/** Captions "Draft with AI" cycles through. The demo has no model behind it. */
const ALTERNATIVES = [
  'Ten seconds of fire, a crust that cracks 🔥 Blowtorch finish at Raffles City. #casavostra #pizzasg #rafflescity',
  'Smoke, blister, crack. The last ten seconds before your pizza lands 🔥 Raffles City. #casavostra #pizzasg',
]

/** Where each brand's location tag defaults to: the venue, as the team tags it today. */
const VENUE: Record<BrandId, string> = {
  'casa-vostra': 'Casa Vostra, Raffles City',
  temper: 'Temper, Duxton Road',
  carlitos: 'Carlitos, Joo Chiat',
}

const APPROVERS = ['Chef Marco', 'Chun (CEO)', 'Dione']
/** The parts of the day Insights scores, as the time each one posts at. */
const DAYPART_TIME = ['09:00', '12:00', '15:00', '18:00', '21:00']
const MEDIA_MAX: Record<Format, number> = { reel: 1, carousel: 10, story: 10 }
const MEDIA_RULE: Record<Format, string> = {
  reel: 'One video, vertical, up to 90 seconds',
  carousel: 'Up to 10 photos or videos',
  story: 'Up to 10 frames, each shown for a few seconds',
}

type WhenChoice = 'now' | 'schedule' | 'draft'

/** Which accounts a detail is sent to. A detail with none of them selected stays hidden. */
const DETAIL_ON: Record<'comment' | 'location' | 'collab', ChannelKey[]> = {
  comment: ['ig', 'fb'],
  location: ['ig', 'fb'],
  collab: ['ig'],
}

/**
 * The composer: one post for every platform. In Brandwatch a post belongs to one network and is
 * copied by hand to the next; here the brand's accounts are ticked together, the shared fields are
 * written once, and only what one platform truly needs is asked inside that account's row. The
 * publish rules live in `model.ts`; this page reads them. UI only: the send is simulated.
 */
export function Composer({
  post,
  start,
}: {
  post?: Post
  /** A new post started from an empty day or hour on the calendar. */
  start?: { day?: string; time?: string; format?: Format }
}) {
  const router = useRouter()
  const {
    brand,
    weeks,
    captions,
    library,
    ideas,
    byId,
    planPost,
    reschedule,
    setStage,
    setChannels,
  } = useBrand()
  const api = usePublishDraft({
    format: post?.format ?? start?.format ?? 'reel',
    hook: post?.hook ?? '',
    caption: post ? (captions[post.id] ?? post.hook) : '',
    selected: post ? composeChannels(post) : undefined,
    // A post that got as far as scheduled answered TikTok's question then.
    privacy:
      post && (post.stage === 'scheduled' || post.stage === 'failed') ? 'Everyone' : undefined,
  })
  const [reconnected, setReconnected] = React.useState(false)
  // The post as it opened: after a retry the live post is no longer failed, and a second send
  // (after "Edit post") must still keep the accounts it had reached.
  const [opened] = React.useState(post)
  const failedKey = post?.failedOn ?? 'ig'
  const failedName = NAME[failedKey]
  const { draft, update, phase } = api

  const [media, setMedia] = React.useState<string[]>(post?.images ?? [])
  // A failed post was due already: the fix is to send it now.
  const [when, setWhen] = React.useState<WhenChoice>(post?.stage === 'failed' ? 'now' : 'schedule')
  const [dayN, setDayN] = React.useState<string>(
    () => (post && dayOf(weeks, post.id)) || start?.day || '13',
  )
  const [time, setTime] = React.useState(
    () => post?.slot.split(', ')[1] ?? start?.time ?? INSIGHTS_BY_BRAND[brand.id].best,
  )
  // A new post, once placed: a second send after "Edit post" moves it instead of placing another.
  const [madeId, setMadeId] = React.useState<string | null>(null)
  // The idea a new post started from, so the calendar swaps that idea's tile for the post.
  const [ideaHook, setIdeaHook] = React.useState<string | null>(null)
  // A post already out, or one from an earlier month, is shown, not changed.
  const readOnly = Boolean(post && (post.stage === 'posted' || !dayOf(weeks, post.id)))
  const [details, setDetails] = React.useState({
    comment: '',
    location: VENUE[brand.id],
    collab: [] as string[],
    aiLabel: false,
  })
  const [labels, setLabels] = React.useState<string[]>([])
  const [approval, setApproval] = React.useState<{ on: boolean; who: string[] }>({
    on: false,
    who: ['Chef Marco'],
  })
  const [extra, setExtra] = React.useState({
    ytVisibility: 'Public',
    fbAudience: 'Everyone',
    liVisibility: 'Anyone',
    igShareToFeed: true,
  })
  const [notesOpen, setNotesOpen] = React.useState(false)
  // On a phone, notes open above the form: it scrolls there once, as they open.
  const toNotes = React.useCallback((el: HTMLDivElement | null) => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  // On a phone the details, the per-account settings and the approval fold under one row.
  const [more, setMore] = React.useState(false)
  const [notes, setNotes] = React.useState<Array<{ kind: 'internal' | 'external'; text: string }>>(
    [],
  )
  const [saved, setSaved] = React.useState<string | null>(null)

  const active = activeChannels(draft)
  const targetId = post?.id ?? madeId
  const storyDay = when === 'now' ? '6' : dayN
  const blocked = [
    ...(readOnly ? ['Already posted: it can be viewed, not changed.'] : []),
    ...(post?.stage === 'failed' && !reconnected ? [`Reconnect ${failedName} first.`] : []),
    ...(media.length === 0 && draft.format !== 'story' ? ['Add a photo or video.'] : []),
    ...(media.length > MEDIA_MAX[draft.format]
      ? [`A ${draft.format} takes ${MEDIA_MAX[draft.format]}: remove the extra media.`]
      : []),
    ...(draft.format === 'story' && storyTaken(weeks, storyDay, targetId ?? undefined)
      ? ['A story is already on that day: pick another.']
      : []),
    ...blockers(draft),
    ...(when === 'schedule' && !dayN ? ['Pick a day.'] : []),
  ]
  // Nothing can go out: a read-only post, or a blocker (a draft may be saved unfinished).
  const stuck = readOnly || (blocked.length > 0 && when !== 'draft')
  // A retry names its accounts by their logos, so the button shows exactly where it goes again.
  // Before the reconnect, the account that failed is not ticked yet: the button names it anyway.
  const retryOn = active.length > 0 ? active.map((c) => c.key) : reconnected ? [] : [failedKey]
  const retry = retryOn.length > 0 && when === 'now' && !approval.on && post?.stage === 'failed'
  const label = retry
    ? 'Retry on'
    : active.length === 0
      ? 'Pick an account'
      : when === 'draft'
        ? 'Save draft'
        : approval.on
          ? 'Send for approval'
          : when === 'now'
            ? 'Post on'
            : 'Schedule on'
  // A send names its accounts by their logos, so the button shows exactly where the post goes.
  const logos = retry ? retryOn : approval.on || when === 'draft' ? [] : active.map((c) => c.key)

  /** The post on the calendar: moved and restaged if it exists, placed if it is new. */
  function toCalendar(stage: Stage): string | null {
    const day = when === 'now' ? '6' : dayN
    const channels = sentChannels(
      opened,
      active.map((c) => c.key),
    )
    if (targetId) {
      reschedule(targetId, day, time)
      setStage(targetId, stage)
      setChannels(targetId, channels)
      return targetId
    }
    const hook = ideaHook ?? (draft.caption.split(/[.!?\n]/)[0]?.trim() || 'New post')
    const id = planPost({ format: draft.format, hook, image: media[0], channels }, day, time, stage)
    setMadeId(id)
    return id
  }

  function primary() {
    if (stuck) return
    if (when === 'draft' || approval.on) {
      toCalendar(approval.on && when !== 'draft' ? 'awaiting' : 'draft')
      setSaved(
        approval.on
          ? `Sent to ${approval.who.join(' and ')} for approval`
          : 'Saved as a draft on the calendar',
      )
      return
    }
    update({ when: when === 'now' ? 'now' : 'slot' })
    toCalendar(when === 'now' ? 'posted' : 'scheduled')
    api.send(when === 'now' ? 'now' : 'slot')
  }

  if (saved) return <Saved message={saved} onEdit={() => setSaved(null)} />
  if (phase !== 'compose') {
    return (
      <Outcomes
        api={api}
        media={media}
        slot={`${dayLabel(weeks, dayN) ?? ''}, ${time}`}
        onBack={() => router.push('/')}
      />
    )
  }

  const status = post ? STAGE_LABEL[post.stage] : 'New'
  // TikTok's choices live in the fold: while the send waits on one, the fold stays open.
  const unfolded = more || blocked.some((b) => b.includes('TikTok'))

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className={`${EYEBROW} flex items-center gap-2`}>
            {brand.name} ·
            <span className="rounded-full bg-surface px-2 py-[2px] tracking-normal normal-case text-ink-2">
              {status}
            </span>
          </span>
          <h1 className="font-display text-[38px] leading-none tracking-[-0.035em] max-md:text-[28px] max-md:leading-[1.05]">
            {post ? post.hook : 'New post'}
          </h1>
        </div>
        {/* On a phone the send bar sits at the bottom, under the thumb, and stays there. */}
        <div className="flex flex-col items-end gap-1.5 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:flex-col-reverse max-md:items-stretch max-md:gap-1 max-md:border-t max-md:border-line max-md:bg-page/95 max-md:px-4 max-md:pt-2.5 max-md:pb-[calc(10px+env(safe-area-inset-bottom))] max-md:backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={notesOpen}
              onClick={() => setNotesOpen((o) => !o)}
              className={`flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors max-md:h-12 ${notesOpen ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:bg-paper hover:text-ink'}`}
            >
              Notes
              {notes.length > 0 && (
                <span className="font-mono text-[11px] opacity-60">{notes.length}</span>
              )}
            </button>
            <button
              type="button"
              aria-disabled={stuck}
              aria-label={logos.length > 0 ? `${label} ${namesOf(logos)}` : undefined}
              onClick={primary}
              className={`flex h-10 min-w-[160px] items-center justify-center gap-2 rounded-full px-5 max-md:h-12 max-md:flex-1 text-[13.5px] font-medium transition-[background-color,box-shadow] ${stuck ? 'cursor-not-allowed bg-surface text-ink-4' : 'bb-press bg-ink text-page hover:shadow-lift'}`}
            >
              {label}
              {logos.length > 0 && (
                <span className="flex items-center gap-1.5">
                  {logos.map((k) => (
                    <PlatformLogo key={k} platform={k} size={13} />
                  ))}
                </span>
              )}
            </button>
          </div>
          <span
            aria-live="polite"
            className="min-h-[18px] text-[12px] text-ink-3 max-md:min-h-0 max-md:text-center"
          >
            {(stuck || when !== 'draft') && blocked[0] && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-ink" />
                {blocked[0]}
                {blocked.length > 1 && <span className="text-ink-4">+{blocked.length - 1}</span>}
              </span>
            )}
          </span>
        </div>
      </header>

      {post?.stage === 'failed' && (
        <div
          role="alert"
          className={`flex items-center gap-3 rounded-[14px] px-4 py-3 transition-colors max-md:flex-wrap ${reconnected ? 'bg-(--insight-1) shadow-[inset_0_0_0_1px_var(--insight-2)]' : 'bg-(--fail-soft) shadow-[inset_0_0_0_1px_var(--fail-line)]'}`}
        >
          {reconnected ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--insight-5) text-page">
              <CheckIcon size={8} strokeWidth={2.4} />
            </span>
          ) : (
            <span className="ml-1.5 size-2 shrink-0 rounded-full bg-fail shadow-[0_0_0_3px_color-mix(in_oklab,var(--fail)_18%,transparent)]" />
          )}
          <span className="flex flex-1 flex-col text-[13px] leading-[1.35] max-md:basis-[calc(100%-36px)]">
            <span className={`font-medium ${reconnected ? 'text-ink' : 'text-fail-ink'}`}>
              {reconnected
                ? `${failedName} is connected again.`
                : `This post did not go out at ${post.slot}.`}
            </span>
            <span className="text-ink-3">
              {reconnected ? 'Press Retry to post it now.' : post.error}
            </span>
          </span>
          {!reconnected && (
            <button
              type="button"
              onClick={() => {
                setReconnected(true)
                // The account that failed is connected again, and the post goes to it.
                if (!draft.connected.includes(failedKey)) api.connect(failedKey)
              }}
              className="bb-press h-9 shrink-0 rounded-full bg-page px-4 text-[13px] font-medium text-ink shadow-[0_0_0_1px_var(--line)] hover:shadow-[0_0_0_1px_var(--line-strong)] max-md:w-full"
            >
              Reconnect {failedName}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6 max-lg:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-4">
          {/* In one column the side column comes last: notes open at the top instead. */}
          {notesOpen && (
            <div className="scroll-mt-4 lg:hidden" ref={toNotes}>
              <Notes notes={notes} setNotes={setNotes} />
            </div>
          )}
          <Accounts api={api} />
          <Content
            api={api}
            media={media}
            setMedia={setMedia}
            library={library}
            ideas={post ? [] : ideas.filter((i) => !i.postId || !byId(i.postId))}
            onIdea={setIdeaHook}
          />
          <button
            type="button"
            aria-expanded={unfolded}
            onClick={() => setMore((m) => !m)}
            className="flex h-14 items-center justify-between rounded-[18px] bg-page px-4 text-left shadow-[0_0_0_1px_var(--line)] md:hidden"
          >
            <span className="flex flex-col">
              <span className="text-[14px] font-medium">More options</span>
              <span className="text-[12px] text-ink-4">Details, each account, approval</span>
            </span>
            <span className={`text-ink-4 transition-transform ${unfolded ? 'rotate-180' : ''}`}>
              <ChevronIcon size={11} />
            </span>
          </button>
          <div className={`flex min-w-0 flex-col gap-4 ${unfolded ? '' : 'max-md:hidden'}`}>
            <Details
              api={api}
              details={details}
              setDetails={setDetails}
              labels={labels}
              setLabels={setLabels}
            />
            {active.length > 0 && <PerAccount api={api} extra={extra} setExtra={setExtra} />}
          </div>
          <WhenCard
            when={when}
            setWhen={setWhen}
            dayN={dayN}
            setDayN={setDayN}
            time={time}
            setTime={setTime}
            story={draft.format === 'story' && active.some((c) => c.key === 'ig')}
          />
          <div className={unfolded ? '' : 'max-md:hidden'}>
            <ApprovalCard approval={approval} setApproval={setApproval} />
          </div>
        </div>
        <div className="sticky top-6 flex flex-col gap-4 max-lg:static">
          {notesOpen && (
            <div className="max-lg:hidden">
              <Notes notes={notes} setNotes={setNotes} />
            </div>
          )}
          <Preview api={api} media={media} />
        </div>
      </div>
    </div>
  )
}

const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft',
  awaiting: 'Awaiting approval',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Failed',
}

// ── Accounts and format ──────────────────────────────────────────────────────────────────────

/** The brand's accounts on every platform, ticked together, and the format they all take. */
function Accounts({ api }: { api: PublishDraftApi }) {
  const { brand } = useBrand()
  const { draft, update, toggleChannel, connect } = api
  return (
    <section aria-label="Accounts" className={CARD}>
      <div className="flex items-center justify-between gap-4">
        <span className={EYEBROW}>Post to</span>
        <span className="text-[12px] text-ink-4">{brand.name}&rsquo;s accounts</span>
      </div>
      <div className="flex flex-wrap gap-2 max-md:grid max-md:grid-cols-2">
        {CHANNELS.map((c) => {
          const connected = draft.connected.includes(c.key)
          const takes = kindOn(draft.format, c.key)
          const on = connected && takes !== null && draft.selected.includes(c.key)
          if (!connected) {
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => connect(c.key)}
                className="flex h-11 items-center gap-2.5 rounded-full px-4 text-[13px] text-ink-3 shadow-[inset_0_0_0_1px_var(--cal-ghost)] transition-colors hover:text-ink max-md:col-span-2"
              >
                <PlatformLogo platform={c.key} size={14} />
                {c.name}
                <span className="text-[11.5px] font-medium text-fail-ink">Reconnect</span>
              </button>
            )
          }
          return (
            <button
              key={c.key}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={takes === null}
              title={takes === null ? `${c.name} has no ${draft.format}s` : undefined}
              onClick={() => takes !== null && toggleChannel(c.key)}
              className={`flex h-11 items-center gap-2.5 rounded-full pr-4 pl-3 text-[13px] transition-colors ${takes === null ? 'cursor-not-allowed text-ink-5' : on ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:bg-paper hover:text-ink'}`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full ${on ? 'bg-page text-ink' : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]'}`}
              >
                {on && <CheckIcon size={8} strokeWidth={2.4} />}
              </span>
              <PlatformLogo platform={c.key} size={14} />
              <span className="flex flex-col items-start leading-tight">
                <span className="font-medium">{c.name}</span>
                <span
                  className={`text-[10.5px] ${takes === null ? '' : 'max-md:hidden'} ${on ? 'text-page/60' : 'text-ink-4'}`}
                >
                  {takes === null
                    ? `No ${draft.format}s`
                    : `${takes} · ${handleOn(brand.handle, brand.name, c.key)}`}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-(--cal-line) pt-4">
        <span className={EYEBROW}>Format</span>
        <div className="w-[300px] max-md:w-full">
          <Segmented<Format>
            label="Format"
            pill
            value={draft.format}
            onChange={(format) => update({ format })}
            options={[
              { value: 'carousel', label: 'Post' },
              { value: 'reel', label: 'Reel' },
              { value: 'story', label: 'Story' },
            ]}
          />
        </div>
      </div>
    </section>
  )
}

function handleOn(handle: string, name: string, channel: ChannelKey): string {
  return channel === 'fb' || channel === 'li' ? name : handle
}

// ── Content ──────────────────────────────────────────────────────────────────────────────────

/**
 * Media and caption, once for every account. A tab per ticked account overrides its text; each
 * account's length shows against its own platform's limit.
 */
function Content({
  api,
  media,
  setMedia,
  library,
  ideas,
  onIdea,
}: {
  api: PublishDraftApi
  media: string[]
  setMedia: (m: string[]) => void
  library: string[]
  ideas: Array<{ hook: string; format: Exclude<Format, 'story'> }>
  onIdea: (hook: string) => void
}) {
  const { draft, update } = api
  const active = activeChannels(draft)
  const [tab, setTab] = React.useState<'all' | ChannelKey>('all')
  const [writing, setWriting] = React.useState(false)
  const [drafted, setDrafted] = React.useState(0)
  const [libraryOpen, setLibraryOpen] = React.useState(false)
  const writer = React.useRef<number | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const max = MEDIA_MAX[draft.format]
  const shownTab = tab !== 'all' && active.some((c) => c.key === tab) ? tab : 'all'

  React.useEffect(
    () => () => {
      if (writer.current !== null) window.clearTimeout(writer.current)
    },
    [],
  )

  /** The demo has no model: a prepared caption types itself in, by grapheme. */
  function draftWithAI() {
    if (writing) return
    const target = ALTERNATIVES[drafted % ALTERNATIVES.length]!
    setDrafted((n) => n + 1)
    setTab('all')
    const parts = [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(target),
    ].map((g) => g.segment)
    let i = 0
    setWriting(true)
    const step = () => {
      i += 1
      update({ caption: parts.slice(0, i).join('') })
      if (i < parts.length) writer.current = window.setTimeout(step, 10 + Math.random() * 18)
      else {
        writer.current = null
        setWriting(false)
      }
    }
    writer.current = window.setTimeout(step, 320)
  }

  async function add(files: FileList | null) {
    const picked = [...(files ?? [])].filter((f) => /^(image|video)\//.test(f.type))
    const dropped = await Promise.all(picked.map(fromFile))
    setMedia([...media, ...dropped.map((d) => d.src)].slice(-max))
  }

  const value =
    shownTab === 'all'
      ? draft.caption
      : shownTab === 'yt'
        ? (draft.youtubeTitle ?? youtubeTitle(draft))
        : textFor(draft, shownTab).text

  function edit(text: string) {
    if (shownTab === 'all') update({ caption: text })
    else if (shownTab === 'yt') update({ youtubeTitle: text })
    else update({ overrides: { ...draft.overrides, [shownTab]: text } })
  }

  const own = (k: ChannelKey) =>
    k === 'yt' ? draft.youtubeTitle !== null : draft.overrides[k] !== undefined

  return (
    <section aria-label="Content" className={CARD}>
      {ideas.length > 0 && media.length === 0 && draft.caption === '' && (
        <div className="flex flex-col gap-2">
          <span className={EYEBROW}>Start from an idea</span>
          <div className="flex flex-wrap gap-1.5">
            {ideas.slice(0, 4).map((idea) => (
              <button
                key={idea.hook}
                type="button"
                onClick={() => {
                  update({ caption: idea.hook, format: idea.format })
                  onIdea(idea.hook)
                  setMedia(library.slice(0, 1))
                }}
                className="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] text-ink-2 transition-colors hover:bg-paper hover:text-ink"
              >
                <SparkIcon size={9} />
                {idea.hook}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className={EYEBROW}>Media</span>
          <span className="text-[11.5px] text-ink-4">{MEDIA_RULE[draft.format]}</span>
        </div>
        <div
          className="flex flex-wrap gap-2"
          onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void add(e.dataTransfer.files)
          }}
        >
          {media.map((src, i) => (
            <span
              key={src + i}
              className="group/m relative block h-[132px] w-[106px] overflow-hidden rounded-[12px] bg-tile"
            >
              <Media src={src} sizes="260px" />
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-1.5 font-mono text-[10px] text-page">
                {i + 1}
              </span>
              <span className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover/m:opacity-100 [@media(hover:none)]:opacity-100">
                {i > 0 && (
                  <button
                    type="button"
                    aria-label="Move earlier"
                    onClick={() => {
                      const next = [...media]
                      ;[next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
                      setMedia(next)
                    }}
                    className="flex size-6 items-center justify-center rounded-full bg-page text-[11px] text-ink-2 shadow-soft"
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => setMedia(media.filter((_, j) => j !== i))}
                  className="flex size-6 items-center justify-center rounded-full bg-page text-ink-2 shadow-soft"
                >
                  <CloseIcon />
                </button>
              </span>
            </span>
          ))}
          {media.length < max && (
            <span className="flex h-[132px] w-[106px] flex-col overflow-hidden rounded-[12px] border border-dashed border-(--cal-ghost) text-[11.5px] text-ink-3">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <PlusIcon size={12} />
                Upload
              </button>
              <button
                type="button"
                aria-expanded={libraryOpen}
                onClick={() => setLibraryOpen((o) => !o)}
                className="border-t border-dashed border-(--cal-ghost) py-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Library
              </button>
            </span>
          )}
          <input
            ref={input}
            type="file"
            hidden
            multiple={max > 1}
            accept={draft.format === 'reel' ? 'video/*,image/*' : 'image/*,video/*'}
            onChange={(e) => {
              void add(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        <Fold open={libraryOpen}>
          <div className="flex gap-2 pt-1">
            {library.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => {
                  setMedia([...media, src].slice(-max))
                  setLibraryOpen(false)
                }}
                className="relative block h-[72px] w-[58px] overflow-hidden rounded-[8px] bg-tile transition-transform hover:-translate-y-0.5"
              >
                <Image src={src} alt="" fill sizes="140px" className="object-cover" />
              </button>
            ))}
          </div>
        </Fold>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Caption for"
            className="flex flex-wrap items-center gap-1"
          >
            {[{ key: 'all' as const, name: 'All accounts' }, ...active].map((c) => {
              const on = c.key === shownTab
              return (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(c.key)}
                  className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors ${on ? 'bg-ink text-page' : 'text-ink-3 hover:bg-surface hover:text-ink'}`}
                >
                  {c.key !== 'all' && <PlatformLogo platform={c.key} size={11} />}
                  {c.key === 'all' ? c.name : c.key === 'yt' ? 'YouTube title' : c.name}
                  {c.key !== 'all' && own(c.key) && (
                    <span className={`size-1.5 rounded-full ${on ? 'bg-page' : 'bg-ink'}`} />
                  )}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={draftWithAI}
            disabled={writing}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
          >
            <SparkIcon size={10} />
            {writing ? 'Writing…' : drafted ? 'Try another' : 'Draft with AI'}
          </button>
        </div>
        <textarea
          value={value}
          rows={shownTab === 'yt' ? 2 : 5}
          onChange={(e) => edit(e.target.value)}
          placeholder={
            shownTab === 'all'
              ? 'Write once for every account. Change one account in its own tab.'
              : `What ${NAME[shownTab]} shows instead`
          }
          aria-label={shownTab === 'all' ? 'Caption' : `${NAME[shownTab]} text`}
          className="w-full resize-none rounded-[12px] bg-surface-2 p-4 text-[14.5px] leading-[1.5] outline-none placeholder:text-ink-5 focus:bg-surface"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {active.map((c) => {
            const { used, max: limit } = lengthFor(draft, c.key)
            const over = used > limit
            return (
              <span
                key={c.key}
                className={`flex items-center gap-1 font-mono text-[10.5px] tabular-nums ${over ? 'text-fail-ink' : 'text-ink-4'}`}
              >
                <PlatformLogo platform={c.key} size={9} />
                {used}/{limit.toLocaleString('en')}
              </span>
            )
          })}
          {shownTab !== 'all' && own(shownTab) && (
            <button
              type="button"
              onClick={() =>
                shownTab === 'yt'
                  ? update({ youtubeTitle: null })
                  : update({
                      overrides: Object.fromEntries(
                        Object.entries(draft.overrides).filter(([k]) => k !== shownTab),
                      ),
                    })
              }
              className="ml-auto text-[12px] text-ink-3 hover:text-ink"
            >
              Use the shared text
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Details ──────────────────────────────────────────────────────────────────────────────────

interface DetailState {
  comment: string
  location: string
  collab: string[]
  aiLabel: boolean
}

/**
 * The extras Brandwatch shows as buttons under the caption. Each appears only when an account
 * that uses it is ticked, and says which accounts get it.
 */
function Details({
  api,
  details,
  setDetails,
  labels,
  setLabels,
}: {
  api: PublishDraftApi
  details: DetailState
  setDetails: (d: DetailState) => void
  labels: string[]
  setLabels: (l: string[]) => void
}) {
  const active = activeChannels(api.draft).map((c) => c.key)
  const for_ = (keys: ChannelKey[]) => keys.filter((k) => active.includes(k))
  const story = api.draft.format === 'story'
  const rows: Array<{ key: keyof typeof DETAIL_ON; label: string; to: ChannelKey[] }> = [
    { key: 'location', label: 'Location', to: for_(DETAIL_ON.location) },
    { key: 'comment', label: 'First comment', to: story ? [] : for_(DETAIL_ON.comment) },
    { key: 'collab', label: 'Collaborators', to: story ? [] : for_(DETAIL_ON.collab) },
  ]
  return (
    <section aria-label="Details" className={CARD}>
      <span className={EYEBROW}>Details</span>
      <div className="flex flex-col">
        {rows
          .filter((r) => r.to.length > 0)
          .map((r) => (
            <div
              key={r.key}
              className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3 border-b border-(--cal-line) py-3 first:pt-0"
            >
              <span className="flex flex-col gap-1 pt-1.5">
                <span className="text-[13px]">{r.label}</span>
                <span className="flex gap-1 text-ink-4">
                  {r.to.map((k) => (
                    <PlatformLogo key={k} platform={k} size={9} />
                  ))}
                </span>
              </span>
              {r.key === 'location' ? (
                <input
                  value={details.location}
                  onChange={(e) => setDetails({ ...details, location: e.target.value })}
                  aria-label="Location"
                  className="h-9 rounded-[10px] bg-surface-2 px-3 text-[13.5px] outline-none focus:bg-surface"
                />
              ) : r.key === 'comment' ? (
                <textarea
                  value={details.comment}
                  rows={2}
                  onChange={(e) => setDetails({ ...details, comment: e.target.value })}
                  placeholder="Posted under the post as the first comment, e.g. the booking link or hashtags"
                  aria-label="First comment"
                  className="resize-none rounded-[10px] bg-surface-2 px-3 py-2 text-[13.5px] outline-none placeholder:text-ink-5 focus:bg-surface"
                />
              ) : (
                <Chips
                  values={details.collab}
                  onChange={(collab) => setDetails({ ...details, collab })}
                  placeholder="@account, up to 3"
                  max={3}
                />
              )}
            </div>
          ))}
        <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3 border-b border-(--cal-line) py-3">
          <span className="text-[13px]">AI-generated</span>
          <span className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-ink-4">
              Labels the post where the platform asks for it
            </span>
            <Switch
              label="AI-generated label"
              checked={details.aiLabel}
              onChange={(aiLabel) => setDetails({ ...details, aiLabel })}
            />
          </span>
        </div>
        <div className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3 pt-3">
          <span className="flex flex-col gap-0.5 pt-1.5">
            <span className="text-[13px]">Labels</span>
            <span className="text-[11px] text-ink-4">Internal only</span>
          </span>
          <Chips values={labels} onChange={setLabels} placeholder="e.g. TMP_Wine, F1 weekend" />
        </div>
      </div>
    </section>
  )
}

/** Values as chips; type and press Enter to add one. */
function Chips({
  values,
  onChange,
  placeholder,
  max,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  max?: number
}) {
  const [draft, setDraft] = React.useState('')
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-[10px] bg-surface-2 px-2 py-1.5 focus-within:bg-surface">
      {values.map((v) => (
        <span
          key={v}
          className="flex h-6 items-center gap-1 rounded-full bg-page px-2 text-[12px] shadow-soft"
        >
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-ink-4 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </span>
      ))}
      {(max === undefined || values.length < max) && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault()
              if (!values.includes(draft.trim())) onChange([...values, draft.trim()])
              setDraft('')
            }
          }}
          placeholder={values.length ? '' : placeholder}
          aria-label={placeholder}
          className="min-w-[120px] flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-ink-5"
        />
      )}
    </div>
  )
}

// ── Per-account settings ─────────────────────────────────────────────────────────────────────

interface Extra {
  ytVisibility: string
  fbAudience: string
  liVisibility: string
  igShareToFeed: boolean
}

/** What one platform alone needs, a row per ticked account; a row that needs an answer says so. */
function PerAccount({
  api,
  extra,
  setExtra,
}: {
  api: PublishDraftApi
  extra: Extra
  setExtra: (e: Extra) => void
}) {
  const { draft } = api
  const active = activeChannels(draft)
  const [open, setOpen] = React.useState<ChannelKey | null>(
    active.some((c) => c.key === 'tt') && draft.privacy === null ? 'tt' : null,
  )

  const summary: Record<ChannelKey, { text: string; needs: boolean }> = {
    tt: {
      text: draft.privacy
        ? `${draft.privacy} · interactions ${Object.values(draft.interactions).some(Boolean) ? 'on' : 'off'}`
        : 'Who can watch?',
      needs: draft.privacy === null || (draft.promo.on && !draft.promo.own && !draft.promo.paid),
    },
    yt: {
      text: `${extra.ytVisibility} · ${draft.madeForKids ? 'Made for kids' : 'Not for kids'}`,
      needs: false,
    },
    fb: { text: `Audience: ${extra.fbAudience}`, needs: false },
    li: { text: `Visible to ${extra.liVisibility.toLowerCase()}`, needs: false },
    ig: {
      text:
        draft.format === 'reel'
          ? extra.igShareToFeed
            ? 'Reel also shown in the feed'
            : 'Reels tab only'
          : draft.format === 'story'
            ? 'Story'
            : 'Feed post',
      needs: false,
    },
  }

  return (
    <section aria-label="Per account" className={CARD}>
      <span className={EYEBROW}>Per account</span>
      <div className="flex flex-col">
        {active.map((c) => {
          const s = summary[c.key]
          const on = open === c.key
          return (
            <div key={c.key} className="border-b border-(--cal-line) last:border-b-0">
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpen(on ? null : c.key)}
                className="flex min-h-12 w-full items-center gap-3 text-left"
              >
                <PlatformLogo platform={c.key} size={14} />
                <span className="text-[13.5px] font-medium">{c.name}</span>
                <span className="flex flex-1 items-center gap-1.5 text-[12.5px] text-ink-3">
                  {s.needs && <span className="size-1.5 rounded-full bg-ink" />}
                  {s.text}
                </span>
                <ChevronIcon open={on} size={9} />
              </button>
              <Fold open={on}>
                <div className="pb-4 pl-[26px]">
                  {c.key === 'tt' ? (
                    <TikTokRows api={api} />
                  ) : c.key === 'yt' ? (
                    <Rows
                      rows={[
                        {
                          label: 'Made for kids',
                          control: (
                            <Choice
                              value={draft.madeForKids ? 'Yes' : 'No'}
                              options={['No', 'Yes']}
                              onChange={(v) => api.update({ madeForKids: v === 'Yes' })}
                            />
                          ),
                        },
                        {
                          label: 'Visibility',
                          control: (
                            <Choice
                              value={extra.ytVisibility}
                              options={['Public', 'Unlisted', 'Private']}
                              onChange={(v) => setExtra({ ...extra, ytVisibility: v })}
                            />
                          ),
                        },
                      ]}
                      note="The title is the YouTube tab above the caption. Up to 3 minutes and vertical makes it a Short."
                    />
                  ) : c.key === 'fb' ? (
                    <Rows
                      rows={[
                        {
                          label: 'Who sees it in the feed',
                          control: (
                            <Choice
                              value={extra.fbAudience}
                              options={['Everyone', 'Singapore only']}
                              onChange={(v) => setExtra({ ...extra, fbAudience: v })}
                            />
                          ),
                        },
                      ]}
                    />
                  ) : c.key === 'li' ? (
                    <Rows
                      rows={[
                        {
                          label: 'Visibility',
                          control: (
                            <Choice
                              value={extra.liVisibility}
                              options={['Anyone', 'Followers']}
                              onChange={(v) => setExtra({ ...extra, liVisibility: v })}
                            />
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <Rows
                      rows={
                        draft.format === 'reel'
                          ? [
                              {
                                label: 'Also show in the feed',
                                control: (
                                  <Switch
                                    label="Also show in the feed"
                                    checked={extra.igShareToFeed}
                                    onChange={(v) => setExtra({ ...extra, igShareToFeed: v })}
                                  />
                                ),
                              },
                            ]
                          : []
                      }
                      note={
                        draft.format === 'story'
                          ? 'Instagram cannot add stickers or links to a Story through its API: if this one needs them, the team gets a reminder to post it from the phone.'
                          : undefined
                      }
                    />
                  )}
                </div>
              </Fold>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Rows({
  rows,
  note,
}: {
  rows: Array<{ label: string; control: React.ReactNode }>
  note?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex min-h-10 items-center justify-between gap-4">
          <span className="text-[13px] text-ink-2">{r.label}</span>
          {r.control}
        </div>
      ))}
      {note && <p className="text-[12px] leading-[1.45] text-ink-4">{note}</p>}
    </div>
  )
}

function Choice({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <span className="flex gap-1 rounded-full bg-surface p-[3px]">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={`h-7 rounded-full px-3 text-[12px] font-medium transition-colors ${o === value ? 'bg-page text-ink shadow-soft' : 'text-ink-3 hover:text-ink'}`}
        >
          {o}
        </button>
      ))}
    </span>
  )
}

/** TikTok's own questions: who can watch has no default, and the consent line sits under them. */
function TikTokRows({ api }: { api: PublishDraftApi }) {
  const { draft, update } = api
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] text-ink-2">
          {draft.privacy === null && <span className="size-1.5 rounded-full bg-ink" />}
          Who can watch
        </span>
        <Segmented
          label="Who can watch on TikTok"
          pill
          options={PRIVACY.map((p) => ({ value: p, label: p }))}
          value={draft.privacy}
          onChange={(privacy) => update({ privacy })}
        />
      </div>
      {(
        [
          ['comments', 'Allow comments'],
          ['duet', 'Allow Duet'],
          ['stitch', 'Allow Stitch'],
        ] as const
      ).map(([key, label]) => (
        <div key={key} className="flex min-h-9 items-center justify-between gap-3">
          <span className="text-[13px] text-ink-2">{label}</span>
          <Switch
            label={label}
            checked={draft.interactions[key]}
            onChange={(v) => update({ interactions: { ...draft.interactions, [key]: v } })}
          />
        </div>
      ))}
      <div className="flex min-h-9 items-center justify-between gap-3">
        <span className="text-[13px] text-ink-2">Promotes a brand</span>
        <Switch
          label="Promotes a brand"
          checked={draft.promo.on}
          onChange={(v) => update({ promo: { ...draft.promo, on: v } })}
        />
      </div>
      <Fold open={draft.promo.on}>
        <div className="flex gap-2 pb-1">
          {(
            [
              ['own', 'Your brand'],
              ['paid', 'Paid partnership'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="checkbox"
              aria-checked={draft.promo[key]}
              onClick={() => update({ promo: { ...draft.promo, [key]: !draft.promo[key] } })}
              className={`h-8 rounded-full px-3.5 text-[12.5px] font-medium ${draft.promo[key] ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Fold>
      <p className="text-[12px] leading-[1.45] text-ink-4">{tiktokConsent(draft)}</p>
    </div>
  )
}

// ── When ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Now, a day and a time, or a draft. The day picker is the demo's month; the brand's best times,
 * from Insights, are ranked with bars like Brandwatch's, and one click uses one.
 */
function WhenCard({
  when,
  setWhen,
  dayN,
  setDayN,
  time,
  setTime,
  story,
}: {
  when: WhenChoice
  setWhen: (w: WhenChoice) => void
  dayN: string
  setDayN: (d: string) => void
  time: string
  setTime: (t: string) => void
  story: boolean
}) {
  const { brand, weeks } = useBrand()
  const best = bestTimes(brand.id, weeks)[0]
  return (
    <section aria-label="When" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={EYEBROW}>When</span>
        <div className="w-[330px]">
          <Segmented<WhenChoice>
            label="When"
            pill
            value={when}
            onChange={setWhen}
            options={[
              { value: 'now', label: 'Publish now' },
              { value: 'schedule', label: 'Schedule' },
              { value: 'draft', label: 'Save as draft' },
            ]}
          />
        </div>
      </div>
      <Fold open={when === 'schedule'}>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 pt-1 max-md:grid-cols-1">
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] text-ink-3">
              {dayLabel(weeks, dayN)} at {time}
            </span>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="font-mono text-[9.5px] text-ink-5">
                  {d}
                </span>
              ))}
              {weeks
                .flatMap((w) => w.days)
                .map((d) => {
                  const disabled = d.past || d.today
                  const on = d.n === dayN
                  const busy = feedsOf(d).some((m) => m.kind === 'post')
                  return (
                    <button
                      key={d.n}
                      type="button"
                      disabled={disabled}
                      aria-pressed={on}
                      onClick={() => setDayN(d.n)}
                      className={`relative flex h-9 items-center justify-center rounded-[9px] text-[12.5px] tabular-nums transition-colors ${on ? 'bg-ink text-page' : disabled ? 'text-ink-5' : 'text-ink hover:bg-surface'}`}
                    >
                      {d.n}
                      {busy && !on && (
                        <span className="absolute bottom-1 size-1 rounded-full bg-ink-4" />
                      )}
                    </button>
                  )
                })}
            </div>
          </div>
          <DayChart
            dayN={dayN}
            time={time}
            setTime={setTime}
            best={best}
            onBest={() => {
              if (!best) return
              setDayN(best.dayN)
              setTime(best.time)
            }}
          />
        </div>
      </Fold>
      {story && when !== 'draft' && (
        <p className="text-[12px] text-ink-4">
          Stories with stickers or links go out from the phone: the team gets a reminder at the
          time.
        </p>
      )}
    </section>
  )
}

/** "Instagram, TikTok and YouTube". */
function namesOf(keys: ChannelKey[]): string {
  const names = keys.map((k) => NAME[k])
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Each hour the chart draws, 8:00 to 22:00. */
const HOURS = Array.from({ length: 15 }, (_, i) => 8 + i)

/**
 * How good each hour is, 0–1: Insights scores five parts of the day (9, 12, 15, 18 and 21), and an
 * hour between two of them is read off the line between them.
 */
function hourly(parts: number[]): number[] {
  return HOURS.map((h) => {
    const x = (h - 9) / 3
    if (x <= 0) return parts[0]! * (1 + x / 2)
    if (x >= parts.length - 1) return parts.at(-1)! * (1 - (x - parts.length + 1) / 2)
    const i = Math.floor(x)
    return parts[i]! + (parts[i + 1]! - parts[i]!) * (x - i)
  })
}

/** Insights' weight for each weekday, Monday first. */
function dayWeights(brandId: BrandId): number[] {
  const chart = INSIGHTS_BY_BRAND[brandId].stories.find((s) => s.chart.kind === 'days')?.chart
  return chart && chart.kind === 'days' ? chart.values : [1, 1, 1, 1, 1, 1, 1]
}

/**
 * The picked day's hours as bars, the way a map shows how busy a place is. The best hour is green;
 * a bar sets the time. The bars share one scale across the week, so a quiet day looks quiet.
 */
function DayChart({
  dayN,
  time,
  setTime,
  best,
  onBest,
}: {
  dayN: string
  time: string
  setTime: (t: string) => void
  best?: { dayN: string; label: string; time: string }
  onBest: () => void
}) {
  const { brand, weeks } = useBrand()
  const [hover, setHover] = React.useState<number | null>(null)
  const weekday = Math.max(
    0,
    weeks.map((w) => w.days.findIndex((d) => d.n === dayN)).find((i) => i >= 0) ?? 0,
  )
  const weights = dayWeights(brand.id)
  const curve = hourly(INSIGHTS_BY_BRAND[brand.id].hours)
  const top = Math.max(...weights) * Math.max(...curve)
  const bars = curve.map((v) => (v * (weights[weekday] ?? 1)) / top)
  const peak = bars.indexOf(Math.max(...bars))
  const at = (h: number) => `${String(h).padStart(2, '0')}:00`
  const shown = hover ?? HOURS.findIndex((h) => at(h) === time)

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center justify-between gap-3 text-[12.5px]">
        <span className={shown === peak ? 'text-(--insight-6)' : 'text-ink-3'}>
          {shown >= 0 ? at(HOURS[shown]!) : time}
          {shown === peak ? ' · Best time' : ''}
        </span>
        {best && !(best.dayN === dayN && best.time === time) && (
          <button
            type="button"
            onClick={onBest}
            className="flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink"
          >
            <SparkIcon size={9} />
            Best: {best.label}, {best.time}
          </button>
        )}
      </span>
      <div role="radiogroup" aria-label="Post time" className="flex h-[96px] items-end gap-[3px]">
        {HOURS.map((h, i) => {
          const on = at(h) === time
          return (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${at(h)}${i === peak ? ', best time' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => {
                // A tap leaves no mouseleave behind: the label goes back to the picked hour.
                setHover(null)
                setTime(at(h))
              }}
              className="group/bar flex h-full flex-1 items-end"
            >
              <span
                className={`block w-full rounded-t-[4px] transition-opacity ${i === peak ? 'bg-(--insight-5)' : 'bg-ink-5'} ${on ? 'shadow-[0_0_0_1.5px_var(--page),0_0_0_3px_var(--ink)]' : ''} ${on || i === peak ? 'opacity-100' : hover === i ? 'opacity-90' : 'opacity-45'}`}
                style={{ height: `${Math.max(bars[i]! * 100, 4)}%` }}
              />
            </button>
          )
        })}
      </div>
      <div className="flex gap-[3px] border-t border-(--cal-line) pt-1.5 font-mono text-[9.5px] text-ink-5">
        {HOURS.map((h) => (
          <span key={h} className="flex-1 text-center whitespace-nowrap">
            {h % 3 === 0 ? `${h % 12 || 12}${h < 12 ? 'a' : 'p'}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The brand's best upcoming slots: Insights' day weight times its daypart weight, top five. */
function bestTimes(brandId: BrandId, weeks: ReturnType<typeof useBrand>['weeks']) {
  const data = INSIGHTS_BY_BRAND[brandId]
  const weights = dayWeights(brandId)
  const out: Array<{ dayN: string; label: string; time: string; score: number }> = []
  for (const w of weeks) {
    w.days.forEach((d, i) => {
      if (d.past || d.today) return
      data.hours.forEach((h, part) => {
        out.push({
          dayN: d.n,
          label: dayLabel(weeks, d.n) ?? d.n,
          time: DAYPART_TIME[part]!,
          score: (weights[i] ?? 0) * h,
        })
      })
    })
  }
  // The next two weeks: a best time a month away is not a suggestion anyone takes.
  return out
    .slice(0, 14 * DAYPART_TIME.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

// ── Approval and notes ───────────────────────────────────────────────────────────────────────

function ApprovalCard({
  approval,
  setApproval,
}: {
  approval: { on: boolean; who: string[] }
  setApproval: (a: { on: boolean; who: string[] }) => void
}) {
  return (
    <section aria-label="Approval" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex flex-col gap-1">
          <span className={EYEBROW}>Approval</span>
          <span className="text-[12.5px] text-ink-3">
            {approval.on
              ? 'Goes out once approved. They get a link, no login needed.'
              : 'Goes out without an approval step.'}
          </span>
        </span>
        <Switch
          label="Needs approval"
          checked={approval.on}
          onChange={(on) => setApproval({ ...approval, on })}
        />
      </div>
      <Fold open={approval.on}>
        <div className="flex flex-wrap gap-1.5">
          {APPROVERS.map((p) => {
            const on = approval.who.includes(p)
            return (
              <button
                key={p}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() =>
                  setApproval({
                    ...approval,
                    who: on ? approval.who.filter((x) => x !== p) : [...approval.who, p],
                  })
                }
                className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors ${on ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:text-ink'}`}
              >
                {on && <CheckIcon size={8} strokeWidth={2.4} />}
                {p}
              </button>
            )
          })}
        </div>
      </Fold>
    </section>
  )
}

/** Notes on the post: internal for the team, external for whoever approves or films it. */
function Notes({
  notes,
  setNotes,
}: {
  notes: Array<{ kind: 'internal' | 'external'; text: string }>
  setNotes: (n: Array<{ kind: 'internal' | 'external'; text: string }>) => void
}) {
  const [kind, setKind] = React.useState<'internal' | 'external'>('internal')
  const [draft, setDraft] = React.useState('')
  const shown = notes.filter((n) => n.kind === kind)
  return (
    <section
      aria-label="Notes"
      className="bb-rise flex flex-col gap-3 rounded-[18px] bg-page p-5 shadow-[0_0_0_1px_var(--line)]"
    >
      <Segmented<'internal' | 'external'>
        label="Notes"
        pill
        value={kind}
        onChange={setKind}
        options={[
          { value: 'internal', label: 'Internal' },
          { value: 'external', label: 'External' },
        ]}
      />
      {shown.length === 0 ? (
        <p className="text-[12.5px] text-ink-4">
          {kind === 'internal'
            ? 'Only the team sees these.'
            : 'Shown to the people you share the post with.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((n, i) => (
            <li key={i} className="rounded-[10px] bg-surface-2 px-3 py-2 text-[13px]">
              <span className="block text-[11px] text-ink-4">You · just now</span>
              {n.text}
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          setNotes([...notes, { kind, text: draft.trim() }])
          setDraft('')
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Add an ${kind} note`}
          aria-label={`Add an ${kind} note`}
          className="h-9 w-full rounded-full bg-surface px-3.5 text-[13px] outline-none placeholder:text-ink-5"
        />
      </form>
    </section>
  )
}

// ── Preview ──────────────────────────────────────────────────────────────────────────────────

/** The post as one account will show it: a tab per ticked account, and Instagram's grid. */
function Preview({ api, media }: { api: PublishDraftApi; media: string[] }) {
  const { draft } = api
  const { posts } = useBrand()
  const active = activeChannels(draft)
  const [picked, setPicked] = React.useState<ChannelKey | null>(null)
  const [grid, setGrid] = React.useState(false)
  const channel = active.find((c) => c.key === picked)?.key ?? active[0]?.key
  const showGrid = grid && channel === 'ig' && draft.format !== 'story'
  return (
    <section
      aria-label="Preview"
      className="flex flex-col gap-4 rounded-[18px] bg-page p-5 shadow-[0_0_0_1px_var(--line)]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {active.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={c.key === channel}
              aria-label={`Preview on ${c.name}`}
              onClick={() => setPicked(c.key)}
              className={`flex size-8 items-center justify-center rounded-full transition-colors ${c.key === channel ? 'bg-ink text-page' : 'text-ink-3 hover:bg-page hover:text-ink'}`}
            >
              <PlatformLogo platform={c.key} size={13} />
            </button>
          ))}
        </div>
        {channel === 'ig' && draft.format !== 'story' && (
          <div className="w-[136px]">
            <Segmented<'phone' | 'grid'>
              label="Preview as"
              pill
              value={grid ? 'grid' : 'phone'}
              onChange={(v) => setGrid(v === 'grid')}
              options={[
                { value: 'phone', label: 'Post' },
                { value: 'grid', label: 'Grid' },
              ]}
            />
          </div>
        )}
      </div>
      {!channel ? (
        <p className="py-16 text-center text-[13px] text-ink-4">Tick an account to preview it.</p>
      ) : showGrid ? (
        <div className="grid grid-cols-3 gap-[2px] overflow-hidden rounded-[12px]">
          {[media[0], ...posts.flatMap((p) => p.images.slice(0, 1))].slice(0, 9).map((src, i) => (
            <span
              key={i}
              className={`relative block aspect-[4/5] bg-tile ${i === 0 ? 'shadow-[inset_0_0_0_2px_var(--ink)]' : 'opacity-80'}`}
            >
              {src && <Media src={src} sizes="120px" />}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex justify-center">
          <Phone channel={channel} scale={1.25}>
            <PhoneMock
              channel={channel}
              format={draft.format}
              image={media[0]}
              text={
                channel === 'yt'
                  ? (draft.youtubeTitle ?? youtubeTitle(draft))
                  : textFor(draft, channel).text
              }
            />
          </Phone>
        </div>
      )}
      <p className="text-center text-[11.5px] text-ink-4">
        An approximate preview. Each app may draw it a little differently.
      </p>
    </section>
  )
}

// ── After the button ─────────────────────────────────────────────────────────────────────────

/** Each account's outcome: scheduled, uploading, live, or failed with a retry. */
function Outcomes({
  api,
  media,
  slot,
  onBack,
}: {
  api: PublishDraftApi
  media: string[]
  slot: string
  onBack: () => void
}) {
  const { phase, outcomes, draft } = api
  const keys = Object.keys(outcomes) as ChannelKey[]
  const failed = keys.filter((k) => outcomes[k]?.state === 'failed').length
  const accounts = keys.length === 1 ? '1 account' : `${keys.length} accounts`
  const title =
    phase === 'scheduled'
      ? 'Scheduled'
      : phase === 'publishing'
        ? 'Publishing'
        : failed
          ? `Live on ${keys.length - failed} of ${keys.length}`
          : 'Live everywhere'
  const sub =
    phase === 'scheduled'
      ? `${slot}, on ${accounts}. It is on the calendar.`
      : phase === 'publishing'
        ? `Sending to ${accounts}. You can leave this page.`
        : failed
          ? 'One account needs you.'
          : `Posted to ${accounts}.`
  return (
    <div className="flex flex-col items-center gap-8 pt-6">
      <header className="flex flex-col items-center gap-3 text-center" aria-live="polite">
        <span className="relative">
          {phase === 'done' && failed === 0 && <Confetti />}
          <span className="bb-pop flex size-10 items-center justify-center rounded-full bg-ink text-page">
            {phase === 'publishing' ? (
              <span className="bb-pulse size-[9px] rounded-full bg-page" />
            ) : (
              <CheckIcon size={14} strokeWidth={2.2} />
            )}
          </span>
        </span>
        <h1 className="font-display text-[40px] leading-none tracking-[-0.035em]">{title}</h1>
        <p className="text-[14px] text-ink-2">{sub}</p>
      </header>
      <div className="flex flex-wrap justify-center gap-6">
        {keys.map((k) => {
          const o = outcomes[k]!
          return (
            <div key={k} className="flex w-[172px] flex-col items-center gap-3">
              <Phone channel={k} scale={1}>
                <PhoneMock
                  channel={k}
                  format={draft.format}
                  image={media[0]}
                  text={
                    k === 'yt'
                      ? (draft.youtubeTitle ?? youtubeTitle(draft))
                      : textFor(draft, k).text
                  }
                />
                <OutcomePill outcome={o} />
              </Phone>
              <span className="flex items-center gap-1.5 text-[13px]">
                <PlatformLogo platform={k} size={12} />
                {NAME[k]}
              </span>
              {o.state === 'failed' && (
                <span className="flex flex-col items-center gap-1.5 text-center">
                  <span className="text-[12px] text-fail-ink">{o.reason}</span>
                  <button
                    type="button"
                    onClick={() => api.retry(k)}
                    className="h-8 rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-page"
                  >
                    Reconnect and retry
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={api.backToCompose}
          className="h-10 rounded-full bg-surface px-4 text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          Edit post
        </button>
        <button
          type="button"
          onClick={onBack}
          className="bb-press h-10 rounded-full bg-ink px-5 text-[13px] font-medium text-page"
        >
          Back to schedule
        </button>
      </div>
    </div>
  )
}

/**
 * The phone frame the mocks draw into: 172px wide, as they are designed, scaled up when the room
 * allows, so the app type stays in proportion.
 */
function Phone({
  channel,
  scale,
  children,
}: {
  channel: ChannelKey
  scale: number
  children: React.ReactNode
}) {
  const w = 172
  const h = (w * 16) / 9
  return (
    <span className="block" style={{ width: w * scale, height: h * scale }}>
      <span
        className="relative block overflow-hidden rounded-[22px] shadow-[var(--shadow-phone-up)]"
        style={{
          width: w,
          height: h,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background: channel === 'li' ? 'var(--page)' : 'var(--ink)',
        }}
      >
        {children}
      </span>
    </span>
  )
}

function OutcomePill({ outcome }: { outcome: Outcome }) {
  const label =
    outcome.state === 'scheduled'
      ? 'Scheduled'
      : outcome.state === 'uploading'
        ? `${outcome.progress}%`
        : outcome.state === 'live'
          ? 'Live'
          : 'Not posted'
  const dot =
    outcome.state === 'live'
      ? 'bg-live'
      : outcome.state === 'failed'
        ? 'bg-fail'
        : outcome.state === 'uploading'
          ? 'bb-pulse bg-ink'
          : 'bg-ink-5'
  return (
    <span
      key={outcome.state}
      className={`bb-pop absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-white/95 px-[9px] py-[5px] text-[10.5px] font-medium shadow-[0_2px_10px_rgba(18,18,18,0.18)] ${outcome.state === 'failed' ? 'text-fail-ink' : 'text-ink'}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

/** A draft saved or sent for approval: it is on the calendar, nothing went out. */
function Saved({ message, onEdit }: { message: string; onEdit: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-16 text-center">
      <span className="bb-pop flex size-10 items-center justify-center rounded-full bg-ink text-page">
        <CheckIcon size={14} strokeWidth={2.2} />
      </span>
      <h1 className="font-display text-[36px] leading-none tracking-[-0.035em]">{message}</h1>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="h-10 rounded-full bg-surface px-4 text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          Keep editing
        </button>
        <Link
          href="/"
          className="bb-press flex h-10 items-center rounded-full bg-ink px-5 text-[13px] font-medium text-page"
        >
          Back to schedule
        </Link>
      </div>
    </div>
  )
}
