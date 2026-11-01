import Image from 'next/image'
import Link from 'next/link'

import { FanArt } from '@/features/ideate/fan-art'

import { LogoMark } from './icons'
import { CONTACT } from './legal'

const PARTS = [
  {
    title: 'A calendar for each brand',
    body: 'Posts, stories and shoots by day and week, each with its time and platforms.',
  },
  {
    title: 'A shared moodboard',
    body: 'Pins from the brand’s Pinterest boards and the ideas the team collects, ready to become posts.',
  },
  {
    title: 'Drafts to TikTok',
    body: 'A finished video goes to the brand’s TikTok inbox as a draft. The team posts it from the TikTok app.',
  },
]

const TIKTOK_STEPS = [
  {
    title: 'Connect',
    body: 'A team member connects the brand’s TikTok account through TikTok’s own sign-in. brand base shows the account’s name and picture, so the team sees where videos go.',
  },
  {
    title: 'Send',
    body: 'On a planned video post, Send to TikTok inbox uploads the video to that account as a draft.',
  },
  {
    title: 'Finish in TikTok',
    body: 'The creator opens the draft in the TikTok app, edits it and posts it. brand base never posts to TikTok by itself.',
  },
]

/**
 * What a visitor with no sign-in sees at the app's address on the core: what brand base is and how
 * it uses TikTok, with Sign in, and the terms and the privacy policy in the header. TikTok's review
 * asks for a public site here, not a sign-in form, with those two links in view.
 */
export function Welcome() {
  return (
    <div className="flex min-h-svh flex-col bg-page">
      <header className="flex items-center justify-between px-10 py-[22px] max-md:px-4 max-md:py-3">
        <span className="flex items-center gap-2 text-ink">
          <LogoMark />
          <span className="text-[17px] font-semibold tracking-[-0.03em]">brand base</span>
        </span>
        <nav aria-label="Legal" className="flex gap-5 text-[13.5px] text-ink-3">
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col items-center gap-14 px-4 pt-16 pb-20 text-center max-md:gap-10 max-md:pt-8">
        <span aria-hidden="true" className="flex -space-x-6">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="relative block h-[132px] w-[100px] overflow-hidden rounded-[14px] bg-tile shadow-[0_0_0_3px_var(--page)] max-md:h-[106px] max-md:w-[80px]"
              style={{
                transform: `rotate(${[-8, -3, 3, 8][i]}deg) translateY(${[8, 0, 0, 8][i]}px)`,
              }}
            >
              <FanArt index={i} />
            </span>
          ))}
        </span>

        <div className="flex max-w-[620px] flex-col items-center gap-5">
          <h1 className="font-display text-[48px] leading-[1.05] tracking-[-0.03em] max-md:text-[34px]">
            Plan, make and post for every brand
          </h1>
          <p className="text-[17px] leading-[1.55] text-ink-3 max-md:text-[16px]">
            brand base is a social media workspace for brands and their marketing teams. A team
            plans each brand’s posts on one calendar and gets them ready for Instagram, Facebook and
            TikTok.
          </p>
          <Link
            href="/sign-in"
            className="bb-press mt-2 flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-page hover:opacity-85"
          >
            Sign in
          </Link>
        </div>

        <Image
          src="/home/calendar.webp"
          width={1600}
          height={635}
          priority
          alt="The brand base calendar: a week of planned posts, stories, events and ideas for one brand"
          className="w-full rounded-2xl shadow-[0_0_0_1px_var(--line),var(--shadow-soft)]"
        />

        <ul className="grid w-full grid-cols-3 gap-4 text-left max-md:grid-cols-1">
          {PARTS.map((p) => (
            <li key={p.title} className="flex flex-col gap-1.5 rounded-2xl bg-surface p-5">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{p.title}</h2>
              <p className="text-[14px] leading-[1.5] text-ink-3">{p.body}</p>
            </li>
          ))}
        </ul>

        <section aria-labelledby="tiktok" className="flex w-full flex-col items-center gap-8">
          <h2
            id="tiktok"
            className="font-display text-[28px] leading-[1.1] tracking-[-0.02em] max-md:text-[24px]"
          >
            How brand base works with TikTok
          </h2>
          <ol className="grid w-full grid-cols-3 gap-4 text-left max-md:grid-cols-1">
            {TIKTOK_STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-1.5 p-5">
                <span className="font-mono text-[12px] text-ink-4 tabular-nums">0{i + 1}</span>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{s.title}</h3>
                <p className="text-[14px] leading-[1.5] text-ink-3">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="max-w-[560px] text-[14px] leading-[1.5] text-ink-3">
            A connected account can be disconnected at any time in Connections. Disconnecting it
            deletes its access tokens.
          </p>
        </section>

        <section aria-labelledby="teams" className="flex max-w-[560px] flex-col items-center gap-3">
          <h2
            id="teams"
            className="font-display text-[28px] leading-[1.1] tracking-[-0.02em] max-md:text-[24px]"
          >
            For your team
          </h2>
          <p className="text-[15px] leading-[1.55] text-ink-3">
            Mission Group’s restaurant brands use brand base today. It is opening to more brands and
            marketing teams, with a free plan. Accounts are by invitation for now.
          </p>
          <a
            href={`mailto:${CONTACT}?subject=brand%20base%20access`}
            className="text-[15px] font-medium text-ink underline decoration-ink-5 underline-offset-4 hover:decoration-ink"
          >
            Ask for access
          </a>
        </section>
      </main>

      <footer className="flex flex-wrap justify-center gap-x-5 gap-y-2 px-4 pb-[calc(24px+env(safe-area-inset-bottom))] text-[13px] text-ink-3">
        <a href={`mailto:${CONTACT}`} className="hover:text-ink">
          {CONTACT}
        </a>
        <span>© 2026 Mission Group</span>
      </footer>
    </div>
  )
}
