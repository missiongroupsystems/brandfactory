import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

/**
 * Satoshi is the one Mission Systems typeface (styleguide §1.1). Self-hosted from
 * `src/app/fonts/` rather than a CDN: `next/font/local` emits the `@font-face` rules, hashes
 * the files, preloads them and computes fallback metrics, so the weight mapping below is the
 * only thing to keep in step with the styleguide.
 */
const satoshi = localFont({
  src: [
    { path: "./fonts/satoshi/Satoshi-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/satoshi/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/satoshi/Satoshi-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/satoshi/Satoshi-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/satoshi/Satoshi-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

/** The one sanctioned second face (§5.4) — UENs, licence numbers, endpoints. Never prose. */
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Marketing Hub — Mission Systems",
  description: "The Brand Operating System. Define the brand once; every surface inherits it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${satoshi.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
