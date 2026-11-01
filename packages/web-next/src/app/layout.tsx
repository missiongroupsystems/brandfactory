import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Instrument_Sans } from 'next/font/google'

import { NoImageDrag } from '@/components/no-image-drag'
import { RemoteSync } from '@/components/remote-sync'
import { SESSION_SCRIPT } from '@/components/session-class'
import { TabBar } from '@/components/tab-bar'
import { BrandProvider } from '@/features/schedule/posts-store'

import './globals.css'

const sans = Instrument_Sans({
  variable: '--font-instrument-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})
// Headings and hooks: Geist, the family of the mono labels, so the type reads as one system.
const display = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  weight: ['500', '600'],
})
const mono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'brand base',
  description:
    'A social media workspace for brands and their marketing teams: plan, make and post on one calendar.',
}

// The page runs under a phone's home bar; the tab bar pads itself clear of it.
export const viewport: Viewport = { viewportFit: 'cover' }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} antialiased`}
      // The head script may add the session class before React loads.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SESSION_SCRIPT }} />
      </head>
      <body className="min-h-svh font-sans text-sm leading-[1.45]">
        <NoImageDrag />
        <BrandProvider>
          <RemoteSync>
            {children}
            <TabBar />
          </RemoteSync>
        </BrandProvider>
      </body>
    </html>
  )
}
