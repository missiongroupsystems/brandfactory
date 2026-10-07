import type { Metadata } from 'next'
import { Geist, Geist_Mono, Instrument_Sans } from 'next/font/google'

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
  description: 'Plan, make and publish for Casa Vostra.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable} antialiased`}>
      <body className="min-h-svh font-sans text-sm leading-[1.45]">
        <BrandProvider>{children}</BrandProvider>
      </body>
    </html>
  )
}
