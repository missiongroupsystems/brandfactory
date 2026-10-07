'use client'

import * as React from 'react'

import { Confetti } from '@/components/confetti'
import { Fold, QuietButton, Segmented, Switch } from '@/components/controls'
import { ChevronIcon, PlusIcon, SparkIcon } from '@/components/icons'
import { PlatformLogo } from '@/components/platform-logos'
import { Sheet } from '@/components/sheet'
import type { Format, Stage } from '@/data/demo'
import { INSIGHTS_BY_BRAND } from '@/data/insights'

import {
  CHANNELS,
  PRIVACY,
  activeChannels,
  blockers,
  kindOn,
  primaryLabel,
  textFor,
  tiktokConsent,
  youtubeTitle,
  type Channel,
  type ChannelKey,
  type Outcome,
} from './model'
import { useBrand } from '@/features/schedule/posts-store'

import { PhoneMock } from './phone-mocks'
import { usePublishDraft, type PublishDraftApi } from './use-publish-draft'

export interface PublishSubject {
  format: Format
  hook: string
  caption: string
  images: string[]
  duration?: string
  slot: string
  slotShort: string
}

const FORMAT_LABEL: Record<Format, string> = { reel: 'REEL', carousel: 'CAROUSEL', story: 'STORY' }

/** Captions "Draft with AI" cycles through. The demo has no model behind it. */
const ALTERNATIVES = [
  'Ten seconds of fire, a crust that cracks 🔥 Blowtorch finish at Raffles City. #casavostra #pizzasg #rafflescity',
  'Smoke, blister, crack. The last ten seconds before your pizza lands 🔥 Raffles City. #casavostra #pizzasg',
]

/** The times the picker offers; the brand's best hour joins them. */
const POST_TIMES = ['08:00', '12:00', '15:00', '18:00', '19:30', '21:00']

const PLURAL: Record<Format, string> = { reel: 'reels', carousel: 'carousels', story: 'stories' }

/**
 * The line under a phone, one pattern for every channel: what the post becomes there, plus one
 * plain word only when the marketer did something to it. The app's own fitting (a YouTube title,
 * LinkedIn's tidier text) is plumbing and stays out of the label.
 */
function tagFor(format: Format, channel: Channel, ownText: boolean): string {
  const kind = kindOn(format, channel.key)
  if (kind === null) return `No ${PLURAL[format]} on ${channel.name}`
  return ownText ? `${kind} · Own caption` : kind
}

/**
 * Option B of the canvas: the preview is the picker. Each channel is a phone showing the post as
 * that channel shows it; tapping one includes it or leaves it out. After the button, the same
 * phones carry each channel's status. Every rule comes from `model.ts`.
 */
export function PublishSheet({
  subject: given,
  onClose,
  onStage,
  onTime,
}: {
  subject: PublishSubject
  onClose: () => void
  onStage: (stage: Stage) => void
  /** The post time the marketer picked, once the post is scheduled. */
  onTime?: (time: string) => void
}) {
  // The day comes with the post; the time is the marketer's to pick. Everything that prints the
  // slot reads it from here, so the sent message and each channel's pill say the time picked.
  const [time, setTime] = React.useState(given.slot.split(', ')[1] ?? '18:00')
  const subject = React.useMemo(
    () => ({
      ...given,
      slot: `${given.slot.split(', ')[0]}, ${time}`,
      slotShort: `${given.slotShort.split(', ')[0]}, ${time}`,
    }),
    [given, time],
  )
  const api = usePublishDraft(given)
  const { brand } = useBrand()
  const { draft, phase, outcomes } = api
  const [editing, setEditing] = React.useState<ChannelKey | null>(null)

  React.useEffect(() => {
    // Posted as soon as it starts going out: the sheet says "you can close this", so closing
    // mid-upload must not leave the calendar behind.
    if (phase === 'scheduled') {
      onStage('scheduled')
      onTime?.(time)
    }
    if (phase === 'publishing' || phase === 'done') onStage('posted')
  }, [phase, onStage, onTime, time])

  const composing = phase === 'compose'
  const active = activeChannels(draft)
  const editKey = editing && active.some((c) => c.key === editing) ? editing : null

  // Composing shows every channel, so leaving one out is one tap back; after the button only the
  // ones the post went to.
  const shown: Channel[] = composing
    ? CHANNELS
    : CHANNELS.filter((c) => outcomes[c.key] !== undefined)

  const available = CHANNELS.filter((c) => kindOn(draft.format, c.key) !== null).length
  const meta = `${brand.name.toUpperCase()} · ${FORMAT_LABEL[subject.format]}${
    subject.duration ? ` · ${subject.duration}` : ` · ${subject.images.length} PHOTOS`
  }`

  return (
    <Sheet label="Publish" onClose={onClose} variant="stage">
      {composing ? (
        <header
          className="bb-rise flex flex-col items-center gap-2.5 px-14 pt-2 text-center max-md:px-2 max-md:pt-10"
          style={{ animationDelay: '80ms' }}
        >
          <span className="font-mono text-[11px] tracking-[0.1em] text-ink-3">{meta}</span>
          <h2 className="font-serif text-[40px] leading-[1.04] tracking-[-0.015em] max-md:text-[32px]">
            {subject.hook}
          </h2>
          <p className="text-sm text-ink-2">
            {active.length === 0
              ? 'Nothing selected yet. Tap a preview to choose where it goes.'
              : `${active.length} of ${available} channels. Tap a preview to include it or leave it out.`}
          </p>
        </header>
      ) : (
        <SentHeader api={api} slot={subject.slot} />
      )}

      <div
        role="group"
        aria-label={
          composing ? 'Channels. Each preview shows how the post lands there.' : 'Channel status'
        }
        className="flex items-start justify-center gap-6 overflow-x-auto px-2 pt-11 pb-2 max-lg:justify-start"
      >
        {shown.map((c, i) => (
          <PhoneCard
            key={c.key}
            channel={c}
            index={i}
            count={shown.length}
            api={api}
            subject={subject}
            editing={editKey === c.key}
            onAdjust={() => setEditing(editKey === c.key ? null : c.key)}
          />
        ))}
      </div>

      {composing ? (
        <Compose
          api={api}
          subject={subject}
          time={time}
          onTime={setTime}
          editing={editKey}
          onEdit={setEditing}
          onApproval={onClose}
        />
      ) : (
        <footer
          className="bb-rise mt-9 flex items-center justify-center gap-5 pt-6 shadow-[inset_0_1px_0_var(--line)]"
          style={{ animationDelay: '520ms' }}
        >
          <button
            type="button"
            onClick={api.backToCompose}
            className="min-h-11 px-2 text-[13.5px] text-ink-2 transition-colors hover:text-ink"
          >
            Edit post
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[52px] items-center rounded-2xl bg-ink px-7 text-[15px] font-medium text-page transition-shadow hover:shadow-lift"
          >
            Back to schedule
          </button>
        </footer>
      )}
    </Sheet>
  )
}

function SentHeader({ api, slot }: { api: PublishDraftApi; slot: string }) {
  const { phase, outcomes } = api
  const keys = Object.keys(outcomes) as ChannelKey[]
  const failed = keys.filter((k) => outcomes[k]?.state === 'failed').length
  const busy = phase === 'publishing'
  const title =
    phase === 'scheduled'
      ? 'Scheduled'
      : busy
        ? 'Publishing'
        : failed
          ? `Live on ${keys.length - failed} of ${keys.length}`
          : 'Live everywhere'
  const sub =
    phase === 'scheduled'
      ? `${slot}, on ${keys.length} channels. Nothing else to do.`
      : busy
        ? `Sending to ${keys.length} channels. You can close this.`
        : failed
          ? 'One channel needs you.'
          : `Posted to ${keys.length} channels.`
  // Confetti only for the moment everything is out: not for a schedule, not for 3 of 4.
  const allLive = phase === 'done' && failed === 0
  return (
    <header
      className="bb-rise flex flex-col items-center gap-3 px-14 pt-2 text-center"
      aria-live="polite"
    >
      <span className="relative">
        {allLive && <Confetti />}
        <span className="bb-pop flex size-10 items-center justify-center rounded-full bg-ink">
          {busy ? (
            <span className="bb-pulse size-[9px] rounded-full bg-page" />
          ) : (
            <svg
              key={title}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                className="bb-draw"
                d="M3.5 8.4L6.6 11.4L12.5 4.8"
                stroke="var(--page)"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </span>
      <h2 className="font-serif text-[40px] leading-[1.04] tracking-[-0.015em]">{title}</h2>
      <p className="text-sm text-ink-2">{sub}</p>
    </header>
  )
}

const PHONE_UP = 'var(--shadow-phone-up)'
const PHONE_DOWN = 'var(--shadow-phone-down)'

function PhoneCard({
  channel,
  index,
  count,
  api,
  subject,
  editing,
  onAdjust,
}: {
  channel: Channel
  index: number
  count: number
  api: PublishDraftApi
  subject: PublishSubject
  editing: boolean
  onAdjust: () => void
}) {
  const { draft, phase, outcomes } = api
  const composing = phase === 'compose'
  const key = channel.key
  const supported = kindOn(draft.format, key) !== null
  const connected = draft.connected.includes(key)
  const included = supported && connected && draft.selected.includes(key)
  const outcome = outcomes[key]
  // A real connect is a sign-in round trip; the demo gives it a beat so it reads as one.
  const [connecting, setConnecting] = React.useState(false)
  const [justConnected, setJustConnected] = React.useState(false)
  const connectTimers = React.useRef<number[]>([])
  React.useEffect(() => {
    const timers = connectTimers.current
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [])

  // A gentle fan: the middle phone sits highest, the outer ones tilt and drop.
  const d = index - (count - 1) / 2
  const rot = d * 1.4
  const arc = Math.abs(d) * 7
  const lift = `translateY(${arc - 10}px) rotate(${rot}deg) scale(1)`
  const sink = `translateY(${arc + 8}px) rotate(${rot * 0.5}deg) scale(0.9)`

  let up = composing ? included : outcome?.state !== 'failed'
  if (composing && !connected) up = false

  const tag = composing
    ? !supported
      ? tagFor(draft.format, channel, false)
      : !connected
        ? 'Not connected'
        : included
          ? tagFor(draft.format, channel, draft.overrides[key] !== undefined)
          : 'Not included'
    : outcome
      ? statusText(outcome, subject.slotShort)
      : ''

  const aria = !supported
    ? `${channel.name} cannot take a ${draft.format}`
    : !connected
      ? `Connect ${channel.name}`
      : `${channel.name}, ${included ? 'included. Press to leave it out.' : 'left out. Press to include it.'}`

  function onPick() {
    if (!composing || !supported) return
    if (connected) {
      api.toggleChannel(key)
      return
    }
    if (connecting) return
    setConnecting(true)
    connectTimers.current.push(
      window.setTimeout(() => {
        api.connect(key)
        setConnecting(false)
        setJustConnected(true)
        connectTimers.current.push(window.setTimeout(() => setJustConnected(false), 1800))
      }, 1500),
    )
  }

  return (
    <div
      className="bb-deal flex w-[172px] shrink-0 flex-col gap-3.5"
      style={{ animationDelay: `${140 + index * 70}ms` }}
    >
      <button
        type="button"
        aria-pressed={composing && supported && connected ? included : undefined}
        aria-label={aria}
        disabled={!composing || !supported}
        onClick={onPick}
        className="group block rounded-[22px] text-left outline-none disabled:cursor-default"
      >
        <span
          className="bb-phone relative flex aspect-[9/16] w-[172px] flex-col overflow-hidden rounded-[22px] group-focus-visible:shadow-[0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]!"
          style={{
            background: key === 'li' ? 'var(--page)' : 'var(--ink)',
            transform: up ? lift : sink,
            opacity: composing && !up && connected ? 0.42 : outcome?.state === 'failed' ? 0.55 : 1,
            filter: up ? 'none' : 'grayscale(1)',
            boxShadow: up ? PHONE_UP : PHONE_DOWN,
          }}
        >
          <PhoneMock
            channel={key}
            format={draft.format}
            image={subject.images[0]}
            duration={subject.duration}
            text={key === 'yt' ? youtubeTitle(draft) : textFor(draft, key).text}
          />

          {composing && included && key === 'tt' && draft.privacy === null && (
            <span className="bb-pop absolute top-[44%] left-2.5 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap text-ink backdrop-blur-sm">
              <span className="bb-pulse size-[5px] rounded-full bg-ink" />
              Who can watch?
            </span>
          )}
          {composing && !connected && supported && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[rgba(247,247,244,0.86)]">
              <span className="text-[11px] text-ink-2">
                {connecting ? `Signing in to ${channel.name}` : 'Not connected'}
              </span>
              <span
                aria-live="polite"
                className="flex min-w-[104px] items-center justify-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-page transition-[min-width] duration-300"
              >
                {connecting ? (
                  <>
                    <span className="size-3 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <PlusIcon size={9} />
                    Connect
                  </>
                )}
              </span>
            </span>
          )}
          {composing && included && (
            <span className="bb-pop absolute top-[9px] right-[9px] flex size-[22px] items-center justify-center rounded-full bg-page shadow-[0_2px_8px_rgba(18,18,18,0.24)]">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  className="bb-draw"
                  d="M2.5 6.3L5 8.7L9.5 3.5"
                  stroke="var(--ink)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          {!composing && outcome && (
            <StatusPill outcome={outcome} slotShort={subject.slotShort} delay={380 + index * 90} />
          )}
          {!composing && outcome?.state === 'uploading' && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
              <span
                className="block h-full bg-white transition-[width] duration-300 ease-out"
                style={{ width: `${outcome.progress}%` }}
              />
            </span>
          )}
        </span>
      </button>

      <div
        className="flex flex-col gap-0.5 px-1 transition-opacity duration-300"
        style={{ opacity: composing && !included ? 0.7 : 1 }}
      >
        <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
          <PlatformLogo platform={key} size={13} />
          {channel.name}
        </span>
        <span className="flex min-h-7 items-center justify-between gap-2">
          <span
            className={`text-[12.5px] ${outcome?.state === 'failed' ? 'text-fail-ink' : composing && !included ? 'text-ink-3' : 'text-ink-2'}`}
          >
            {justConnected && composing ? (
              <span className="bb-pop inline-flex items-center gap-1.5 text-ink">
                <span className="size-1.5 rounded-full bg-live" />
                Connected
              </span>
            ) : connecting ? (
              'Connecting…'
            ) : (
              tag
            )}
          </span>
          {composing && included && draft.format !== 'story' && (
            <button
              type="button"
              onClick={onAdjust}
              aria-pressed={editing}
              aria-label={`Edit the ${channel.name} caption`}
              className={`flex min-h-8 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-medium transition-colors hover:bg-surface hover:text-ink ${editing ? 'bg-surface text-ink' : 'text-ink-3'}`}
            >
              {draft.overrides[key] !== undefined && (
                <span aria-hidden="true" className="size-1 rounded-full bg-current" />
              )}
              Edit
            </button>
          )}
          {!composing && outcome?.state === 'live' && (
            <span className="text-[12.5px] text-ink-2">View ↗</span>
          )}
        </span>
        {!composing && outcome?.state === 'uploading' && key === 'tt' && (
          <span className="text-xs leading-[1.4] text-ink-2">
            TikTok can take a few minutes. You can close this.
          </span>
        )}
        {!composing && outcome?.state === 'failed' && (
          <>
            <span className="text-xs leading-[1.4] text-ink-2">{outcome.reason}</span>
            <button
              type="button"
              onClick={() => api.retry(key)}
              className="mt-2 h-9 self-start rounded-full bg-ink px-4 text-[12.5px] font-medium text-page transition-shadow hover:shadow-lift"
            >
              Reconnect
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function statusText(outcome: Outcome, slotShort: string): string {
  switch (outcome.state) {
    case 'scheduled':
      return `Scheduled · ${slotShort}`
    case 'uploading':
      return `Uploading · ${outcome.progress}%`
    case 'live':
      return 'Live'
    case 'failed':
      return 'Not posted'
  }
}

function StatusPill({
  outcome,
  slotShort,
  delay,
}: {
  outcome: Outcome
  slotShort: string
  delay: number
}) {
  const label =
    outcome.state === 'scheduled'
      ? slotShort
      : outcome.state === 'uploading'
        ? 'Uploading'
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
      style={{ animationDelay: outcome.state === 'scheduled' ? `${delay}ms` : undefined }}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

const FIELD_LABEL: Record<ChannelKey, string> = {
  ig: 'Instagram caption',
  tt: 'TikTok caption',
  yt: 'YouTube title',
  li: 'LinkedIn post text',
  fb: 'Facebook caption',
}

/**
 * Everything under the previews while composing: one caption, the questions only the chosen
 * channels ask, and one button. A channel's own version opens in the same field, never in a
 * new box, so the page does not jump.
 */
function Compose({
  api,
  subject,
  time,
  onTime,
  editing,
  onEdit,
  onApproval,
}: {
  api: PublishDraftApi
  subject: PublishSubject
  time: string
  onTime: (time: string) => void
  editing: ChannelKey | null
  onEdit: (channel: ChannelKey | null) => void
  onApproval: () => void
}) {
  const { draft, update } = api
  const [drafted, setDrafted] = React.useState(0)
  // 'thinking' is the short pause before the new caption starts typing itself in.
  const [writing, setWriting] = React.useState<'thinking' | 'typing' | null>(null)
  const writer = React.useRef<number | null>(null)
  const field = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(
    () => () => {
      if (writer.current !== null) window.clearTimeout(writer.current)
    },
    [],
  )

  /**
   * The demo has no model, so "Draft with AI" types one of the prepared captions in like a
   * typewriter: by grapheme, so an emoji arrives whole, at a slightly uneven human pace. The
   * phones read the same caption, so they type along. Instant under reduced motion.
   */
  function draftWithAI() {
    if (writing) return
    const target = ALTERNATIVES[drafted % ALTERNATIVES.length]!
    setDrafted((n) => n + 1)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update({ caption: target })
      return
    }
    const parts = [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(target),
    ].map((g) => g.segment)
    let i = 0
    const step = () => {
      i += 1
      update({ caption: parts.slice(0, i).join('') })
      if (i < parts.length) {
        writer.current = window.setTimeout(step, 10 + Math.random() * 18)
      } else {
        writer.current = null
        setWriting(null)
      }
    }
    setWriting('thinking')
    writer.current = window.setTimeout(() => {
      setWriting('typing')
      step()
    }, 320)
  }
  const active = activeChannels(draft)
  const blocked = blockers(draft)
  const ttOn = active.some((c) => c.key === 'tt')
  const story = subject.format === 'story'

  // "Edit" under a phone lands the cursor in the field that now holds that channel's text.
  React.useEffect(() => {
    if (editing === null) return
    const el = field.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [editing])

  // A tab for each channel with its own text, and for the one being edited.
  const tabs = active.filter((c) => c.key === editing || draft.overrides[c.key] !== undefined)
  const name = editing ? CHANNELS.find((c) => c.key === editing)?.name : null
  const own = editing !== null && draft.overrides[editing] !== undefined

  function setText(text: string) {
    if (editing === null) update({ caption: text })
    else update({ overrides: { ...draft.overrides, [editing]: text } })
  }

  function backToShared() {
    if (editing === null) return
    const overrides = { ...draft.overrides }
    delete overrides[editing]
    update({ overrides })
    onEdit(null)
  }

  return (
    <div
      className="bb-rise mx-auto mt-10 flex w-full max-w-[620px] flex-col"
      style={{ animationDelay: '360ms' }}
    >
      {!story && (
        <section className="flex flex-col">
          <div className="flex min-h-9 items-center justify-between gap-3 pb-2.5">
            <label
              htmlFor={editing === 'yt' ? 'publish-yt-title' : 'publish-caption'}
              className="text-[13px] font-medium text-ink-2"
            >
              {editing ? FIELD_LABEL[editing] : 'Caption'}
            </label>
            {tabs.length > 0 && (
              <div className="bb-menu">
                <Segmented
                  label="Caption for"
                  pill
                  options={[
                    { value: 'all' as const, label: 'All channels' },
                    ...tabs.map((c) => ({ value: c.key, label: c.name })),
                  ]}
                  value={editing ?? 'all'}
                  onChange={(v) => onEdit(v === 'all' ? null : v)}
                />
              </div>
            )}
          </div>

          <Fold open={editing === 'yt'}>
            <div className="flex flex-col pb-1">
              <input
                id="publish-yt-title"
                value={youtubeTitle(draft)}
                onChange={(e) => update({ youtubeTitle: e.target.value })}
                className="h-11 rounded-xl bg-page px-3.5 text-[14.5px] font-medium shadow-[inset_0_0_0_1px_var(--line-strong)] transition-shadow outline-none focus:shadow-[inset_0_0_0_1px_var(--ink-4)]"
              />
              <label
                htmlFor="publish-caption"
                className="flex min-h-9 items-end pb-2.5 text-[13px] font-medium text-ink-2"
              >
                Description
              </label>
            </div>
          </Fold>

          <div
            className={`relative rounded-[14px] transition-[background-color,box-shadow] duration-[260ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
              editing
                ? 'bg-page shadow-[inset_0_0_0_1px_var(--line-strong)] focus-within:shadow-[inset_0_0_0_1px_var(--ink-4)]'
                : 'bg-surface-2 focus-within:shadow-[inset_0_0_0_1px_var(--line-strong)]'
            }`}
          >
            <textarea
              ref={field}
              id="publish-caption"
              rows={3}
              value={editing ? textFor(draft, editing).text : draft.caption}
              onChange={(e) => setText(e.target.value)}
              readOnly={writing !== null}
              className="block min-h-[96px] w-full resize-none rounded-[14px] bg-transparent field-sizing-content py-3.5 pr-[52px] pl-4 text-[15px] leading-[1.55] outline-none"
            />
            {editing === null && (
              <button
                type="button"
                aria-label={drafted ? 'Try another caption' : 'Draft with AI'}
                title={drafted ? 'Try another caption' : 'Draft with AI'}
                aria-busy={writing !== null}
                onClick={draftWithAI}
                className="bb-press absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-page text-ink shadow-soft"
              >
                <span className={`flex ${writing ? 'animate-spin [animation-duration:1.4s]' : ''}`}>
                  <SparkIcon />
                </span>
              </button>
            )}
          </div>

          <Fold open={editing !== null}>
            <div className="flex flex-col pt-1">
              {editing === 'yt' && (
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <span className="text-[13px]">Made for kids</span>
                  <Switch
                    label="Made for kids"
                    checked={draft.madeForKids}
                    onChange={(madeForKids) => update({ madeForKids })}
                  />
                </div>
              )}
              <div className="flex min-h-9 items-center justify-between gap-3">
                <span className="text-[12.5px] text-ink-3">
                  Only {name} sees this{own ? '.' : ' once you change it.'}
                </span>
                <QuietButton onClick={backToShared} className="min-h-8 font-medium">
                  {own ? 'Use shared caption' : 'Done'}
                </QuietButton>
              </div>
            </div>
          </Fold>
        </section>
      )}

      {/* The fold clips its content; the 12px bleed keeps the flush-right pills whole. */}
      <div className="-mx-3">
        <Fold open={ttOn}>
          <div className="px-3">
            <TikTokSettings api={api} />
          </div>
        </Fold>
      </div>

      <footer
        className={`flex flex-wrap items-center gap-x-5 gap-y-3 pt-5 ${story && !ttOn ? '' : 'mt-8 shadow-[inset_0_1px_0_var(--line)]'}`}
      >
        <Segmented
          label="When"
          pill
          options={[
            { value: 'slot', label: subject.slot.split(', ')[0]! },
            { value: 'now', label: 'Now' },
          ]}
          value={draft.when}
          onChange={(when) => update({ when })}
        />
        {draft.when === 'slot' && <TimePicker value={time} onChange={onTime} />}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onApproval}
          className="flex min-h-11 items-center justify-center px-1 text-[13px] text-ink-3 transition-colors hover:text-ink max-sm:order-last max-sm:w-full"
        >
          Send for approval
        </button>
        <button
          type="button"
          onClick={api.send}
          aria-disabled={blocked.length > 0}
          aria-describedby="publish-status"
          className={`h-11 min-w-[148px] rounded-xl px-5 text-[14px] font-medium transition-[background-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.98] max-sm:w-full ${
            blocked.length > 0
              ? 'cursor-not-allowed bg-surface text-ink-4'
              : 'bg-ink text-page hover:shadow-lift'
          }`}
        >
          {primaryLabel(draft)}
        </button>
        <p
          id="publish-status"
          aria-live="polite"
          className="-mt-1 min-h-[18px] basis-full text-right text-[12.5px] text-ink-2 max-sm:text-center"
        >
          {active.length > 0 && blocked[0] && (
            <span key={blocked[0]} className="bb-menu inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-ink" />
              {blocked[0]}
            </span>
          )}
        </p>
      </footer>
    </div>
  )
}

/**
 * The post time: "at 18:00", which opens a row of times. The brand's best hour from Insights is
 * marked, so the good default is one glance away. Escape or a click outside closes it.
 */
function TimePicker({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const { brand } = useBrand()
  const best = INSIGHTS_BY_BRAND[brand.id].best
  const times = [...new Set([...POST_TIMES, best])].sort()
  const [open, setOpen] = React.useState(false)
  const box = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      // The sheet closes on Escape too; the picker takes it first.
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <span ref={box} className="relative flex items-center gap-2 text-[13px] text-ink-3">
      at
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Post time ${value}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-medium text-ink tabular-nums transition-colors hover:bg-paper"
      >
        {value}
        {value === best && <span className="text-[11px] font-medium text-(--insight-6)">Best</span>}
        <ChevronIcon open={open} size={8} />
      </button>
      {open && (
        <span
          role="listbox"
          aria-label="Post time"
          className="bb-menu absolute bottom-[calc(100%+8px)] left-0 z-10 flex gap-1 rounded-2xl bg-page p-1.5 shadow-pop"
        >
          {times.map((t) => {
            const on = t === value
            return (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(t)
                  setOpen(false)
                }}
                className={`flex h-12 min-w-[58px] flex-col items-center justify-center rounded-xl px-2 tabular-nums transition-colors ${on ? 'bg-ink text-page' : 'text-ink hover:bg-surface'}`}
              >
                <span className="text-[13px] font-medium">{t}</span>
                <span
                  className={`text-[9.5px] font-medium ${t === best ? (on ? 'text-(--insight-3)' : 'text-(--insight-6)') : 'invisible'}`}
                >
                  Best
                </span>
              </button>
            )
          })}
        </span>
      )}
    </span>
  )
}

/**
 * TikTok's questions as a list of rows. "Who can watch" has no default, so it asks with its
 * options showing until answered, then shrinks to the answer. The consent sentence sits under
 * the rows it depends on.
 */
function TikTokSettings({ api }: { api: PublishDraftApi }) {
  const { draft, update } = api
  const { brand } = useBrand()
  const [asking, setAsking] = React.useState(false)
  const [more, setMore] = React.useState(false)
  const unanswered = draft.privacy === null
  const allowed = (
    [
      ['comments', 'Comments'],
      ['duet', 'Duet'],
      ['stitch', 'Stitch'],
    ] as const
  )
    .filter(([k]) => draft.interactions[k])
    .map(([, l]) => l)
  const interactions = allowed.length === 0 ? 'All off' : allowed.join(', ')
  const promoMissing = draft.promo.on && !draft.promo.own && !draft.promo.paid
  const row =
    'flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-1.5 shadow-[inset_0_1px_0_var(--line)]'

  return (
    <section aria-label="TikTok" className="flex flex-col pt-10">
      <div className="flex items-center gap-2 pb-2.5 text-[12.5px] text-ink-3">
        <PlatformLogo platform="tt" size={13} className="text-ink" />
        <span>
          <span className="font-medium text-ink">TikTok</span> · posting as {brand.handle}
        </span>
      </div>

      <div className={row}>
        <span className="flex items-center gap-2 text-[13.5px]">
          {unanswered && <span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />}
          Who can watch
        </span>
        {unanswered || asking ? (
          <div className="bb-menu">
            <Segmented
              label="Who can watch on TikTok"
              options={PRIVACY.map((p) => ({ value: p, label: p }))}
              value={draft.privacy}
              onChange={(privacy) => {
                update({ privacy })
                setAsking(false)
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={false}
            aria-label={`Who can watch on TikTok: ${draft.privacy}. Change`}
            onClick={() => setAsking(true)}
            className="bb-menu bb-press -mr-3 flex h-9 items-center gap-2 rounded-full px-3 text-[13.5px] font-medium hover:bg-surface"
          >
            {draft.privacy}
            <ChevronIcon size={9} />
          </button>
        )}
      </div>

      <div className={row}>
        <span className="text-[13.5px]">Comments, Duet, Stitch</span>
        <button
          type="button"
          aria-expanded={more}
          aria-label={`Comments, Duet, Stitch: ${interactions}`}
          onClick={() => setMore((o) => !o)}
          className="bb-press -mr-3 flex h-9 items-center gap-2 rounded-full px-3 text-[13.5px] text-ink-2 hover:bg-surface hover:text-ink"
        >
          {interactions}
          <ChevronIcon open={more} size={9} />
        </button>
      </div>
      <Fold open={more}>
        <div className="flex flex-col pb-2 pl-4">
          {(
            [
              ['comments', 'Allow comments'],
              ['duet', 'Allow Duet'],
              ['stitch', 'Allow Stitch'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex min-h-10 items-center justify-between gap-3">
              <span className="text-[13px] text-ink-2">{label}</span>
              <Switch
                label={label}
                checked={draft.interactions[key]}
                onChange={(v) => update({ interactions: { ...draft.interactions, [key]: v } })}
              />
            </div>
          ))}
        </div>
      </Fold>

      <div className={row}>
        <span className="text-[13.5px]">Promotes a brand</span>
        <Switch
          label="Promotes a brand"
          checked={draft.promo.on}
          onChange={(v) => update({ promo: { ...draft.promo, on: v } })}
        />
      </div>
      <Fold open={draft.promo.on}>
        <div className="flex flex-wrap items-center gap-2 pb-3 pl-4">
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
              className={`bb-press h-8 rounded-full px-3.5 text-[12.5px] font-medium ${draft.promo[key] ? 'bg-ink text-page' : 'bg-surface text-ink-2 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
          {promoMissing && <span className="text-[12.5px] text-ink-3">Pick at least one.</span>}
        </div>
      </Fold>

      <p className="pt-2 text-[12px] leading-[1.45] text-ink-3">{tiktokConsent(draft)}</p>
    </section>
  )
}
