import type { Metadata } from 'next'
import { Geist_Mono, Instrument_Sans, Instrument_Serif } from 'next/font/google'

import { BrandProvider } from '@/features/schedule/posts-store'

import './globals.css'

const sans = Instrument_Sans({
  variable: '--font-instrument-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})
const serif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
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
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable} antialiased`}>
      <body className="min-h-svh font-sans text-sm leading-[1.45]">
        <BrandProvider>{children}</BrandProvider>
      </body>
    </html>
  )
}
