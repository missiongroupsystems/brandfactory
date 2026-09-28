import { describe, expect, it } from 'vitest'
import {
  createMissionEventsSource,
  foldStatus,
  inferAllDay,
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
    date_start: '2026-10-20T19:00:00',
    date_end: '2026-10-20T23:00:00',
    outlet_id: '22222222-2222-4222-8222-222222222222',
    outlet_name: 'temper. Duxton',
    room_name: 'Terrace',
    ...over,
  }
}

describe('parseSourceInstant', () => {
  // The source stores naive timestamps that *hold* UTC. Read as local time in
  // Singapore that is an eight-hour shift, which moves an evening event into
  // the small hours of the next day — a wrong grid cell, silently.
  it('reads a zoneless timestamp as UTC, not as local time', () => {
    expect(parseSourceInstant('2026-10-20T19:00:00')?.toISOString()).toBe(
      '2026-10-20T19:00:00.000Z',
    )
  })

  it('leaves an explicit zone alone', () => {
    expect(parseSourceInstant('2026-10-20T19:00:00Z')?.toISOString()).toBe(
      '2026-10-20T19:00:00.000Z',
    )
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

  // Nothing in the source moves an event to `completed` when its date passes,
  // so a past confirmed event is still `confirmed` there — and a calendar that
  // drew it as upcoming would announce a party that already happened.
  it('folds a finished confirmed event to completed', () => {
    expect(foldStatus('confirmed', past, NOW)).toBe('completed')
  })

  it('leaves an upcoming confirmed event alone', () => {
    expect(foldStatus('confirmed', future, NOW)).toBe('confirmed')
  })

  it('keeps completed completed, whenever it was', () => {
    expect(foldStatus('completed', future, NOW)).toBe('completed')
  })

  // A tentative event in the past is not a thing that happened — it is a thing
  // that never firmed up, and that difference is why the team asked to see
  // tentatives at all.
  it('never folds tentative, past or future', () => {
    expect(foldStatus('tentative', past, NOW)).toBe('tentative')
    expect(foldStatus('tentative', future, NOW)).toBe('tentative')
  })

  it('drops the statuses the share link was scoped to exclude', () => {
    expect(foldStatus('inquiry', future, NOW)).toBeNull()
    expect(foldStatus('cancelled', future, NOW)).toBeNull()
    expect(foldStatus('lost', future, NOW)).toBeNull()
  })
})

describe('inferAllDay', () => {
  it('reads midnight with no end as all day', () => {
    expect(inferAllDay(new Date('2026-10-20T00:00:00Z'), null)).toBe(true)
  })

  it('reads midnight to 23:59 as all day, across several days', () => {
    expect(inferAllDay(new Date('2026-10-02T00:00:00Z'), new Date('2026-10-11T23:59:00Z'))).toBe(
      true,
    )
  })

  it('does not call an evening booking all day', () => {
    expect(inferAllDay(new Date('2026-10-20T19:00:00Z'), new Date('2026-10-20T23:00:00Z'))).toBe(
      false,
    )
  })

  it('does not call a midnight-to-evening event all day', () => {
    expect(inferAllDay(new Date('2026-10-20T00:00:00Z'), new Date('2026-10-20T18:00:00Z'))).toBe(
      false,
    )
  })
})

describe('toExternalEvent', () => {
  it('maps a booking, carrying the outlet and the room', () => {
    const e = toExternalEvent(row(), NOW)
    expect(e).toMatchObject({
      name: 'F1 terrace night',
      status: 'confirmed',
      eventType: 'private',
      start: '2026-10-20T19:00:00.000Z',
      end: '2026-10-20T23:00:00.000Z',
      allDay: false,
      outletName: 'temper. Duxton',
      roomName: 'Terrace',
    })
  })

  // Every dropped row is a marker the calendar does not draw, which is the
  // right failure: a day with an unexplainable marker costs more trust than a
  // day with one fewer.
  it.each([
    ['no id', { id: null }],
    ['no name', { name: '' }],
    ['no outlet', { outlet_id: undefined }],
    ['an unparseable start', { date_start: 'next Friday' }],
    ['a status outside the scope', { status: 'cancelled' }],
  ])('drops a row with %s', (_label, over) => {
    expect(toExternalEvent(row(over), NOW)).toBeNull()
  })

  it('names an outlet it was not given rather than dropping the event', () => {
    expect(toExternalEvent(row({ outlet_name: null }), NOW)?.outletName).toBe('Unknown outlet')
  })
})

describe('createMissionEventsSource', () => {
  function sourceWith(handler: (url: string) => Promise<Response> | Response, now = () => NOW) {
    const calls: string[] = []
    const fetchImpl = ((url: string) => {
      calls.push(url)
      return Promise.resolve(handler(url))
    }) as unknown as typeof fetch
    return {
      calls,
      source: createMissionEventsSource({
        baseUrl: 'https://events.example.com/',
        token: 'tok-123',
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

  it('asks the share-link month endpoint, with the trailing slash trimmed', async () => {
    const { source, calls } = sourceWith(() => ok([row()]))
    const { events } = await source.listMonth({ year: 2026, month: 10 })
    expect(calls[0]).toBe(
      'https://events.example.com/api/v1/public/calendar/tok-123/month?year=2026&month=10',
    )
    expect(events).toHaveLength(1)
  })

  it('accepts both the bare array and the data envelope', async () => {
    const bare = sourceWith(() => ok([row()]))
    const wrapped = sourceWith(() => ok({ data: [row()] }))
    expect((await bare.source.listMonth({ year: 2026, month: 10 })).events).toHaveLength(1)
    expect((await wrapped.source.listMonth({ year: 2026, month: 10 })).events).toHaveLength(1)
  })

  // The cache *is* the rate limit: 60 requests a minute per link, and one
  // person scrolling a quarter would otherwise spend it.
  it('serves a repeated month from cache, and fetches a different one', async () => {
    const { source, calls } = sourceWith(() => ok([row()]))
    await source.listMonth({ year: 2026, month: 10 })
    await source.listMonth({ year: 2026, month: 10 })
    expect(calls).toHaveLength(1)
    await source.listMonth({ year: 2026, month: 11 })
    expect(calls).toHaveLength(2)
  })

  it('fetches again once the entry is stale', async () => {
    let clock = NOW.getTime()
    const { source, calls } = sourceWith(
      () => ok([row()]),
      () => new Date(clock),
    )
    await source.listMonth({ year: 2026, month: 10 })
    clock += 6 * 60 * 1000
    await source.listMonth({ year: 2026, month: 10 })
    expect(calls).toHaveLength(2)
  })

  // A revoked token will not recover by retrying, and the operator response is
  // different from a blip — so it is a different error.
  it.each([401, 403, 404])('raises unauthorized on HTTP %i', async (status) => {
    const { source } = sourceWith(() => new Response('', { status }))
    await expect(source.listMonth({ year: 2026, month: 10 })).rejects.toBeInstanceOf(
      EventsUnauthorizedError,
    )
  })

  it.each([429, 500, 502])('raises unavailable on HTTP %i', async (status) => {
    const { source } = sourceWith(() => new Response('', { status }))
    await expect(source.listMonth({ year: 2026, month: 10 })).rejects.toBeInstanceOf(
      EventsUnavailableError,
    )
  })

  it('raises unavailable when the transport fails', async () => {
    const fetchImpl = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch
    const source = createMissionEventsSource({
      baseUrl: 'https://events.example.com',
      token: 't',
      fetchImpl,
      now: () => NOW,
    })
    await expect(source.listMonth({ year: 2026, month: 10 })).rejects.toBeInstanceOf(
      EventsUnavailableError,
    )
  })

  // "Unavailable" and "no events" look identical on a grid, and only one of
  // them means the reader can stop worrying about Friday.
  it('raises rather than returning an empty month when the body is the wrong shape', async () => {
    const { source } = sourceWith(() => ok({ events: 'nope' }))
    await expect(source.listMonth({ year: 2026, month: 10 })).rejects.toBeInstanceOf(
      EventsUnavailableError,
    )
  })

  it('does not cache a failure', async () => {
    let fail = true
    const { source, calls } = sourceWith(() =>
      fail ? new Response('', { status: 500 }) : ok([row()]),
    )
    await expect(source.listMonth({ year: 2026, month: 10 })).rejects.toBeInstanceOf(
      EventsUnavailableError,
    )
    fail = false
    expect((await source.listMonth({ year: 2026, month: 10 })).events).toHaveLength(1)
    expect(calls).toHaveLength(2)
  })
})
