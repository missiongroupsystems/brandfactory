import { describe, expect, it } from 'vitest'
import {
  createMissionEventsSource,
  foldStatus,
  parseSourceInstant,
  toExternalEvent,
} from './mission-events'
import { EventsUnauthorizedError, EventsUnavailableError } from './port'

const NOW = new Date('2026-10-15T00:00:00.000Z')

function row(over: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'F1 terrace night',
    status: 'confirmed',
    event_type: 'private',
    // Naive, holding UTC — 19:00 UTC is 03:00 the next day in Singapore.
    date_start: '2026-10-20T11:00:00',
    date_end: '2026-10-20T15:00:00',
    is_all_day: false,
    outlet_id: '22222222-2222-4222-8222-222222222222',
    outlet_slug: 'temper',
    outlet_name: 'Temper',
    room_name: 'Terrace',
    guest_count: 80,
    ...over,
  }
}

const page = (items: unknown[], total = items.length, skip = 0) => ({
  items,
  total,
  skip,
  limit: 500,
})

describe('parseSourceInstant', () => {
  // Read as local time this is an eight-hour shift for a Singapore reader,
  // which moves an evening booking into the small hours of the next day.
  it('reads a zoneless timestamp as UTC, not as local time', () => {
    expect(parseSourceInstant('2026-10-20T19:00:00')?.toISOString()).toBe(
      '2026-10-20T19:00:00.000Z',
    )
  })

  it('leaves an explicit zone alone', () => {
    expect(parseSourceInstant('2026-10-20T19:00:00+08:00')?.toISOString()).toBe(
      '2026-10-20T11:00:00.000Z',
    )
  })

  it('returns null for something that is not a date', () => {
    expect(parseSourceInstant('last Tuesday')).toBeNull()
  })
})

describe('foldStatus', () => {
  const past = new Date('2026-09-01T00:00:00.000Z')
  const future = new Date('2026-11-01T00:00:00.000Z')

  // The date never completes an event: a person does, or an order completion
  // does today (being retired). So a past confirmed event is often still
  // confirmed there.
  it('folds a finished confirmed event to completed', () => {
    expect(foldStatus('confirmed', past, NOW)).toBe('completed')
  })

  it('leaves an upcoming confirmed event alone', () => {
    expect(foldStatus('confirmed', future, NOW)).toBe('confirmed')
  })

  it('keeps completed completed', () => {
    expect(foldStatus('completed', future, NOW)).toBe('completed')
  })

  // A tentative event in the past never happened — it never firmed up, and
  // that difference is why the team asked to see tentatives.
  it('never folds tentative, past or future', () => {
    expect(foldStatus('tentative', past, NOW)).toBe('tentative')
    expect(foldStatus('tentative', future, NOW)).toBe('tentative')
  })

  it('drops the statuses we did not ask for', () => {
    expect(foldStatus('inquiry', future, NOW)).toBeNull()
    expect(foldStatus('cancelled', future, NOW)).toBeNull()
    expect(foldStatus('lost', future, NOW)).toBeNull()
  })
})

describe('toExternalEvent', () => {
  it('maps a booking, carrying the outlet, the room and the heads', () => {
    expect(toExternalEvent(row(), NOW)).toMatchObject({
      name: 'F1 terrace night',
      status: 'confirmed',
      allDay: false,
      outletName: 'Temper',
      roomName: 'Terrace',
      guestCount: 80,
    })
  })

  // **Reported, never inferred.** The first cut of this adapter tested for a
  // midnight start in UTC. An all-day 1 October event is stored
  // `2026-09-30T16:00:00`, so that test called it neither all-day nor October.
  it('takes allDay from the source rather than from the timestamp', () => {
    const allDay = toExternalEvent(
      row({ date_start: '2026-09-30T16:00:00', date_end: '2026-10-01T15:59:00', is_all_day: true }),
      NOW,
    )
    expect(allDay?.allDay).toBe(true)

    // The same shape without the flag is not all day, however midnight-ish it looks.
    const notAllDay = toExternalEvent(
      row({ date_start: '2026-09-30T16:00:00', is_all_day: false }),
      NOW,
    )
    expect(notAllDay?.allDay).toBe(false)
  })

  it('falls back to the slug when the outlet has no name', () => {
    expect(toExternalEvent(row({ outlet_name: null }), NOW)?.outletName).toBe('temper')
  })

  it('reads a missing guest count as null rather than zero', () => {
    expect(toExternalEvent(row({ guest_count: null }), NOW)?.guestCount).toBeNull()
  })

  // A dropped row is a marker the calendar does not draw, which is the right
  // failure: an unexplainable marker costs more trust than a missing one.
  it.each([
    ['no id', { id: null }],
    ['no name', { name: '' }],
    ['no outlet', { outlet_id: undefined }],
    ['an unparseable start', { date_start: 'next Friday' }],
    ['a status we did not ask for', { status: 'cancelled' }],
  ])('drops a row with %s', (_label, over) => {
    expect(toExternalEvent(row(over), NOW)).toBeNull()
  })
})

describe('createMissionEventsSource', () => {
  function sourceWith(handler: (url: string) => Response, now = () => NOW) {
    const calls: string[] = []
    const headers: (Record<string, string> | undefined)[] = []
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calls.push(url)
      headers.push(init?.headers as Record<string, string> | undefined)
      return Promise.resolve(handler(url))
    }) as unknown as typeof fetch
    return {
      calls,
      headers,
      source: createMissionEventsSource({
        baseUrl: 'https://events.example.com/',
        serviceKey: 'key-123',
        fetchImpl,
        now,
      }),
    }
  }

  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  it('asks the marketing endpoint for the range, with the three statuses', async () => {
    const { source, calls, headers } = sourceWith(() => ok(page([row()])))
    const { events } = await source.listRange({ from: '2026-09-28', to: '2026-11-01' })

    expect(calls[0]).toContain('/api/v1/internal/marketing/events?from=2026-09-28&to=2026-11-01')
    expect(calls[0]).toContain('status=tentative')
    expect(calls[0]).toContain('status=confirmed')
    expect(calls[0]).toContain('status=completed')
    expect(headers[0]?.['X-Service-Key']).toBe('key-123')
    expect(events).toHaveLength(1)
  })

  // **Every list endpoint there paginates.** A client that read page one and
  // stopped would draw a month that looked complete and was not, which is the
  // worst shape of wrong a calendar has.
  it('reads every page, not just the first', async () => {
    let call = 0
    const { source, calls } = sourceWith(() => {
      call += 1
      return call === 1
        ? ok(page([row({ id: 'a' }), row({ id: 'b' })], 3, 0))
        : ok(page([row({ id: 'c' })], 3, 2))
    })
    const { events } = await source.listRange({ from: '2026-10-01', to: '2026-10-31' })
    expect(events).toHaveLength(3)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('skip=2')
  })

  it('stops on an empty page rather than looping on a total it cannot reach', async () => {
    const { source, calls } = sourceWith(() => ok(page([], 99, 0)))
    const { events } = await source.listRange({ from: '2026-10-01', to: '2026-10-31' })
    expect(events).toHaveLength(0)
    expect(calls).toHaveLength(1)
  })

  it('serves a repeated range from cache, and fetches a different one', async () => {
    const { source, calls } = sourceWith(() => ok(page([row()])))
    await source.listRange({ from: '2026-10-01', to: '2026-10-31' })
    await source.listRange({ from: '2026-10-01', to: '2026-10-31' })
    expect(calls).toHaveLength(1)
    await source.listRange({ from: '2026-11-01', to: '2026-11-30' })
    expect(calls).toHaveLength(2)
  })

  it('fetches again once the entry is stale', async () => {
    let clock = NOW.getTime()
    const { source, calls } = sourceWith(
      () => ok(page([row()])),
      () => new Date(clock),
    )
    await source.listRange({ from: '2026-10-01', to: '2026-10-31' })
    clock += 6 * 60 * 1000
    await source.listRange({ from: '2026-10-01', to: '2026-10-31' })
    expect(calls).toHaveLength(2)
  })

  // A wrong key is somebody's settings and will not recover by retrying.
  it.each([401, 403])('raises unauthorized on HTTP %i', async (status) => {
    const { source } = sourceWith(() => new Response('', { status }))
    await expect(source.listRange({ from: '2026-10-01', to: '2026-10-31' })).rejects.toBeInstanceOf(
      EventsUnauthorizedError,
    )
  })

  it('names a refused request rather than reporting it as a generic outage', async () => {
    const { source } = sourceWith(() => new Response('', { status: 422 }))
    const err = source.listRange({ from: '2026-10-31', to: '2026-10-01' })
    await expect(err).rejects.toBeInstanceOf(EventsUnavailableError)
    await expect(err).rejects.toThrow(/HTTP 422.*missing service-key header.*over 93 days/)
  })

  it('names the rate limit rather than reporting it as a generic outage', async () => {
    const { source } = sourceWith(() => new Response('', { status: 429 }))
    const err = source.listRange({ from: '2026-10-01', to: '2026-10-31' })
    await expect(err).rejects.toBeInstanceOf(EventsUnavailableError)
    await expect(err).rejects.toThrow(/HTTP 429.*60 requests a minute/)
  })

  it.each([500, 502])('raises unavailable on HTTP %i', async (status) => {
    const { source } = sourceWith(() => new Response('', { status }))
    await expect(source.listRange({ from: '2026-10-01', to: '2026-10-31' })).rejects.toBeInstanceOf(
      EventsUnavailableError,
    )
  })

  // "Unavailable" and "no events" look identical on a grid and only one of
  // them means the reader can stop worrying about Friday.
  it('raises rather than returning an empty range on an unexpected shape', async () => {
    const { source } = sourceWith(() => ok({ data: [row()] }))
    await expect(source.listRange({ from: '2026-10-01', to: '2026-10-31' })).rejects.toBeInstanceOf(
      EventsUnavailableError,
    )
  })

  it('does not cache a failure', async () => {
    let fail = true
    const { source, calls } = sourceWith(() =>
      fail ? new Response('', { status: 500 }) : ok(page([row()])),
    )
    await expect(source.listRange({ from: '2026-10-01', to: '2026-10-31' })).rejects.toThrow()
    fail = false
    expect((await source.listRange({ from: '2026-10-01', to: '2026-10-31' })).events).toHaveLength(
      1,
    )
    expect(calls).toHaveLength(2)
  })

  it('reads the outlets, and caches them longer than a range', async () => {
    const { source, calls } = sourceWith(() =>
      ok(page([{ id: 'o-1', slug: 'temper', name: 'Temper' }])),
    )
    expect(await source.listOutlets()).toEqual([{ id: 'o-1', slug: 'temper', name: 'Temper' }])
    await source.listOutlets()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/api/v1/internal/marketing/outlets')
  })

  it('drops an outlet with no slug, because the slug is what a person checks', async () => {
    const { source } = sourceWith(() =>
      ok(
        page([
          { id: 'o-1', name: 'No slug' },
          { id: 'o-2', slug: 'willow', name: 'Willow' },
        ]),
      ),
    )
    expect(await source.listOutlets()).toEqual([{ id: 'o-2', slug: 'willow', name: 'Willow' }])
  })
})
