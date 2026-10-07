'use client'

import * as React from 'react'

import type { Format } from '@/data/demo'

import {
  activeChannels,
  blockers,
  initialDraft,
  type ChannelKey,
  type Draft,
  type Outcome,
  type Privacy,
  type When,
} from './model'

export type Phase = 'compose' | 'scheduled' | 'publishing' | 'done'

/**
 * The draft and the simulated send, for any publish view.
 *
 * The demo has no server, so "Publish now" is a timer: each channel uploads at its own pace,
 * LinkedIn fails at the end (a signed-out account, the commonest real failure), and Reconnect
 * sends it again. The timings are slow enough to watch and short enough not to bore a room.
 */
export function usePublishDraft(input: {
  format: Format
  hook: string
  caption: string
  selected?: ChannelKey[]
  privacy?: Privacy
}) {
  const [draft, setDraft] = React.useState<Draft>(() => initialDraft(input))
  const [rawPhase, setPhase] = React.useState<Phase>('compose')
  const [outcomes, setOutcomes] = React.useState<Partial<Record<ChannelKey, Outcome>>>({})
  const timers = React.useRef<number[]>([])

  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const update = React.useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
  }, [])

  const toggleChannel = React.useCallback((key: ChannelKey) => {
    setDraft((d) =>
      d.selected.includes(key)
        ? { ...d, selected: d.selected.filter((k) => k !== key) }
        : { ...d, selected: [...d.selected, key] },
    )
  }, [])

  // Connecting is instant in the demo: there is no account to sign in to.
  const connect = React.useCallback((key: ChannelKey) => {
    setDraft((d) => ({ ...d, connected: [...d.connected, key], selected: [...d.selected, key] }))
  }, [])

  const upload = React.useCallback((keys: ChannelKey[], failOn: ChannelKey | null) => {
    keys.forEach((key, i) => {
      const steps = 6 + i * 2
      for (let s = 1; s <= steps; s++) {
        timers.current.push(
          window.setTimeout(() => {
            setOutcomes((o) => ({
              ...o,
              [key]:
                s < steps
                  ? { state: 'uploading', progress: Math.round((s / steps) * 100) }
                  : key === failOn
                    ? { state: 'failed', reason: 'LinkedIn signed Casa Vostra out.' }
                    : { state: 'live' },
            }))
          }, s * 320),
        )
      }
    })
  }, [])

  // `when` can be passed in, so a view that sets it and sends in one click does not wait a render.
  const send = React.useCallback(
    (when: When = draft.when) => {
      if (rawPhase !== 'compose' || blockers(draft).length > 0) return
      const keys = activeChannels(draft).map((c) => c.key)
      if (when === 'slot') {
        setOutcomes(Object.fromEntries(keys.map((k) => [k, { state: 'scheduled' } as Outcome])))
        setPhase('scheduled')
        return
      }
      setOutcomes(
        Object.fromEntries(keys.map((k) => [k, { state: 'uploading', progress: 0 } as Outcome])),
      )
      setPhase('publishing')
      upload(keys, keys.includes('li') ? 'li' : null)
    },
    [draft, rawPhase, upload],
  )

  const retry = React.useCallback(
    (key: ChannelKey) => {
      setOutcomes((o) => ({ ...o, [key]: { state: 'uploading', progress: 0 } }))
      setPhase('publishing')
      upload([key], null)
    },
    [upload],
  )

  const backToCompose = React.useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setOutcomes({})
    setPhase('compose')
  }, [])

  // Done is a fact about the channels, not a timer: a timer set for the first batch fired early
  // when Reconnect started a second upload after it.
  const uploading = Object.values(outcomes).some((o) => o?.state === 'uploading')
  const phase: Phase = rawPhase === 'publishing' && !uploading ? 'done' : rawPhase

  return { draft, update, toggleChannel, connect, phase, outcomes, send, retry, backToCompose }
}

export type PublishDraftApi = ReturnType<typeof usePublishDraft>
