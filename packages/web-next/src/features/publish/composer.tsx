'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Confetti } from '@/components/confetti'
import { Fold, Segmented, Switch } from '@/components/controls'
import {
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CropIcon,
  PlusIcon,
  SparkIcon,
} from '@/components/icons'
import { fromFile, isVideo, Media } from '@/components/media'
import { PlatformLogo } from '@/components/platform-logos'
import { Sheet } from '@/components/sheet'
import { Combobox, useMention, type Suggestion } from '@/components/suggest'
import { usePhone } from '@/components/use-phone'
import type { BrandId } from '@/data/brands'
import type { Format, Post, Stage } from '@/data/demo'
import { feedsOf } from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'
import { CAPTION_DRAFTS, HASHTAGS, VENUE } from '@/data/publish'
import { dayLabel } from '@/features/ideate/calendar-slot'
import { MonthArrows, useMonthPages } from '@/features/ideate/day-picker'
import { composeChannels, sentChannels } from '@/features/schedule/calendar-items'
import { dayOf, storyTaken } from '@/features/schedule/move-post'
import { ConnectSheet } from '@/features/connections/connect-sheet'
import { useConnections, useConnected } from '@/features/connections/connections-store'
import { NotAvailable } from '@/features/connections/not-available'
import { ideaIdOfHook } from '@/features/ideate/ideas-store'
import { useBrand } from '@/features/schedule/posts-store'
import { demoOf, newId, quietly, remote, request, sent } from '@/lib/remote'
import { addDays, dayNumber, monthOf, todayDate, weekdayOf } from '@/lib/dates'
import { mediaItem } from '@/lib/remote-days'

import { CropEditor } from './crop-editor'
import { DriveGlyph, DrivePicker } from './drive-picker'
import { DropZone } from './drop-zone'
import {
  activeChannels,
  blockers,
  CHANNELS,
  COLLAB_MAX,
  defaultCrop,
  frameRatio,
  handleOf,
  improveCaption,
  initialDraft,
  inviteNote,
  isUncut,
  kindOn,
  lengthFor,
  linkedChannels,
  parseTime,
  EARLIEST_POST,
  PRIVACY,
  shapeFix,
  shotOf,
  TAG_MAX,
  textFor,
  tiktokConsent,
  tiktokSettings,
  youtubeTitle,
  type Aspect,
  type ChannelKey,
  type Crop,
  type Draft,
  type Outcome,
  type Shot,
} from './model'
import { PhoneMock, type People } from './phone-mocks'
import { TypeBadge } from './preview-media'
import { ratioOf, ShotView } from './shot'
import { hashtagsOf, labelsOf, peopleOf, placesOf } from './suggestions'
import {
  saveTikTokDefault,
  tiktokDefault,
  usePublishDraft,
  type PublishDraftApi,
  type Sound,
  type TikTokDefault,
} from './use-publish-draft'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'
// On a phone a card is bare: the page is white, and a card opens in a sheet that has its own frame.
const CARD =
  'flex flex-col gap-4 rounded-[18px] bg-page p-6 shadow-[0_0_0_1px_var(--line)] max-md:gap-5 max-md:rounded-none max-md:p-0 max-md:shadow-none'
/** A row of chips that scrolls sideways on a phone instead of wrapping. */
const STRIP = 'max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4'
/** A segmented control's options grow to a thumb's height on a phone. */
const TAP = 'max-md:[&_button]:h-10'

const NAME: Record<ChannelKey, string> = {
  ig: 'Instagram',
  tt: 'TikTok',
  yt: 'YouTube',
  li: 'LinkedIn',
  fb: 'Facebook',
}

/** The parts of the day Insights scores, as the time each one posts at. */
const DAYPART_TIME = ['09:00', '12:00', '15:00', '18:00', '21:00']
const MEDIA_MAX: Record<Format, number> = { reel: 1, carousel: 10, story: 10 }
const MEDIA_RULE: Record<Format, string> = {
  reel: 'One video, vertical, up to 90 seconds',
  carousel: 'Up to 10 photos or videos',
  story: 'Up to 10 frames, each shown for a few seconds',
}

type WhenChoice = 'now' | 'schedule'

/** Which accounts a detail is sent to. A detail with none of them selected stays hidden. */
const DETAIL_ON: Record<'comment' | 'location' | 'tags' | 'collab', ChannelKey[]> = {
  comment: ['ig', 'fb'],
  location: ['ig', 'fb'],
  tags: ['ig'],
  collab: ['ig'],
}

/**
 * The composer: one post for every platform. In Brandwatch a post belongs to one network and is
 * copied by hand to the next; here the brand's accounts are ticked together, the shared fields are
 * written once, and only what one platform truly needs is asked inside that account's row. The
 * publish rules live in `model.ts`; this page reads them. UI only: the send is simulated.
 */
/** The composer's own fields, as it keeps them with a post on the server. */
interface KeptDraft {
  overrides?: Draft['overrides']
  youtubeTitle?: string | null
  madeForKids?: boolean
  privacy?: Draft['privacy']
  interactions?: Draft['interactions']
  promo?: Draft['promo']
  details?: { comment: string; location: string; collab: string[]; aiLabel: boolean }
  labels?: string[]
  extra?: {
    ytVisibility: string
    fbAudience: string
    liVisibility: string
    igShareToFeed: boolean
    ttSound: Sound
  }
  shots?: Pick<Shot, 'crop' | 'tags'>[]
}

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
    saved: savedOf,
  } = useBrand()
  // What the composer kept with this post on the server: its caption and the rest of the draft.
  const kept = post ? savedOf(post.id) : undefined
  const keptDraft = (kept?.draft ?? {}) as KeptDraft
  // The accounts linked on the Connections page. One that needs signing in again still shows,
  // with Reconnect; one disconnected there is gone from the composer.
  const links = useConnections(brand.id)
  const publishing = (['ig', 'tt', 'fb'] as const).filter((k) => links[k] !== 'off')
  const api = usePublishDraft({
    format: post?.format ?? start?.format ?? 'reel',
    hook: post?.hook ?? '',
    caption: post ? kept?.caption || captions[post.id] || post.hook : '',
    selected: post ? composeChannels(post) : undefined,
    linked: publishing,
    connected: publishing.filter((k) => links[k] === 'connected'),
    tiktok:
      keptDraft.privacy !== undefined && keptDraft.interactions && keptDraft.promo
        ? {
            privacy: keptDraft.privacy,
            interactions: keptDraft.interactions,
            promo: keptDraft.promo,
          }
        : tiktokDefault(brand.id),
  })
  const [reconnected, setReconnected] = React.useState(false)
  // The post as it opened: after a retry the live post is no longer failed, and a second send
  // (after "Edit post") must still keep the accounts it had reached.
  const [opened] = React.useState(post)
  const failedKey = post?.failedOn ?? 'ig'
  const failedName = NAME[failedKey]
  const { draft, update, phase } = api

  const [media, setMedia] = React.useState<Shot[]>(() =>
    (post?.images ?? []).map((src, i) => {
      const shot = shotOf(src)
      const was = keptDraft.shots?.[i]
      return was ? { ...shot, crop: was.crop, tags: was.tags } : shot
    }),
  )
  /**
   * Files from the picker or a drop, on the strip or on the preview: photos and videos only,
   * added in order, the format's limit kept from the end.
   */
  const addFiles = React.useCallback(
    async (files: FileList | null) => {
      const picked = [...(files ?? [])].filter((f) => /^(image|video)\//.test(f.type))
      if (picked.length === 0) return
      const dropped = await Promise.all(picked.map(fromFile))
      const max = MEDIA_MAX[draft.format]
      setMedia((m) => [...m, ...dropped.map((d) => shotOf(d.src))].slice(-max))
    },
    [draft.format],
  )
  // A failed post was due already: the fix is to send it now.
  const [when, setWhen] = React.useState<WhenChoice>(post?.stage === 'failed' ? 'now' : 'schedule')
  const [date, setDate] = React.useState<string>(
    () => (post && dayOf(weeks, post.id)) || start?.day || addDays(todayDate(), 7),
  )
  const [time, setTime] = React.useState(
    () =>
      post?.slot.split(', ')[1] ??
      start?.time ??
      demoOf(INSIGHTS_BY_BRAND, brand.id)?.best ??
      '18:00',
  )
  // A new post, once placed: a second send after "Edit post" moves it instead of placing another.
  const [madeId, setMadeId] = React.useState<string | null>(null)
  // The idea a new post started from, so the calendar swaps that idea's tile for the post.
  const [ideaHook, setIdeaHook] = React.useState<string | null>(null)
  // A post off the calendar's weeks is shown, not changed. A posted one has its own view below.
  const readOnly = Boolean(post && !dayOf(weeks, post.id))
  const [details, setDetails] = React.useState(
    () =>
      keptDraft.details ?? {
        comment: '',
        location: demoOf(VENUE, brand.id) ?? '',
        collab: [] as string[],
        aiLabel: false,
      },
  )
  const [labels, setLabels] = React.useState<string[]>(() => keptDraft.labels ?? [])
  const [extra, setExtra] = React.useState(
    () =>
      keptDraft.extra ?? {
        ytVisibility: 'Public',
        fbAudience: 'Everyone',
        liVisibility: 'Anyone',
        igShareToFeed: true,
        ttSound: tiktokDefault(brand.id)?.sound ?? ('own' as Sound),
      },
  )
  // The rest of the saved draft goes back into the model once, as it opens.
  React.useEffect(() => {
    if (keptDraft.overrides || keptDraft.youtubeTitle !== undefined) {
      update({
        overrides: keptDraft.overrides ?? {},
        youtubeTitle: keptDraft.youtubeTitle ?? null,
        madeForKids: keptDraft.madeForKids ?? false,
      })
    }
    // Once, as the composer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // One key per send: a repeat of it, a double press or a retry after an answer that never
  // arrived, returns its first answer, never a second send. The server keeps a key only once the
  // send is stored, so a refused send can be tried again under the same key.
  const sendKey = React.useRef('')
  // A new post the server has stored: from then on a save moves it instead of making it.
  const created = React.useRef(false)
  // On a phone each card opens in a sheet from its row; one sheet at a time.
  const [sheet, setSheet] = React.useState<SheetKey | null>(null)
  const closeSheet = React.useCallback(() => setSheet(null), [])
  const [saved, setSaved] = React.useState(false)
  // A save or a send on its way to the server.
  const [waiting, setWaiting] = React.useState<'send' | 'save' | null>(null)

  const active = activeChannels(draft)
  const targetId = post?.id ?? madeId
  const storyDay = when === 'now' ? todayDate() : date
  const blocked = [
    ...(readOnly ? ['Not on the calendar: it can be viewed, not changed.'] : []),
    ...(post?.stage === 'failed' && !reconnected ? [`Reconnect ${failedName} first.`] : []),
    ...(media.length === 0 && draft.format !== 'story' ? ['Add a photo or video.'] : []),
    ...(media.length > MEDIA_MAX[draft.format]
      ? [`A ${draft.format} takes ${MEDIA_MAX[draft.format]}: remove the extra media.`]
      : []),
    ...(draft.format === 'story' && storyTaken(weeks, storyDay, targetId ?? undefined)
      ? ['A story is already on that day: pick another.']
      : []),
    ...blockers(draft),
    ...(when === 'schedule' && !date ? ['Pick a day.'] : []),
    // A draft can sit on a day that has since passed: a schedule needs a day ahead.
    ...(when === 'schedule' && date && date < todayDate() ? ['Pick a day ahead.'] : []),
  ]
  // Nothing can go out: a read-only post, or a blocker (a draft may still be saved unfinished).
  const stuck = readOnly || blocked.length > 0
  // A retry names its accounts by their logos, so the button shows exactly where it goes again.
  // Before the reconnect, the account that failed is not ticked yet: the button names it anyway.
  const retryOn = active.length > 0 ? active.map((c) => c.key) : reconnected ? [] : [failedKey]
  const retry = retryOn.length > 0 && when === 'now' && post?.stage === 'failed'
  const label = retry
    ? 'Retry on'
    : active.length === 0
      ? // On the core no account can be picked yet: nothing to ask for.
        remote && draft.linked.length === 0
        ? 'Not available yet'
        : 'Pick an account'
      : when === 'now'
        ? 'Post on'
        : 'Schedule on'
  // A send names its accounts by their logos, so the button shows exactly where the post goes.
  const logos = retry ? retryOn : active.map((c) => c.key)

  /** The words a new post is known by on the calendar. */
  const newHook = () => ideaHook ?? (draft.caption.split(/[.!?\n]/)[0]?.trim() || 'New post')

  /**
   * The server's side of a save or a send, in order: the post is made or moved, everything the
   * composer holds is kept with it, then it is sent. The stage then comes from the send's jobs,
   * never from a hand mark, so "Publish now" is posted once each account says so.
   */
  function toServer(id: string, isNew: boolean, send: 'now' | 'slot' | null) {
    // Resolves to the server's refusal in words, or null once everything is stored.
    const b = brand.id
    const day = date
    const content = {
      caption: draft.caption,
      channels: (retry ? retryOn : active.map((c) => c.key)) as string[],
      media: media.map((m) => mediaItem(m.src)),
      draft: {
        overrides: draft.overrides,
        youtubeTitle: draft.youtubeTitle,
        madeForKids: draft.madeForKids,
        privacy: draft.privacy,
        interactions: draft.interactions,
        promo: draft.promo,
        details,
        labels,
        extra,
        shots: media.map((m) => ({ crop: m.crop, tags: m.tags })),
      },
    }
    return sent(b, async () => {
      if (isNew) {
        const ideaId = ideaHook ? ideaIdOfHook(b, ideaHook) : undefined
        if (ideaId) {
          await request('POST', `/brands/${b}/ideas/${ideaId}/plan`, {
            postId: id,
            day,
            time,
            stage: 'draft',
          })
        } else {
          await request('POST', `/brands/${b}/posts`, {
            id,
            format: draft.format,
            hook: newHook(),
            ...(send !== 'now' && { day, time }),
          })
        }
      } else if (send !== 'now') {
        await request('POST', `/brands/${b}/posts/${id}/move`, { day, time })
      }
      await request('PATCH', `/brands/${b}/posts/${id}`, content)
      if (send) {
        await request(
          'POST',
          `/brands/${b}/posts/${id}/send`,
          { when: send, channels: content.channels },
          { 'idempotency-key': sendKey.current },
        )
      }
    })
  }

  // The post as the calendar has it now. A refused first save reloads the brand without it, so
  // the next press makes it again, under the same id.
  const live = targetId && byId(targetId) ? targetId : null

  /** The post on the calendar: moved and restaged if it exists, placed if it is new. */
  function toCalendar(stage: Stage): string | null {
    const day = when === 'now' ? todayDate() : date
    const channels = sentChannels(
      opened,
      active.map((c) => c.key),
    )
    if (live) {
      reschedule(live, day, time)
      setStage(live, stage)
      setChannels(live, channels)
      return live
    }
    const hook = newHook()
    const id = planPost(
      {
        format: draft.format,
        hook,
        image: media[0]?.src,
        channels,
        ...(madeId && { postId: madeId }),
      },
      day,
      time,
      stage,
    )
    setMadeId(id)
    return id
  }

  /**
   * On the API, a save or a send waits for the server: only a stored change moves on. A refusal
   * keeps the composer open with everything in it, and the app's message line says why.
   */
  async function stored(stage: Stage, send: 'now' | 'slot' | null): Promise<boolean> {
    // From what the server stored, not from the calendar, which a reload may not have reached yet.
    // A create sent again is safe: the server returns the post its id already names.
    const isNew = !post && !created.current
    const id = quietly(() => toCalendar(stage))
    if (!id) return false
    setWaiting(send ? 'send' : 'save')
    const refused = await toServer(id, isNew, send)
    setWaiting(null)
    if (refused !== null) return false
    created.current = true
    if (send) sendKey.current = ''
    return true
  }

  async function primary() {
    if (stuck || waiting) return
    const how = when === 'now' ? 'now' : 'slot'
    update({ when: how })
    if (remote) {
      sendKey.current ||= newId()
      if (!(await stored(when === 'now' ? 'posted' : 'scheduled', how))) return
    } else {
      toCalendar(when === 'now' ? 'posted' : 'scheduled')
    }
    api.send(how)
  }

  // A post already past draft keeps its stage when saved: saving a caption must not unschedule it.
  const keeps = post !== undefined && post.stage !== 'draft'

  async function saveDraft() {
    if (readOnly || waiting) return
    if (remote) {
      if (!(await stored(keeps ? post.stage : 'draft', null))) return
    } else {
      toCalendar(keeps ? post.stage : 'draft')
    }
    setSaved(true)
  }

  if (saved)
    return (
      <Saved
        title={keeps ? 'Saved' : 'Saved as a draft on the calendar'}
        onEdit={() => setSaved(false)}
      />
    )
  if (phase !== 'compose') {
    return (
      <Outcomes
        api={api}
        media={media}
        people={{ collabs: details.collab, tags: media[0]?.tags ?? [] }}
        slot={`${dayLabel(date)}, ${time}`}
        onBack={() => router.push('/')}
      />
    )
  }

  const hint = blocked[0] && (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <span className="size-1.5 shrink-0 rounded-full bg-ink" />
      <span className="min-w-0 truncate">{blocked[0]}</span>
      {blocked.length > 1 && <span className="text-ink-4">+{blocked.length - 1}</span>}
    </span>
  )
  /** The send button. On a phone, while it is disabled, it says what stops it. */
  const send = (phone: boolean) => (
    <button
      type="button"
      aria-disabled={stuck}
      // While it shows what stops it, its name says so too, not where it would send.
      aria-label={
        phone && stuck && blocked[0]
          ? `${label}: ${blocked.join(' ')}`
          : logos.length > 0
            ? `${label} ${namesOf(logos)}`
            : undefined
      }
      aria-busy={waiting === 'send'}
      onClick={primary}
      className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-5 text-[13.5px] font-medium transition-[background-color,box-shadow] max-md:h-12 max-md:text-[14px] ${stuck ? 'cursor-not-allowed bg-surface text-ink-4' : 'bb-press bg-ink text-page hover:shadow-lift'}`}
    >
      {waiting === 'send' ? (
        'Sending…'
      ) : phone && stuck ? (
        <span className="flex min-w-0 max-w-full text-ink-3">{hint}</span>
      ) : (
        <>
          {label}
          {logos.length > 0 && (
            <span className="flex items-center gap-1.5">
              {logos.map((k) => (
                <PlatformLogo key={k} platform={k} size={13} />
              ))}
            </span>
          )}
        </>
      )}
    </button>
  )
  /** The quiet way out: the post goes on the calendar as a draft, finished or not, or keeps its stage. */
  const draftButton = (
    <button
      type="button"
      aria-disabled={readOnly}
      aria-busy={waiting === 'save'}
      onClick={saveDraft}
      className={`flex h-10 shrink-0 items-center rounded-full px-4 text-[13px] font-medium transition-colors max-md:h-12 max-md:text-[14px] ${readOnly ? 'cursor-not-allowed text-ink-5' : 'bg-surface text-ink-2 hover:bg-paper hover:text-ink'}`}
    >
      {waiting === 'save' ? 'Saving…' : keeps ? 'Save' : 'Save draft'}
    </button>
  )
  // What Instagram shows of the people: the collaborators in its name line, the first photo's tags.
  const people = {
    collabs: draft.format === 'story' ? [] : details.collab,
    tags: draft.format === 'story' ? [] : (media[0]?.tags ?? []),
  }
  const counts = post?.metrics && { on: post.channels?.[0], metrics: post.metrics }
  // Posted is final: the post as it went out, on the accounts it went to, and nothing to change.
  if (post?.stage === 'posted') {
    // Only the accounts it went out on, its first one open; none recorded, no preview.
    const went = post.channels ?? []
    const day = dayOf(weeks, post.id)
    const year = day ? monthOf(day).year : 0
    const posted = day
      ? `${dayLabel(day)}${year !== monthOf(todayDate()).year ? ` ${year}` : ''}`
      : post.slot.split(', ')[0]
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-[38px] leading-none tracking-[-0.035em] max-md:text-[28px] max-md:leading-[1.05]">
            {post.hook}
          </h1>
          <p className="text-[13px] text-ink-3">Posted on {posted}</p>
        </header>
        {went.length > 0 && (
          <div className="w-full max-w-[400px]">
            <Preview
              api={api}
              media={media}
              people={people}
              onFiles={addFiles}
              // Its own counts or none: never the preview's invented ones.
              counts={{ on: went[0], metrics: post.metrics ?? {} }}
              on={went}
              self={post.id}
            />
          </div>
        )}
      </div>
    )
  }
  // The sheet a phone row opened, over the same cards the desktop shows in place.
  const inSheet: Partial<Record<SheetKey, { title: string; body: React.ReactNode }>> = {
    accounts: { title: 'Post to', body: <Accounts api={api} /> },
    details: {
      title: 'Details',
      body: (
        <Details
          api={api}
          details={details}
          setDetails={setDetails}
          labels={labels}
          setLabels={setLabels}
          media={media}
          setMedia={setMedia}
        />
      ),
    },
    when: {
      title: 'When',
      body: (
        <WhenCard
          when={when}
          setWhen={setWhen}
          date={date}
          setDate={setDate}
          time={time}
          setTime={setTime}
        />
      ),
    },
    preview: {
      title: 'Preview',
      body: (
        <Preview
          api={api}
          media={media}
          people={people}
          onFiles={addFiles}
          counts={counts}
          self={post?.id}
        />
      ),
    },
    ...Object.fromEntries(
      active.map((c) => [
        c.key,
        {
          title: c.name,
          body: <PerAccount api={api} extra={extra} setExtra={setExtra} only={c.key} />,
        },
      ]),
    ),
  }
  const whenText = when === 'now' ? 'Now' : `${dayLabel(date)}, ${time}`
  const onIg = active.some((c) => c.key === 'ig') && draft.format !== 'story'
  const tagCount = onIg ? taggedIn(media).length : 0
  const detailText =
    [
      active.some((c) => DETAIL_ON.location.includes(c.key)) ? details.location : '',
      tagCount > 0 ? `${tagCount} tagged` : '',
      onIg && details.collab.length > 0 ? `with ${details.collab.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || labels.join(', ')

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        {/* A post that exists says where it is; a new one is new, as its title says. */}
        {post && (
          <span className="self-start rounded-full bg-surface px-2 py-[2px] text-[11px] font-medium text-ink-2">
            {STAGE_LABEL[post.stage]}
          </span>
        )}
        <h1 className="font-display text-[38px] leading-none tracking-[-0.035em] max-md:text-[28px] max-md:leading-[1.05]">
          {post ? post.hook : 'New post'}
        </h1>
      </header>
      {/* On a phone the send bar sits at the bottom, under the thumb, and stays there. */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-line bg-page/95 px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden">
        {draftButton}
        {send(true)}
      </div>

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
              className="bb-press h-9 shrink-0 rounded-full bg-page px-4 text-[13px] font-medium text-ink shadow-[0_0_0_1px_var(--line)] hover:shadow-[0_0_0_1px_var(--line-strong)] max-md:h-11 max-md:w-full"
            >
              Reconnect {failedName}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6 max-lg:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-4 max-md:gap-7">
          <div className="max-md:hidden">
            <Accounts api={api} />
          </div>
          <Content
            api={api}
            media={media}
            setMedia={setMedia}
            onFiles={addFiles}
            library={library}
            ideas={post ? [] : ideas.filter((i) => !i.postId || !byId(i.postId))}
            onIdea={setIdeaHook}
          />
          {/* The phone's list: every other card as a row that says its answer and opens it. */}
          <div className="flex flex-col border-t border-(--cal-line) md:hidden">
            <Row
              label="Post to"
              value={
                active.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5">
                      {active.map((c) => (
                        <PlatformLogo key={c.key} platform={c.key} size={12} />
                      ))}
                    </span>
                    · {FORMAT_LABEL[draft.format]}
                  </span>
                ) : remote ? (
                  'Not available yet'
                ) : (
                  'No account'
                )
              }
              dot={active.length === 0}
              onClick={() => setSheet('accounts')}
            />
            <Row label="When" value={whenText} onClick={() => setSheet('when')} />
            <Row label="Details" value={detailText} onClick={() => setSheet('details')} />
            {active.map((c) => {
              const s = summaryOf(draft, extra)[c.key]
              return (
                <Row
                  key={c.key}
                  label={
                    <span className="flex items-center gap-2.5">
                      <PlatformLogo platform={c.key} size={13} />
                      {c.name}
                    </span>
                  }
                  value={s.text}
                  dot={s.needs}
                  onClick={() => setSheet(c.key)}
                />
              )
            })}
            <Row label="Preview" value="" onClick={() => setSheet('preview')} />
          </div>
          <div className="flex min-w-0 flex-col gap-4 max-md:hidden">
            <Details
              api={api}
              details={details}
              setDetails={setDetails}
              labels={labels}
              setLabels={setLabels}
              media={media}
              setMedia={setMedia}
            />
            {active.length > 0 && <PerAccount api={api} extra={extra} setExtra={setExtra} />}
            <WhenCard
              when={when}
              setWhen={setWhen}
              date={date}
              setDate={setDate}
              time={time}
              setTime={setTime}
            />
          </div>
        </div>
        {/* The button sits under the preview and scrolls with it, so what goes out is in view. */}
        <div className="sticky top-6 flex flex-col gap-3 max-lg:static max-md:hidden">
          <Preview
            api={api}
            media={media}
            people={people}
            onFiles={addFiles}
            counts={counts}
            self={post?.id}
          />
          <div className="flex items-center gap-2 px-1">
            {draftButton}
            {send(false)}
          </div>
          <span aria-live="polite" className="min-h-[18px] px-1 text-[12px] text-ink-3">
            {hint}
          </span>
        </div>
      </div>
      {sheet && inSheet[sheet] && (
        <Sheet title={inSheet[sheet].title} onClose={closeSheet}>
          {inSheet[sheet].body}
        </Sheet>
      )}
    </div>
  )
}

type SheetKey = 'accounts' | 'details' | 'when' | 'preview' | ChannelKey

/** The publishing platforms, none of which can connect on the core yet. */
const UNSET: ChannelKey[] = ['ig', 'tt', 'fb']

const FORMAT_LABEL: Record<Format, string> = { carousel: 'Post', reel: 'Reel', story: 'Story' }

/** One line of the phone's list: what it is, its answer so far, and a chevron into its sheet. */
function Row({
  label,
  value,
  dot = false,
  onClick,
}: {
  label: React.ReactNode
  value: React.ReactNode
  /** The row still needs an answer before the post can go. */
  dot?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[54px] w-full items-center gap-3 border-b border-(--cal-line) py-2 text-left"
    >
      <span className="shrink-0 text-[15px]">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[14px] text-ink-3">
        {dot && <span className="size-1.5 shrink-0 rounded-full bg-ink" />}
        <span className="truncate">{value}</span>
      </span>
      <span className="-rotate-90 text-ink-4">
        <ChevronIcon size={11} />
      </span>
    </button>
  )
}

/** A desktop's modal: a card in the middle of the page. Escape or a click outside closes it. */
function Dialog({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string
  onClose: () => void
  /** Room for a grid of photos. */
  wide?: boolean
  children: React.ReactNode
}) {
  const card = React.useRef<HTMLDivElement>(null)
  const close = React.useEffectEvent(onClose)
  React.useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    // Focus goes into the dialog, and back to the control that opened it when it closes.
    const opener = document.activeElement as HTMLElement | null
    card.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bb-fade absolute inset-0 bg-ink/30"
      />
      <div
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bb-rise relative max-h-[calc(100svh-48px)] max-w-full overflow-y-auto rounded-[18px] bg-page p-5 shadow-sheet outline-none ${wide ? 'w-[560px]' : 'w-[460px]'}`}
      >
        {children}
      </div>
    </div>
  )
}

const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Failed',
}

// ── Accounts and format ──────────────────────────────────────────────────────────────────────

/** The brand's accounts on the platforms it uses, ticked together, and the format they all take. */
function Accounts({ api }: { api: PublishDraftApi }) {
  const { brand } = useBrand()
  const { draft, update, toggleChannel, connect } = api
  return (
    <section aria-label="Accounts" className={CARD}>
      <span className={`${EYEBROW} max-md:hidden`}>Post to</span>
      {/* Pills on a desktop, the format beside them; on a phone a list, one account a row, the
          tick at the right, and the format under it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 max-md:flex-col max-md:items-stretch max-md:gap-5">
        <div className="flex flex-wrap gap-2 max-md:flex-col max-md:gap-0">
          {linkedChannels(draft).map((c) => {
            const connected = draft.connected.includes(c.key)
            const takes = kindOn(draft.format, c.key)
            const on = connected && takes !== null && draft.selected.includes(c.key)
            if (!connected) {
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => connect(c.key)}
                  className="flex h-10 items-center gap-2.5 rounded-full px-4 text-[13px] text-ink-3 shadow-[inset_0_0_0_1px_var(--cal-ghost)] transition-colors hover:text-ink max-md:h-14 max-md:rounded-none max-md:border-b max-md:border-(--cal-line) max-md:px-0 max-md:text-[15px] max-md:shadow-none"
                >
                  <PlatformLogo platform={c.key} size={14} />
                  {c.name}
                  <span className="text-[11.5px] font-medium text-fail-ink max-md:ml-auto max-md:text-[14px]">
                    Reconnect
                  </span>
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
                title={
                  takes === null
                    ? `${c.name} has no ${draft.format}s`
                    : handleOn(brand.handle, brand.name, c.key)
                }
                onClick={() => takes !== null && toggleChannel(c.key)}
                className={`flex h-10 items-center gap-2.5 rounded-full pr-4 pl-3 text-[13px] transition-colors max-md:h-14 max-md:rounded-none max-md:border-b max-md:border-(--cal-line) max-md:bg-transparent max-md:px-0 max-md:text-[15px] ${takes === null ? 'cursor-not-allowed text-ink-5' : on ? 'bg-ink text-page max-md:text-ink' : 'bg-surface text-ink-2 hover:bg-paper hover:text-ink max-md:text-ink'}`}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full max-md:order-last max-md:ml-auto max-md:size-6 ${on ? 'bg-page text-ink max-md:bg-ink max-md:text-page' : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]'}`}
                >
                  {on && <CheckIcon size={8} strokeWidth={2.4} />}
                </span>
                <PlatformLogo platform={c.key} size={14} />
                <span className="font-medium">{c.name}</span>
              </button>
            )
          })}
          {linkedChannels(draft).length === 0 &&
            (remote ? (
              // On the core no publishing account can connect yet: say so, calmly, in place.
              <span className="flex h-10 items-center gap-3 max-md:h-14">
                <span className="flex items-center gap-2 text-ink-4">
                  {UNSET.map((k) => (
                    <PlatformLogo key={k} platform={k} size={14} />
                  ))}
                </span>
                <NotAvailable name={namesOf(UNSET)} align="left" />
              </span>
            ) : (
              <Link
                href="/brand/connections"
                className="flex h-10 items-center text-[13px] text-ink-3 underline decoration-ink-5 underline-offset-4 transition-colors hover:text-ink max-md:h-14 max-md:text-[15px]"
              >
                Connect an account
              </Link>
            ))}
        </div>
        <div className={`w-[240px] max-md:w-full ${TAP}`}>
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
  onFiles,
  library,
  ideas,
  onIdea,
}: {
  api: PublishDraftApi
  media: Shot[]
  setMedia: (m: Shot[]) => void
  onFiles: (files: FileList | null) => Promise<void>
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
  // The photo being cropped and its crop so far; the photo keeps it only on Done.
  const [editing, setEditing] = React.useState<{ index: number; crop: Crop } | null>(null)
  const phone = usePhone()
  const edited = editing ? media[editing.index] : undefined
  const [driveOpen, setDriveOpen] = React.useState(false)
  const { brand } = useBrand()
  // A brand whose Drive is not linked yet signs in to it first, then the picker opens.
  const driveLinked = useConnected(brand.id, 'drive')
  const [linkingDrive, setLinkingDrive] = React.useState(false)
  const ratios = useRatios(media)

  /**
   * A first crop needs the photo's shape, so the editor waits for it to load. The wrong-shape fix
   * opens it on the shape the format takes.
   */
  async function openCrop(index: number, aspect?: Aspect) {
    const shot = media[index]!
    const crop = shot.crop ?? defaultCrop(await ratioOf(shot.src))
    setEditing({ index, crop: aspect ? { ...crop, aspect } : crop })
  }
  /** The shape this photo needs for the format, or `null` when it fits or is not measured yet. */
  function fixFor(shot: Shot): Aspect | null {
    const ratio = shot.crop ? frameRatio(shot.crop) : ratios[shot.src]
    return ratio === undefined || isVideo(shot.src) ? null : shapeFix(ratio, draft.format)
  }
  function keepCrop() {
    if (!editing) return
    setMedia(
      media.map((m, i) =>
        i === editing.index ? { ...m, crop: isUncut(editing.crop) ? null : editing.crop } : m,
      ),
    )
    setEditing(null)
  }

  React.useEffect(
    () => () => {
      if (writer.current !== null) window.clearTimeout(writer.current)
    },
    [],
  )

  // A brand outside the demo's data has no prepared captions or hashtags.
  const drafts = demoOf(CAPTION_DRAFTS, brand.id) ?? []
  // A caption the marketer wrote is improved, not replaced; an empty box or a draft gets a draft.
  const typed = draft.caption.trim() !== '' && !drafts.includes(draft.caption)
  const improved = typed ? improveCaption(draft.caption, demoOf(HASHTAGS, brand.id) ?? []) : null
  const aiLabel = writing
    ? 'Writing…'
    : !typed
      ? draft.caption
        ? 'Try another'
        : 'Draft with AI'
      : improved !== draft.caption
        ? 'Improve'
        : 'Looks good'

  /**
   * The demo has no model: a prepared caption, or the marketer's own one cleaned, types itself
   * in, by grapheme.
   */
  function writeWithAI() {
    if (writing || aiLabel === 'Looks good' || (!improved && drafts.length === 0)) return
    const target = improved ?? drafts[drafted % drafts.length]!
    if (!improved) setDrafted((n) => n + 1)
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
  const mention = useMention({
    value,
    onChange: edit,
    people: peopleOf(brand.id, 'caption'),
    hashtags: hashtagsOf(brand.id),
  })

  const own = (k: ChannelKey) =>
    k === 'yt' ? draft.youtubeTitle !== null : draft.overrides[k] !== undefined
  // The shown tab has its own text: one tap drops it for the shared caption.
  const shared = shownTab !== 'all' && own(shownTab)
  const useShared = () =>
    shownTab === 'yt'
      ? update({ youtubeTitle: null })
      : update({
          overrides: Object.fromEntries(
            Object.entries(draft.overrides).filter(([k]) => k !== shownTab),
          ),
        })

  return (
    <section aria-label="Content" className={CARD}>
      {/* With no media there is nothing to post yet, so an idea is still on offer, caption or not:
          an idea fills the caption, and its photo's X must not take the ideas away with it. */}
      {ideas.length > 0 && media.length === 0 && (
        <div className="flex flex-col gap-2">
          <span className={EYEBROW}>Start from an idea</span>
          <div className={`flex flex-wrap gap-1.5 ${STRIP}`}>
            {ideas.slice(0, 4).map((idea) => (
              <button
                key={idea.hook}
                type="button"
                onClick={() => {
                  update({ caption: idea.hook, format: idea.format })
                  onIdea(idea.hook)
                  setMedia(library.slice(0, 1).map(shotOf))
                }}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] text-ink-2 transition-colors hover:bg-paper hover:text-ink max-md:h-10 max-md:text-[13.5px]"
              >
                <SparkIcon size={9} />
                {idea.hook}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div
          className={`flex flex-wrap gap-2 ${STRIP}`}
          onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void onFiles(e.dataTransfer.files)
          }}
        >
          {media.map((shot, i) => {
            const fix = fixFor(shot)
            return (
              <span
                key={shot.src + i}
                className="group/m relative block h-[132px] w-[106px] shrink-0 overflow-hidden rounded-[12px] bg-tile"
              >
                <ShotView shot={shot} sizes="260px" />
                {/* A number orders slides: one tile has no order to show. */}
                {media.length > 1 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-1.5 font-mono text-[10px] text-page">
                    {i + 1}
                  </span>
                )}
                {/* The wrong shape for this format: said quietly, fixed in one tap. */}
                {fix ? (
                  <button
                    type="button"
                    aria-label={`Wrong shape for a ${FORMAT_LABEL[draft.format].toLowerCase()}: crop to ${fix}`}
                    onClick={() => void openCrop(i, fix)}
                    className="absolute right-1.5 bottom-1.5 flex h-6 items-center gap-1 rounded-full bg-page pr-2 pl-1.5 text-[10.5px] font-medium text-ink shadow-soft transition-transform hover:-translate-y-px max-md:h-8 max-md:pr-2.5 max-md:pl-2 max-md:text-[11.5px]"
                  >
                    <span className="size-1.5 rounded-full bg-(--fail)" />
                    Crop {fix}
                  </button>
                ) : (
                  !isVideo(shot.src) && (
                    <button
                      type="button"
                      aria-label="Crop"
                      onClick={() => void openCrop(i)}
                      className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-page text-ink-2 opacity-0 shadow-soft transition-opacity group-hover/m:opacity-100 max-md:size-8 [@media(hover:none)]:opacity-100"
                    >
                      <CropIcon />
                    </button>
                  )
                )}
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
                      className="flex size-6 items-center justify-center rounded-full bg-page text-[11px] text-ink-2 shadow-soft max-md:size-8"
                    >
                      ←
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => setMedia(media.filter((_, j) => j !== i))}
                    className="flex size-6 items-center justify-center rounded-full bg-page text-ink-2 shadow-soft max-md:size-8"
                  >
                    <CloseIcon />
                  </button>
                </span>
              </span>
            )
          })}
          {media.length < max && (
            // What the format takes is on the tile's tooltip, not printed over the card.
            <span
              title={MEDIA_RULE[draft.format]}
              className="flex h-[132px] w-[106px] shrink-0 flex-col overflow-hidden rounded-[12px] border border-dashed border-(--cal-ghost) text-[11.5px] text-ink-3"
            >
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
                onClick={() => (driveLinked ? setDriveOpen(true) : setLinkingDrive(true))}
                className="flex items-center justify-center gap-1.5 border-t border-dashed border-(--cal-ghost) py-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <DriveGlyph />
                Google Drive
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
          <MediaInput ref={input} format={draft.format} onFiles={onFiles} />
        </div>
        <Fold open={libraryOpen}>
          <div className={`flex gap-2 pt-1 ${STRIP}`}>
            {library.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => {
                  setMedia([...media, shotOf(src)].slice(-max))
                  setLibraryOpen(false)
                }}
                className="relative block h-[72px] w-[58px] shrink-0 overflow-hidden rounded-[8px] bg-tile transition-transform hover:-translate-y-0.5"
              >
                <Media src={src} sizes="140px" />
                {isVideo(src) && <TypeBadge format="reel" slides={1} />}
              </button>
            ))}
          </div>
        </Fold>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className={`${EYEBROW} md:hidden`}>Caption</span>
          <div
            role="tablist"
            aria-label="Caption for"
            className="flex flex-wrap items-center gap-1 max-md:hidden"
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
            onClick={writeWithAI}
            disabled={writing || aiLabel === 'Looks good'}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-60 max-md:h-10 max-md:bg-transparent max-md:px-0 max-md:text-[13.5px]"
          >
            {aiLabel === 'Looks good' ? <CheckIcon size={9} /> : <SparkIcon size={10} />}
            {aiLabel}
          </button>
        </div>
        <textarea
          {...mention.field}
          rows={shownTab === 'yt' ? 2 : 5}
          placeholder={
            shownTab === 'all' ? 'Write a caption…' : `What ${NAME[shownTab]} shows instead`
          }
          aria-label={shownTab === 'all' ? 'Caption' : `${NAME[shownTab]} text`}
          className="w-full resize-none rounded-[12px] bg-surface-2 p-4 text-[14.5px] leading-[1.5] outline-none placeholder:text-ink-5 focus:bg-surface max-md:min-h-[96px] max-md:rounded-none max-md:bg-transparent max-md:px-0 max-md:py-1 max-md:field-sizing-content max-md:focus:bg-transparent"
        />
        {mention.list}
        {/* On a phone one row does both: each account's count is also the tab that edits it. */}
        <div
          role="tablist"
          aria-label="Caption for"
          className={`flex items-center gap-1.5 md:hidden ${STRIP}`}
        >
          {[{ key: 'all' as const, name: 'All' }, ...active].map((c) => {
            const on = c.key === shownTab
            const { used, max: limit } =
              c.key === 'all' ? { used: 0, max: 0 } : lengthFor(draft, c.key)
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(c.key)}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors ${on ? 'bg-ink text-page' : 'bg-surface text-ink-3'}`}
              >
                {c.key === 'all' ? (
                  c.name
                ) : (
                  <>
                    <PlatformLogo platform={c.key} size={11} />
                    <span
                      className={`font-mono text-[11px] tabular-nums ${used > limit ? 'text-fail-ink' : ''}`}
                    >
                      {used}/{limit.toLocaleString('en')}
                    </span>
                    {own(c.key) && (
                      <span className={`size-1.5 rounded-full ${on ? 'bg-page' : 'bg-ink'}`} />
                    )}
                  </>
                )}
              </button>
            )
          })}
        </div>
        {shared && (
          <button
            type="button"
            onClick={useShared}
            className="h-10 self-start text-[13px] text-ink-3 md:hidden"
          >
            Use the shared text
          </button>
        )}
        {/* Each account's count against its limit, once there is something to count. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 empty:hidden max-md:hidden">
          {active.map((c) => {
            const { used, max: limit } = lengthFor(draft, c.key)
            if (used === 0) return null
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
          {shared && (
            <button
              type="button"
              onClick={useShared}
              className="ml-auto text-[12px] text-ink-3 hover:text-ink"
            >
              Use the shared text
            </button>
          )}
        </div>
      </div>

      {linkingDrive && (
        <ConnectSheet
          source="drive"
          onClose={() => setLinkingDrive(false)}
          onConnected={() => {
            setLinkingDrive(false)
            setDriveOpen(true)
          }}
        />
      )}
      {driveOpen && (
        <DrivePicker
          phone={phone}
          room={max - media.length}
          onClose={() => setDriveOpen(false)}
          onPick={(srcs) => {
            setMedia([...media, ...srcs.map(shotOf)].slice(-max))
            setDriveOpen(false)
          }}
        />
      )}
      {/* The crop opens over the page: a sheet on a phone, where Done is in its header; a dialog
          on a desktop, with Done beside Cancel. Reset puts the whole photo back, centred. */}
      {editing && edited && (
        <CropOverlay
          phone={phone}
          onKeep={keepCrop}
          onCancel={() => setEditing(null)}
          onReset={() => setEditing({ ...editing, crop: defaultCrop(editing.crop.ratio) })}
        >
          <CropEditor
            src={edited.src}
            crop={editing.crop}
            onChange={(crop) => setEditing({ ...editing, crop })}
          />
        </CropOverlay>
      )}
    </section>
  )
}

/** The file picker behind Upload and behind the preview's empty state; one file for a reel. */
function MediaInput({
  ref,
  format,
  onFiles,
}: {
  ref: React.Ref<HTMLInputElement>
  format: Format
  onFiles: (files: FileList | null) => Promise<void>
}) {
  return (
    <input
      ref={ref}
      type="file"
      hidden
      multiple={MEDIA_MAX[format] > 1}
      accept={format === 'reel' ? 'video/*,image/*' : 'image/*,video/*'}
      onChange={(e) => {
        void onFiles(e.target.files)
        e.target.value = ''
      }}
    />
  )
}

const QUIET =
  'h-10 rounded-full px-4 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink'

function CropOverlay({
  phone,
  onKeep,
  onCancel,
  onReset,
  children,
}: {
  phone: boolean
  onKeep: () => void
  onCancel: () => void
  onReset: () => void
  children: React.ReactNode
}) {
  const reset = (
    <button type="button" onClick={onReset} className={`${QUIET} -ml-4`}>
      Reset
    </button>
  )
  const cancel = (
    <button type="button" onClick={onCancel} className={QUIET}>
      Cancel
    </button>
  )
  if (phone) {
    return (
      <Sheet title="Crop" onClose={onCancel} onDone={onKeep}>
        {children}
        <div className="flex items-center justify-between pt-3">
          {reset}
          {cancel}
        </div>
      </Sheet>
    )
  }
  return (
    <Dialog title="Crop" onClose={onCancel}>
      {children}
      <div className="flex items-center justify-between pt-4">
        {reset}
        <div className="flex items-center gap-1">
          {cancel}
          <button
            type="button"
            onClick={onKeep}
            className="bb-press h-10 rounded-full bg-ink px-5 text-[13px] font-medium text-page"
          >
            Done
          </button>
        </div>
      </div>
    </Dialog>
  )
}

/** Each photo's own shape, width over height, once it has loaded; a video is never measured. */
function useRatios(media: Shot[]): Record<string, number> {
  const [ratios, setRatios] = React.useState<Record<string, number>>({})
  React.useEffect(() => {
    let live = true
    for (const { src } of media) {
      if (isVideo(src)) continue
      // A photo already measured comes back from the browser's cache at once.
      void ratioOf(src).then((r) => live && setRatios((o) => (src in o ? o : { ...o, [src]: r })))
    }
    return () => {
      live = false
    }
  }, [media])
  return ratios
}

// ── Details ──────────────────────────────────────────────────────────────────────────────────

interface DetailState {
  comment: string
  location: string
  collab: string[]
  aiLabel: boolean
}

/** Every account tagged in the post, once each, in the order the photos come. */
function taggedIn(media: Shot[]): string[] {
  return [...new Set(media.flatMap((m) => m.tags.map((t) => t.handle)))]
}

/**
 * The extras Brandwatch shows as buttons under the caption. Each appears only when an account
 * that uses it is ticked, and says which accounts get it.
 *
 * Tag people and Collaborators look alike and are not: a tag names an account on the photo; a
 * collaborator is invited, accepts in their own Instagram, and the post then shows on both
 * profiles under both names. Each row says its half of that in one line.
 */
function Details({
  api,
  details,
  setDetails,
  labels,
  setLabels,
  media,
  setMedia,
}: {
  api: PublishDraftApi
  details: DetailState
  setDetails: (d: DetailState) => void
  labels: string[]
  setLabels: (l: string[]) => void
  media: Shot[]
  setMedia: (m: Shot[]) => void
}) {
  const phone = usePhone()
  const { brand } = useBrand()
  const [tagging, setTagging] = React.useState(false)
  const comment = useMention({
    value: details.comment,
    onChange: (text) => setDetails({ ...details, comment: text }),
    people: peopleOf(brand.id, 'caption'),
    hashtags: hashtagsOf(brand.id),
  })
  const active = activeChannels(api.draft).map((c) => c.key)
  const for_ = (keys: ChannelKey[]) => keys.filter((k) => active.includes(k))
  const story = api.draft.format === 'story'
  // A feed photo takes a tag at a spot; a reel, or a post that is one video, takes names only.
  const spot = api.draft.format === 'carousel' && media.some((m) => !isVideo(m.src))
  const tagged = taggedIn(media)
  const rows: Array<{ key: keyof typeof DETAIL_ON; label: string; to: ChannelKey[] }> = [
    { key: 'location', label: 'Location', to: for_(DETAIL_ON.location) },
    { key: 'comment', label: 'First comment', to: story ? [] : for_(DETAIL_ON.comment) },
    { key: 'tags', label: 'Tag people', to: story ? [] : for_(DETAIL_ON.tags) },
    { key: 'collab', label: 'Collaborators', to: story ? [] : for_(DETAIL_ON.collab) },
  ]

  /** Drops an account's tag from every photo. */
  function untag(handle: string) {
    setMedia(media.map((m) => ({ ...m, tags: m.tags.filter((t) => t.handle !== handle) })))
  }

  const control: Record<keyof typeof DETAIL_ON, React.ReactNode> = {
    location: (
      <Combobox
        value={details.location}
        onChange={(location) => setDetails({ ...details, location })}
        options={placesOf(brand.id)}
        onPick={(location) => setDetails({ ...details, location })}
        aria-label="Location"
        className="h-9 rounded-[10px] bg-surface-2 px-3 text-[13.5px] outline-none focus:bg-surface max-md:h-11"
      />
    ),
    comment: (
      <>
        <textarea
          {...comment.field}
          rows={2}
          placeholder="Booking link, hashtags…"
          aria-label="First comment"
          className="resize-none rounded-[10px] bg-surface-2 px-3 py-2 text-[13.5px] outline-none placeholder:text-ink-5 focus:bg-surface"
        />
        {comment.list}
      </>
    ),
    tags: spot ? (
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 max-md:min-h-11">
        {tagged.map((h) => (
          <Chip key={h} value={h} onRemove={() => untag(h)} />
        ))}
        <button
          type="button"
          onClick={() => setTagging(true)}
          className="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink max-md:h-10 max-md:text-[13.5px]"
        >
          <PersonGlyph />
          {tagged.length > 0 ? 'Edit tags' : 'Tag on the photo'}
        </button>
      </div>
    ) : media.length > 0 ? (
      <Chips
        values={media[0]!.tags.map((t) => t.handle)}
        onChange={(handles) =>
          setMedia([
            { ...media[0]!, tags: handles.map((handle) => ({ handle, at: null })) },
            ...media.slice(1),
          ])
        }
        placeholder="@account"
        max={TAG_MAX}
        normalize={handleOf}
        options={peopleOf(brand.id, 'tag')}
      />
    ) : (
      <span className="flex h-9 items-center text-[13px] text-ink-4 max-md:h-auto">
        Add the photo or video first.
      </span>
    ),
    collab: (
      <Chips
        values={details.collab}
        onChange={(collab) => setDetails({ ...details, collab })}
        placeholder={`@account, up to ${COLLAB_MAX}`}
        max={COLLAB_MAX}
        normalize={handleOf}
        options={peopleOf(brand.id, 'collab')}
      />
    ),
  }
  return (
    <section aria-label="Details" className={CARD}>
      <span className={`${EYEBROW} max-md:hidden`}>Details</span>
      {/* Label beside the field on a desktop; above it on a phone. */}
      <div className="flex flex-col">
        {rows
          .filter((r) => r.to.length > 0)
          .map((r) => (
            <div
              key={r.key}
              className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3 border-b border-(--cal-line) py-3 first:pt-0 max-md:grid-cols-1 max-md:gap-1.5 max-md:py-4"
            >
              <span className="pt-1.5 text-[13px] max-md:pt-0 max-md:text-[14px]">{r.label}</span>
              <div className="flex min-w-0 flex-col gap-1.5">{control[r.key]}</div>
            </div>
          ))}
        <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3 border-b border-(--cal-line) py-3 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:py-4">
          <span className="text-[13px] max-md:text-[14px]">AI-generated label</span>
          <span className="flex max-md:justify-end">
            <Switch
              label="AI-generated label"
              checked={details.aiLabel}
              onChange={(aiLabel) => setDetails({ ...details, aiLabel })}
            />
          </span>
        </div>
        <div className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3 pt-3 max-md:grid-cols-1 max-md:gap-1.5 max-md:pt-4">
          <span className="pt-1.5 text-[13px] max-md:pt-0 max-md:text-[14px]">Labels</span>
          <Chips
            values={labels}
            onChange={setLabels}
            placeholder={remote ? '' : 'e.g. TMP_Wine, F1 weekend'}
            options={labelsOf(brand.id)}
          />
        </div>
      </div>
      {tagging && (
        <TagEditor
          phone={phone}
          media={media}
          setMedia={setMedia}
          onClose={() => setTagging(false)}
        />
      )}
    </section>
  )
}

function PersonGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/**
 * Tags placed on the photos: a tap on a spot asks for the account there, and a tag's cross takes
 * it off. The photo shows in a feed post's 4:5, as Instagram does, so a tag sits where it will.
 * Each change is kept at once; Done only closes.
 */
function TagEditor({
  phone,
  media,
  setMedia,
  onClose,
}: {
  phone: boolean
  media: Shot[]
  setMedia: (m: Shot[]) => void
  onClose: () => void
}) {
  const photos = media.flatMap((m, i) => (isVideo(m.src) ? [] : [i]))
  const [index, setIndex] = React.useState(photos[0]!)
  const [pending, setPending] = React.useState<{ x: number; y: number } | null>(null)
  const [typed, setTyped] = React.useState('')
  const form = React.useRef<HTMLFormElement>(null)
  const people = peopleOf(useBrand().brand.id, 'tag')
  const shot = media[index]!
  // The account box takes the typing as soon as it opens at the tapped spot.
  React.useEffect(() => {
    if (pending) form.current?.querySelector('input')?.focus()
  }, [pending])
  const full = shot.tags.length >= TAG_MAX

  function place(e: React.PointerEvent<HTMLDivElement>) {
    if (full) return
    const r = e.currentTarget.getBoundingClientRect()
    setPending({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
    setTyped('')
  }
  function keep(handle = handleOf(typed)) {
    if (!pending || !handle) return
    const tags = [...shot.tags.filter((t) => t.handle !== handle), { handle, at: pending }]
    setMedia(media.map((m, i) => (i === index ? { ...m, tags } : m)))
    setPending(null)
  }
  function untag(handle: string) {
    const tags = shot.tags.filter((t) => t.handle !== handle)
    setMedia(media.map((m, i) => (i === index ? { ...m, tags } : m)))
  }
  // A label near an edge would run off the photo: it is held inside it.
  const anchor = (x: number) => `${Math.min(80, Math.max(20, x * 100))}%`

  const body = (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label="The photo: tap where someone is to tag them"
        onPointerUp={place}
        className={`relative mx-auto aspect-[4/5] w-full max-w-[340px] overflow-hidden rounded-[12px] bg-tile select-none ${full ? '' : 'cursor-crosshair'}`}
      >
        <ShotView shot={shot} sizes="680px" />
        {shot.tags.map(
          (t) =>
            t.at && (
              <span
                key={t.handle}
                onPointerUp={(e) => e.stopPropagation()}
                className="absolute flex -translate-x-1/2 flex-col items-center"
                style={{ left: anchor(t.at.x), top: `${t.at.y * 100}%` }}
              >
                <span className="size-0 border-x-[5px] border-b-[5px] border-x-transparent border-b-black/80" />
                <span className="flex h-7 items-center gap-1 rounded-[7px] bg-black/80 pr-1 pl-2.5 text-[12px] font-medium text-white">
                  {t.handle.slice(1)}
                  <button
                    type="button"
                    aria-label={`Remove the tag ${t.handle}`}
                    onClick={() => untag(t.handle)}
                    className="flex size-5 items-center justify-center rounded-full text-white/70 hover:text-white"
                  >
                    <CloseIcon />
                  </button>
                </span>
              </span>
            ),
        )}
        {pending && (
          <span
            onPointerUp={(e) => e.stopPropagation()}
            className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: anchor(pending.x), top: `${pending.y * 100}%` }}
          >
            <span className="size-0 border-x-[5px] border-b-[5px] border-x-transparent border-b-page" />
            <form
              ref={form}
              onSubmit={(e) => {
                e.preventDefault()
                keep()
              }}
              className="flex h-9 items-center gap-1 rounded-[9px] bg-page pr-1 pl-2.5 shadow-pop"
            >
              <Combobox
                value={typed}
                onChange={setTyped}
                options={people.filter((o) => !shot.tags.some((t) => t.handle === o.value))}
                create={handleOf}
                anchor={form}
                onPick={(handle) => keep(handle)}
                placeholder="@account"
                aria-label="Account to tag"
                className="w-[120px] bg-transparent text-[13px] outline-none placeholder:text-ink-5"
              />
              <button
                type="submit"
                className="h-7 rounded-[7px] bg-ink px-2.5 text-[12px] font-medium text-page"
              >
                Tag
              </button>
            </form>
          </span>
        )}
      </div>
      <p className="text-center text-[12.5px] text-ink-3">
        {full
          ? `${TAG_MAX} tags is the most a photo takes.`
          : 'Tap the photo where someone is to tag them.'}
      </p>
      {photos.length > 1 && (
        <div className={`flex justify-center gap-1.5 ${STRIP}`}>
          {photos.map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`Photo ${i + 1}`}
              aria-pressed={i === index}
              onClick={() => {
                setIndex(i)
                setPending(null)
              }}
              className={`relative block h-[60px] w-[48px] shrink-0 overflow-hidden rounded-[8px] bg-tile transition-shadow ${i === index ? 'shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]' : 'opacity-70'}`}
            >
              <ShotView shot={media[i]!} sizes="120px" />
              {media[i]!.tags.length > 0 && (
                <span className="absolute right-1 bottom-1 rounded-full bg-black/60 px-1 font-mono text-[9.5px] text-white">
                  {media[i]!.tags.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
  if (phone) {
    return (
      <Sheet title="Tag people" onClose={onClose}>
        {body}
      </Sheet>
    )
  }
  return (
    <Dialog title="Tag people" onClose={onClose}>
      {body}
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={onClose}
          className="bb-press h-10 rounded-full bg-ink px-5 text-[13px] font-medium text-page"
        >
          Done
        </button>
      </div>
    </Dialog>
  )
}

function Chip({ value, onRemove }: { value: string; onRemove: () => void }) {
  return (
    <span className="flex h-6 items-center gap-1 rounded-full bg-page px-2 text-[12px] shadow-soft max-md:h-8 max-md:px-2.5 max-md:text-[13px]">
      {value}
      <button
        type="button"
        aria-label={`Remove ${value}`}
        onClick={onRemove}
        className="text-ink-4 hover:text-ink"
      >
        <CloseIcon />
      </button>
    </span>
  )
}

/**
 * Values as chips; type and pick one of the brand's `options`, or press Enter to add what was
 * typed. `normalize` spells a value as it is kept.
 */
function Chips({
  values,
  onChange,
  placeholder,
  max,
  normalize = (v) => v.trim(),
  options,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  max?: number
  normalize?: (typed: string) => string
  options: Suggestion[]
}) {
  const [draft, setDraft] = React.useState('')
  const box = React.useRef<HTMLDivElement>(null)
  return (
    <div
      ref={box}
      className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-[10px] bg-surface-2 px-2 py-1.5 focus-within:bg-surface max-md:min-h-11"
    >
      {values.map((v) => (
        <Chip key={v} value={v} onRemove={() => onChange(values.filter((x) => x !== v))} />
      ))}
      {(max === undefined || values.length < max) && (
        <Combobox
          value={draft}
          onChange={setDraft}
          options={options.filter((o) => !values.includes(o.value))}
          create={normalize}
          anchor={box}
          onPick={(value) => {
            if (!values.includes(value)) onChange([...values, value])
            setDraft('')
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
  ttSound: Sound
}

/** Each ticked account's settings in a line, and whether it still needs an answer. */
function summaryOf(
  draft: Draft,
  extra: Extra,
): Record<ChannelKey, { text: string; needs: boolean }> {
  return {
    tt: {
      text: !draft.privacy
        ? 'Who can watch?'
        : extra.ttSound === 'library'
          ? `${draft.privacy} · sound added in TikTok`
          : `${draft.privacy} · interactions ${Object.values(draft.interactions).some(Boolean) ? 'on' : 'off'}`,
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
}

/**
 * What one platform alone needs, a row per ticked account; a row that needs an answer says so.
 * With `only`, one account's settings alone, open: the phone shows each account in its own sheet.
 */
function PerAccount({
  api,
  extra,
  setExtra,
  only,
}: {
  api: PublishDraftApi
  extra: Extra
  setExtra: (e: Extra) => void
  only?: ChannelKey
}) {
  const { draft } = api
  const active = activeChannels(draft).filter((c) => !only || c.key === only)
  const [open, setOpen] = React.useState<ChannelKey | null>(
    active.some((c) => c.key === 'tt') && draft.privacy === null ? 'tt' : null,
  )
  const summary = summaryOf(draft, extra)

  return (
    <section aria-label="Per account" className={CARD}>
      {!only && <span className={EYEBROW}>Per account</span>}
      <div className="flex flex-col">
        {active.map((c) => {
          const s = summary[c.key]
          const on = only === c.key || open === c.key
          return (
            <div key={c.key} className="border-b border-(--cal-line) last:border-b-0">
              {!only && (
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
              )}
              <Fold open={on}>
                <div className={only ? 'pb-1' : 'pb-4 pl-[26px]'}>
                  {c.key === 'tt' ? (
                    <TikTokRows api={api} extra={extra} setExtra={setExtra} />
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
        <div
          key={r.label}
          className="flex min-h-10 items-center justify-between gap-4 max-md:min-h-12"
        >
          <span className="text-[13px] text-ink-2 max-md:text-[14px]">{r.label}</span>
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
          className={`h-7 rounded-full px-3 text-[12px] font-medium transition-colors max-md:h-9 max-md:text-[13px] ${o === value ? 'bg-page text-ink shadow-soft' : 'text-ink-3 hover:text-ink'}`}
        >
          {o}
        </button>
      ))}
    </span>
  )
}

/**
 * TikTok's own questions: who can watch starts on Everyone, then the sound, the interactions and
 * whether the video is commercial content; the consent line sits under them. Changed answers can
 * be kept as the brand's start for its next posts, so nobody has to check them every time.
 */
function TikTokRows({
  api,
  extra,
  setExtra,
}: {
  api: PublishDraftApi
  extra: Extra
  setExtra: (e: Extra) => void
}) {
  const { draft, update } = api
  const { brand } = useBrand()
  const current: TikTokDefault = { ...tiktokSettings(draft), sound: extra.ttSound }
  // What a new post starts on: the brand's saved answers, or the model's own.
  const [start, setStart] = React.useState<TikTokDefault>(
    () =>
      tiktokDefault(brand.id) ?? {
        ...tiktokSettings(initialDraft({ format: draft.format, hook: '', caption: '' })),
        sound: 'own',
      },
  )
  const asStart = JSON.stringify(current) === JSON.stringify(start)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 max-md:min-h-12">
        <span className="flex items-center gap-2 text-[13px] text-ink-2 max-md:text-[14px]">
          {draft.privacy === null && <span className="size-1.5 rounded-full bg-ink" />}
          Who can watch
        </span>
        <div className={`max-md:w-full ${TAP}`}>
          <Segmented
            label="Who can watch on TikTok"
            pill
            options={PRIVACY.map((p) => ({ value: p, label: p }))}
            value={draft.privacy}
            onChange={(privacy) => update({ privacy })}
          />
        </div>
      </div>
      <div className="flex min-h-10 items-center justify-between gap-3 max-md:min-h-12">
        <span className="text-[13px] text-ink-2 max-md:text-[14px]">Sound</span>
        <Choice
          value={extra.ttSound === 'own' ? 'In the video' : 'From TikTok'}
          options={['In the video', 'From TikTok']}
          onChange={(v) =>
            setExtra({ ...extra, ttSound: v === 'In the video' ? 'own' : 'library' })
          }
        />
      </div>
      {extra.ttSound === 'library' && (
        <p className="-mt-1 text-[12px] leading-[1.45] text-ink-4">
          At the time, the video lands in the TikTok inbox: pick a song from the library there and
          post.
        </p>
      )}
      {(
        [
          ['comments', 'Allow comments'],
          ['duet', 'Allow Duet'],
          ['stitch', 'Allow Stitch'],
        ] as const
      ).map(([key, label]) => (
        <div key={key} className="flex min-h-9 items-center justify-between gap-3 max-md:min-h-12">
          <span className="text-[13px] text-ink-2 max-md:text-[14px]">{label}</span>
          <Switch
            label={label}
            checked={draft.interactions[key]}
            onChange={(v) => update({ interactions: { ...draft.interactions, [key]: v } })}
          />
        </div>
      ))}
      <div className="flex min-h-9 items-center justify-between gap-3 max-md:min-h-12">
        <span className="text-[13px] text-ink-2 max-md:text-[14px]">Commercial content</span>
        <Switch
          label="Commercial content"
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
              className={`h-8 rounded-full px-3.5 text-[12.5px] font-medium max-md:h-10 ${draft.promo[key] ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Fold>
      <p className="text-[12px] leading-[1.45] text-ink-4">{tiktokConsent(draft)}</p>
      {!asStart ? (
        <button
          type="button"
          onClick={() => {
            saveTikTokDefault(brand.id, current)
            setStart(current)
          }}
          className="h-8 self-start text-[12.5px] font-medium text-ink-3 underline-offset-2 transition-colors hover:text-ink hover:underline max-md:h-10 max-md:text-[13.5px]"
        >
          Save as {brand.name} default
        </button>
      ) : (
        tiktokDefault(brand.id) && (
          <span className="flex h-8 items-center gap-1.5 text-[12.5px] text-ink-4 max-md:h-10 max-md:text-[13.5px]">
            <CheckIcon size={9} />
            {brand.name} default
          </span>
        )
      )}
    </div>
  )
}

// ── When ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Now, or a day and a time. The answer leads, in one line, with the brand's best time beside it
 * to take in one click; under it a month of the calendar picks the day, and the day's hours, scored
 * from Insights as bars like Brandwatch's, pick the hour. Any time at all is typed over the time
 * in the answer line.
 */
function WhenCard({
  when,
  setWhen,
  date,
  setDate,
  time,
  setTime,
}: {
  when: WhenChoice
  setWhen: (w: WhenChoice) => void
  date: string
  setDate: (d: string) => void
  time: string
  setTime: (t: string) => void
}) {
  const { brand, weeks } = useBrand()
  const best = bestTimes(brand.id, weeks)[0]
  const onBest = best !== undefined && best.date === date && best.time === time
  const pages = useMonthPages(weeks, date)
  const { setPage, reveal } = pages
  // A day picked elsewhere (the best time) turns to its month; only a new day does, so a page
  // turned by hand stays put when the calendar reloads.
  const [shownDate, setShownDate] = React.useState(date)
  if (shownDate !== date) {
    setShownDate(date)
    reveal(date)
  }
  return (
    <section aria-label="When" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`${EYEBROW} max-md:hidden`}>When</span>
        <div className={`w-[240px] max-md:w-full ${TAP}`}>
          <Segmented<WhenChoice>
            label="When"
            pill
            value={when}
            onChange={setWhen}
            options={[
              { value: 'now', label: 'Publish now' },
              { value: 'schedule', label: 'Schedule' },
            ]}
          />
        </div>
      </div>
      <Fold open={when === 'schedule'}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1 pb-4">
          <span className="flex items-baseline gap-2.5">
            <span className="font-display text-[22px] leading-none tracking-[-0.02em] max-md:text-[20px]">
              {dayLabel(date)}, <TimeField time={time} setTime={setTime} />
            </span>
            {onBest && <span className="text-[12.5px] text-(--insight-6)">Best time</span>}
          </span>
          {best && !onBest && (
            <button
              type="button"
              onClick={() => {
                setDate(best.date)
                setTime(best.time)
              }}
              className="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink max-md:h-10"
            >
              <SparkIcon size={9} />
              Best time: {best.label}, {best.time}
            </button>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 max-md:grid-cols-1">
          <div className="flex flex-col gap-2">
            {pages.count > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium">{pages.title}</span>
                <MonthArrows count={pages.count} page={pages.page} setPage={setPage} />
              </div>
            )}
            <div className="grid grid-cols-7 gap-1 text-center">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="font-mono text-[9.5px] text-ink-5">
                  {d}
                </span>
              ))}
              {pages.days.map((d) => {
                const disabled = d.past || d.today
                const on = d.date === date
                const busy = feedsOf(d).some((m) => m.kind === 'post')
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => setDate(d.date)}
                    className={`relative flex h-9 items-center justify-center rounded-[9px] text-[12.5px] tabular-nums transition-colors max-md:h-10 max-md:text-[14px] ${on ? 'bg-ink text-page' : disabled ? 'text-ink-5' : d.outside ? 'text-ink-4 hover:bg-surface' : 'text-ink hover:bg-surface'}`}
                  >
                    {dayNumber(d.date)}
                    {busy && !on && (
                      <span className="absolute bottom-1 size-1 rounded-full bg-ink-4" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <DayChart date={date} time={time} setTime={setTime} />
        </div>
      </Fold>
    </section>
  )
}

/**
 * The time in the answer line, typed over in place: "19:30", "1930" and "7.30pm" all land as
 * 19:30; what is not a time goes back to the time it was.
 */
function TimeField({ time, setTime }: { time: string; setTime: (t: string) => void }) {
  const [typed, setTyped] = React.useState<string | null>(null)
  // Escape blurs too: the blur must then drop the typed text, not keep it.
  const cancelled = React.useRef(false)
  return (
    <input
      aria-label="Post time"
      value={typed ?? time}
      onFocus={(e) => {
        setTyped(time)
        e.currentTarget.select()
      }}
      onChange={(e) => setTyped(e.target.value)}
      onBlur={() => {
        const t = typed === null || cancelled.current ? null : parseTime(typed)
        // Anything else, or a time before the calendar's day starts, goes back to the old time.
        if (t && t >= EARLIEST_POST) setTime(t)
        setTyped(null)
        cancelled.current = false
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancelled.current = true
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
      }}
      className="-mx-1 field-sizing-content rounded-[6px] bg-transparent px-1 tabular-nums underline decoration-ink-5 decoration-dotted decoration-1 underline-offset-[5px] outline-none transition-colors hover:bg-surface focus:bg-surface focus:no-underline"
    />
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
  const chart = demoOf(INSIGHTS_BY_BRAND, brandId)?.stories.find(
    (s) => s.chart.kind === 'days',
  )?.chart
  return chart && chart.kind === 'days' ? chart.values : [1, 1, 1, 1, 1, 1, 1]
}

/**
 * The picked day's hours as bars, the way a map shows how busy a place is. The best hour is green;
 * a bar sets the hour. The bars share one scale across the week, so a quiet day looks quiet.
 */
function DayChart({
  date,
  time,
  setTime,
}: {
  date: string
  time: string
  setTime: (t: string) => void
}) {
  const { brand } = useBrand()
  const [hover, setHover] = React.useState<number | null>(null)
  const weekday = weekdayOf(date)
  const weights = dayWeights(brand.id)
  const curve = hourly(demoOf(INSIGHTS_BY_BRAND, brand.id)?.hours ?? [1, 1, 1, 1, 1])
  const top = Math.max(...weights) * Math.max(...curve)
  const bars = curve.map((v) => (v * (weights[weekday] ?? 1)) / top)
  // A brand with no Insights has no best hour to mark.
  const peak = demoOf(INSIGHTS_BY_BRAND, brand.id) ? bars.indexOf(Math.max(...bars)) : -1
  // A bar picks the hour and keeps the minutes; the quarters beside the label pick the minutes.
  const hour = Number(time.slice(0, 2))
  const minutes = time.slice(3)
  const pad = (n: number) => String(n).padStart(2, '0')
  const at = (h: number) => `${pad(h)}:${minutes}`
  const shown = hover ?? HOURS.indexOf(hour)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span className="text-[12.5px]">
          <span className="text-ink-3">Time </span>
          <span className={shown === peak ? 'text-(--insight-6)' : 'text-ink-3'}>
            {shown >= 0 ? at(HOURS[shown]!) : time}
            {shown === peak ? ' · best hour' : ''}
          </span>
        </span>
        <Choice
          value={`:${minutes}`}
          options={[':00', ':15', ':30', ':45']}
          onChange={(m) => setTime(`${pad(hour)}${m}`)}
        />
      </div>
      <div role="radiogroup" aria-label="Post time" className="flex h-[96px] items-end gap-[3px]">
        {HOURS.map((h, i) => {
          const on = h === hour
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
  // A brand with no Insights has no best times yet.
  const data = demoOf(INSIGHTS_BY_BRAND, brandId) ?? { hours: [] }
  const weights = dayWeights(brandId)
  const out: Array<{ date: string; label: string; time: string; score: number }> = []
  for (const w of weeks) {
    w.days.forEach((d, i) => {
      if (d.past || d.today) return
      data.hours.forEach((h, part) => {
        out.push({
          date: d.date,
          label: dayLabel(d.date),
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

// ── Preview ──────────────────────────────────────────────────────────────────────────────────

/**
 * The post as one account will show it: a tab per ticked account, and Instagram's grid. The
 * phone is live: a reel plays, a carousel swipes, and files dropped on it join the post.
 */
function Preview({
  api,
  media,
  people,
  onFiles,
  counts,
  on,
  self,
}: {
  api: PublishDraftApi
  media: Shot[]
  people: People
  onFiles: (files: FileList | null) => Promise<void>
  /**
   * A post brought in from its account: its real counts, shown on the account it came from. Other
   * accounts show none, so another account's counts never pass for that one's.
   */
  counts?: { on: ChannelKey | undefined; metrics: NonNullable<Post['metrics']> }
  /** A posted post: the accounts it went out on, shown as they are, with nothing to add. */
  on?: ChannelKey[]
  /** The post's own id: Instagram's grid draws it first, and not again among the feed. */
  self?: string
}) {
  const { draft } = api
  const { posts } = useBrand()
  // A posted post's accounts in the order it has them, so its first one opens.
  const active = on ? on.flatMap((k) => CHANNELS.filter((c) => c.key === k)) : activeChannels(draft)
  const [picked, setPicked] = React.useState<ChannelKey | null>(null)
  const [grid, setGrid] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  const channel = active.find((c) => c.key === picked)?.key ?? active[0]?.key
  const showGrid = grid && channel === 'ig' && draft.format !== 'story'
  const phone = channel && (
    <Phone channel={channel} scale={1.25}>
      <PhoneMock
        channel={channel}
        format={draft.format}
        shots={media}
        people={people}
        text={
          channel === 'yt'
            ? (draft.youtubeTitle ?? youtubeTitle(draft))
            : textFor(draft, channel).text
        }
        live
        onAdd={on ? undefined : () => input.current?.click()}
        counts={counts && (channel === counts.on ? counts.metrics : {})}
      />
    </Phone>
  )
  // Instagram's grid: this post first, then the brand's feed posts. Stories never show in it.
  const tiles = [
    { shot: media[0], format: draft.format, slides: media.length },
    ...posts
      .filter((p) => p.id !== self && p.images.length > 0 && p.format !== 'story')
      .map((p) => ({ shot: shotOf(p.images[0]!), format: p.format, slides: p.images.length })),
  ].slice(0, 9)
  return (
    <section
      aria-label="Preview"
      className="flex flex-col gap-4 rounded-[18px] bg-page p-5 shadow-[0_0_0_1px_var(--line)] max-md:p-0 max-md:shadow-none"
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
              className={`flex size-8 items-center justify-center rounded-full transition-colors max-md:size-10 ${c.key === channel ? 'bg-ink text-page' : 'text-ink-3 hover:bg-page hover:text-ink'}`}
            >
              <PlatformLogo platform={c.key} size={13} />
            </button>
          ))}
        </div>
        {channel === 'ig' && draft.format !== 'story' && (
          <div className={`w-[136px] ${TAP}`}>
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
        <p className="py-16 text-center text-[13px] text-ink-4">
          {remote && draft.linked.length === 0
            ? 'The preview shows once an account is set up.'
            : 'Tick an account to preview it.'}
        </p>
      ) : showGrid ? (
        <div
          key="grid"
          className="bb-swap grid grid-cols-3 gap-[2px] overflow-hidden rounded-[12px]"
        >
          {tiles.map((t, i) => (
            <span
              key={i}
              className={`relative block aspect-[4/5] overflow-hidden bg-tile ${i === 0 ? 'shadow-[inset_0_0_0_2px_var(--ink)]' : 'opacity-80'}`}
            >
              {t.shot && <ShotView shot={t.shot} sizes="120px" />}
              {t.shot && <TypeBadge format={t.format} slides={t.slides} />}
            </span>
          ))}
        </div>
      ) : (
        <div key={channel} className="bb-swap flex justify-center">
          {on ? (
            phone
          ) : (
            <>
              <DropZone onFiles={onFiles} radius={22 * 1.25}>
                {phone}
              </DropZone>
              <MediaInput ref={input} format={draft.format} onFiles={onFiles} />
            </>
          )}
        </div>
      )}
    </section>
  )
}

// ── After the button ─────────────────────────────────────────────────────────────────────────

/** Each account's outcome: scheduled, uploading, live, or failed with a retry. */
function Outcomes({
  api,
  media,
  people,
  slot,
  onBack,
}: {
  api: PublishDraftApi
  media: Shot[]
  people: People
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
  // Collaborators are Instagram's: their invite leaves once the Instagram post is live.
  const ig = outcomes.ig
  const invite =
    draft.format === 'story' || !ig ? null : inviteNote(people.collabs, ig.state === 'live')
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
        {invite && (
          <p className="flex items-center gap-1.5 text-[13px] text-ink-3">
            <PersonGlyph size={11} />
            {invite}
          </p>
        )}
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
                  shots={media}
                  people={draft.format === 'story' ? undefined : people}
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

/** A draft saved: it is on the calendar, nothing went out. */
function Saved({ title, onEdit }: { title: string; onEdit: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-16 text-center">
      <span className="bb-pop flex size-10 items-center justify-center rounded-full bg-ink text-page">
        <CheckIcon size={14} strokeWidth={2.2} />
      </span>
      <h1 className="font-display text-[36px] leading-none tracking-[-0.035em]">{title}</h1>
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
