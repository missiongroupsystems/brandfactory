import { describe, expect, it } from 'vitest'
import { MAX_TOKENS } from './gateway'
import { patch } from './prompt'

/**
 * The runtime's own cap on a request's answer (`clampMaxTokensToContext` in its pi-ai layer):
 * what is left of the context window after its estimate of the prompt and 4,096 tokens, and
 * never less than 1.
 */
const answerRoom = (window: number, prompt: number) =>
  Math.min(MAX_TOKENS, Math.max(1, window - prompt - 4096))

const windowOf = (yaml: string) => Number(/contextWindow: (\d+)/.exec(yaml)?.[1])

describe('what the runtime is told about the model', () => {
  const told = windowOf(patch({ persona: 'p', mcpUrl: 'http://core/mcp/brandbase', server: 's' }))

  it('leaves a full answer after a brand’s whole state', () => {
    // Measured: a question on a brand with history sent 93,676 prompt tokens after one
    // `brand.state`. At a 65,536 window the runtime asked for one token and the turn ended on
    // `max-tokens` with no answer.
    expect(answerRoom(65_536, 93_676)).toBe(1)
    expect(answerRoom(told, 93_676)).toBe(MAX_TOKENS)
    // A second state in the same chat still leaves a full answer.
    expect(answerRoom(told, 93_676 + 80_000)).toBe(MAX_TOKENS)
  })

  it('never claims more than the smallest host gives the model', () => {
    // Alibaba's window is the smallest of `BUBBLES_PROVIDERS`: 1,000,000 tokens.
    expect(told).toBeLessThanOrEqual(1_000_000)
  })
})
