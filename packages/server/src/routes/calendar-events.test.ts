import type { ExternalEvent } from '@brandfactory/shared'
import { EventsUnauthorizedError, EventsUnavailableError } from '@brandfactory/adapter-events'
import { describe, expect, it } from 'vitest'
import { rangeDays } from './calendar-events'
import { createTestApp } from '../test-helpers'

const OUTLET_A = '22222222-2222-4222-8222-222222222222'
const OUTLET_B = '33333333-3333-4333-8333-333333333333'

function event(over: Partial<ExternalEvent> = {}): ExternalEvent {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'F1 terrace night',
    status: 'confirmed',
    eventType: 'private',
    start: '2026-10-20T19:00:00.000Z',
    end: '2026-10-20T23:00:00.000Z',
    allDay: false,
    outletId: OUTLET_A,
    outletName: 'temper. Duxton',
    roomName: 'Terrace',
    guestCount: 80,
    ...over,
  }
}

describe('rangeDays', () => {
  it('counts both ends of the range', () => {
    expect(rangeDays('2026-10-01', '2026-10-01')).toBe(1)
    expect(rangeDays('2026-10-01', '2026-10-31')).toBe(31)
  })

  it('counts across a month and a year boundary', () => {
    expect(rangeDays('2026-09-28', '2026-11-01')).toBe(35)
    expect(rangeDays('2026-12-28', '2027-01-03')).toBe(7)
  })
})

describe('GET /workspaces/:id/calendar/events', () => {
  const USER = { id: 'u-1', token: 't-1' }
  const auth = () => ({ authorization: `Bearer ${USER.token}`, 'content-type': 'application/json' })

  async function seed(listRange: () => Promise<{ events: ExternalEvent[] }>) {
    const harness = createTestApp({
      users: [USER],
      events: { listRange, listOutlets: () => Promise.resolve([]) },
    })
    const { app } = harness
    const ws = (await (
      await app.request('/workspaces', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'W' }),
      })
    ).json()) as { id: string }
    const brand = (await (
      await app.request(`/workspaces/${ws.id}/brands`, {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ name: 'B' }),
      })
    ).json()) as { id: string }
    return { ...harness, workspaceId: ws.id, brandId: brand.id }
  }

  async function mapOutlet(
    app: ReturnType<typeof createTestApp>['app'],
    brandId: string,
    outletId: string,
  ) {
    return app.request(`/brands/${brandId}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ eventsOutletId: outletId }),
    })
  }

  const range = (workspaceId: string, from = '2026-10-01', to = '2026-10-31') =>
    `/workspaces/${workspaceId}/calendar/events?from=${from}&to=${to}`

  it('attributes an event to the brand its outlet maps to', async () => {
    const { app, workspaceId, brandId } = await seed(() => Promise.resolve({ events: [event()] }))
    expect((await mapOutlet(app, brandId, OUTLET_A)).status).toBe(200)

    const res = await app.request(range(workspaceId), { headers: auth() })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      events: (ExternalEvent & { brandId: string })[]
      unmappedOutlets: number
      configured: boolean
    }
    expect(body.events).toHaveLength(1)
    expect(body.events[0]?.brandId).toBe(brandId)
    expect(body.unmappedOutlets).toBe(0)
    // `testEnv` leaves EVENTS_PROVIDER at its default, so the screen is told
    // the layer is off even though this test injected a source.
    expect(body.configured).toBe(false)
  })

  // A dropped event that nobody counts is an event that silently never
  // appears; the number is what turns a missing mapping into something a
  // person can see and fix.
  it('drops an event whose outlet maps to nothing, and counts it', async () => {
    const { app, workspaceId } = await seed(() =>
      Promise.resolve({ events: [event({ outletId: OUTLET_B })] }),
    )
    const body = (await (await app.request(range(workspaceId), { headers: auth() })).json()) as {
      events: unknown[]
      unmappedOutlets: number
    }
    expect(body.events).toHaveLength(0)
    expect(body.unmappedOutlets).toBe(1)
  })

  // The source's own limit is 93 days. Refusing here means a caller learns it
  // from us rather than from a 422 they cannot interpret.
  it('400s on a range longer than the source will answer', async () => {
    const { app, workspaceId } = await seed(() => Promise.resolve({ events: [] }))
    const res = await app.request(range(workspaceId, '2026-01-01', '2026-12-31'), {
      headers: auth(),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('RANGE_TOO_LONG')
  })

  // "Unavailable" and "no events booked" look identical on a grid and mean
  // opposite things, so a broken feed must not render as an empty one.
  it('502s rather than answering with an empty month when the source is unreachable', async () => {
    const { app, workspaceId } = await seed(() => Promise.reject(new EventsUnavailableError()))
    const res = await app.request(range(workspaceId), { headers: auth() })
    expect(res.status).toBe(502)
    expect(((await res.json()) as { code: string }).code).toBe('EVENTS_UNAVAILABLE')
  })

  it('distinguishes a refused share link, which will not recover on its own', async () => {
    const { app, workspaceId } = await seed(() => Promise.reject(new EventsUnauthorizedError()))
    const res = await app.request(range(workspaceId), { headers: auth() })
    expect(res.status).toBe(502)
    expect(((await res.json()) as { code: string }).code).toBe('EVENTS_UNAUTHORIZED')
  })

  it('400s on a range that runs backwards', async () => {
    const { app, workspaceId } = await seed(() => Promise.resolve({ events: [] }))
    const res = await app.request(range(workspaceId, '2026-10-31', '2026-10-01'), {
      headers: auth(),
    })
    expect(res.status).toBe(400)
  })
})
