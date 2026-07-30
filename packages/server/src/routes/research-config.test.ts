import { describe, expect, it } from 'vitest'
import { createTestApp } from '../test-helpers'

describe('GET /research', () => {
  it('reports research as available when a provider is configured', async () => {
    const { app } = createTestApp({
      users: [{ id: 'u-1', token: 't-1' }],
      env: { RESEARCH_PROVIDER: 'perplexity', PERPLEXITY_API_KEY: 'k' },
    })
    const res = await app.request('/research', { headers: { authorization: 'Bearer t-1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: true })
  })

  it('reports research as unavailable on the shipped default', async () => {
    const { app } = createTestApp({
      users: [{ id: 'u-1', token: 't-1' }],
      env: { RESEARCH_PROVIDER: 'none' },
    })
    const res = await app.request('/research', { headers: { authorization: 'Bearer t-1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false })
  })

  it('requires auth', async () => {
    const { app } = createTestApp({ users: [{ id: 'u-1', token: 't-1' }] })
    const res = await app.request('/research')
    expect(res.status).toBe(401)
  })
})
