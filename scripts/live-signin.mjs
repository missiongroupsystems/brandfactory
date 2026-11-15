#!/usr/bin/env node
// Signs in to the live app with the test sign-in and saves the browser's state, so later
// Playwright tests start signed in (docs/cloud-sessions.md).
//
//   node scripts/live-signin.mjs                 # saves the state to the default path
//   node scripts/live-signin.mjs --shot out.png  # also a screenshot of the Schedule page
//
// Reads QA_EMAIL and QA_PASSWORD from the environment and never prints the password. The state
// holds a session token: it is written outside the repository (LIVE_STATE, default
// ~/.cache/brandbase/live-state.json), readable by its owner only. A test opens it with
// `browser.newContext({ storageState: <path> })`.
import { chmodSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'

// The image's Playwright resolves through NODE_PATH, which only require() reads.
const { chromium } = createRequire(import.meta.url)('playwright')

const APP = process.env.LIVE_URL ?? 'https://branding.missionsystems.ai'
const STATE =
  process.env.LIVE_STATE ?? path.join(homedir(), '.cache', 'brandbase', 'live-state.json')
const email = process.env.QA_EMAIL
const password = process.env.QA_PASSWORD
if (!email || !password) {
  console.error('Set QA_EMAIL and QA_PASSWORD (the environment settings hold them).')
  process.exit(1)
}
const shotAt = process.argv.indexOf('--shot')
const shot = shotAt > -1 ? process.argv[shotAt + 1] : null

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(`${APP}/sign-in`)
  await page.locator('input[type=email], input[name=email]').first().fill(email)
  await page.locator('input[type=password]').first().fill(password)
  await page.keyboard.press('Enter')
  // Signed in: the app leaves /sign-in and shows its navigation.
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30_000 })
    await page.getByRole('link', { name: 'Schedule' }).first().waitFor({ timeout: 30_000 })
  } catch {
    console.error(`The sign-in did not go through for ${email}. Check QA_EMAIL and QA_PASSWORD.`)
    process.exit(1)
  }
  mkdirSync(path.dirname(STATE), { recursive: true, mode: 0o700 })
  await context.storageState({ path: STATE })
  chmodSync(STATE, 0o600)
  console.log(`Signed in as ${email}. State saved to ${STATE}.`)

  if (shot) {
    // A fresh context from the saved state: the screenshot proves the state works on its own.
    const again = await browser.newContext({
      storageState: STATE,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    })
    const schedule = await again.newPage()
    await schedule.goto(`${APP}/`)
    await schedule.getByRole('link', { name: 'Schedule' }).first().waitFor({ timeout: 30_000 })
    await schedule.waitForLoadState('networkidle').catch(() => undefined)
    if (schedule.url().includes('/sign-in')) {
      console.error('The saved state did not keep the sign-in.')
      process.exit(1)
    }
    await schedule.screenshot({ path: shot })
    console.log(`Schedule page saved to ${shot}.`)
  }
} finally {
  await browser.close()
}
