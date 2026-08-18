import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LocalOnlyBadge } from './LocalOnlyBadge'
import { LocalOnlyDot } from './LocalOnlyDot'
import { PassportLinkageTestProvider } from './linkage'

/**
 * The "local only" signal.
 *
 * Plan: phase 8f. Decision: proposal §8 `D1-b`.
 *
 * ## The property worth the test
 *
 * **The badge is silent when Passport is not in play.** That is not an optimisation — it is
 * what stops the badge appearing on every brand in the app, for ever, in every deployment
 * that has no Passport. A label that is always on stops being read, and by the time one brand
 * genuinely is local-only nobody sees it.
 *
 * The failure is invisible in a screenshot of a Passport-enabled workspace, where the badge
 * looks right. It only shows up on a self-hosted install, where every row wears it.
 */

function withLinkage(meaningful: boolean, ui: React.ReactNode) {
  return render(<PassportLinkageTestProvider value={meaningful}>{ui}</PassportLinkageTestProvider>)
}

describe('LocalOnlyBadge', () => {
  it('labels an unlinked brand when the workspace IS a Passport organisation', () => {
    withLinkage(true, <LocalOnlyBadge linked={false} />)
    expect(screen.getByText(/local only/i)).toBeTruthy()
  })

  it('says nothing for a LINKED brand', () => {
    withLinkage(true, <LocalOnlyBadge linked={true} />)
    expect(screen.queryByText(/local only/i)).toBeNull()
  })

  it('⚠️ says nothing when Passport is not in play, even for an unlinked brand', () => {
    // The case that matters. Today, and on every self-hosted install, NO brand is linked —
    // so without this gate every brand in the app wears the badge and it means nothing.
    withLinkage(false, <LocalOnlyBadge linked={false} />)
    expect(screen.queryByText(/local only/i)).toBeNull()
  })

  it('defaults to silent with no provider at all', () => {
    // A surface rendered outside the shell — a test, a page with no workspace — must not
    // guess. Silence is the safe direction: a missing badge is milder than a badge on forty
    // brands.
    render(<LocalOnlyBadge linked={false} />)
    expect(screen.queryByText(/local only/i)).toBeNull()
  })

  it('reads as a state, not an error', () => {
    // `D1-b` exists so this situation is normal. It must not wear error styling or announce
    // itself as an alert.
    withLinkage(true, <LocalOnlyBadge linked={false} />)
    const badge = screen.getByText(/local only/i)
    expect(badge.getAttribute('role')).toBeNull()
    expect(badge.className).not.toMatch(/destructive|danger|error/)
    // It explains the consequence, which is discoverable nowhere else in the UI.
    expect(badge.getAttribute('title')).toMatch(/other mission systems apps cannot see it/i)
  })
})

describe('LocalOnlyDot — the rail', () => {
  it('puts the state INSIDE the accessible name, not beside it', () => {
    // One node, one label. A reader taking "Casa Vostra" from one element and "local only"
    // from a sibling has no reliable ordering — and in a rail of forty tiles the suffix could
    // attach to the wrong brand.
    withLinkage(true, <LocalOnlyDot linked={false} name="Casa Vostra" />)
    expect(screen.getByText('Casa Vostra (local only)')).toBeTruthy()
    expect(screen.queryByText('Casa Vostra')).toBeNull()
  })

  it('gives a linked brand its plain name', () => {
    withLinkage(true, <LocalOnlyDot linked={true} name="Casa Vostra" />)
    expect(screen.getByText('Casa Vostra')).toBeTruthy()
  })

  it('gives the plain name when Passport is not in play', () => {
    withLinkage(false, <LocalOnlyDot linked={false} name="Casa Vostra" />)
    expect(screen.getByText('Casa Vostra')).toBeTruthy()
  })

  it('never drops the name, whatever the state', () => {
    // The dot replaced the tile's `sr-only` name, so losing it here would leave the rail as
    // forty unlabelled squares — and nothing would fail except a screen reader.
    for (const [meaningful, linked] of [
      [true, true],
      [true, false],
      [false, false],
    ] as const) {
      const { unmount } = withLinkage(meaningful, <LocalOnlyDot linked={linked} name="Acme" />)
      expect(screen.getByText(/^Acme/)).toBeTruthy()
      unmount()
    }
  })

  it('hides the dot from the accessibility tree, because the name already says it', () => {
    const { container } = withLinkage(true, <LocalOnlyDot linked={false} name="Acme" />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
})
