import type { NextConfig } from 'next'

// A UI-only demo unless NEXT_PUBLIC_API_URL names the API or NEXT_PUBLIC_CORE_URL the core. The
// dev badge would sit over the page corner.
const nextConfig: NextConfig = {
  devIndicators: false,
  // With a backend on, uploads are served from it (and from storage behind it), hosts the image
  // optimiser would each have to allow; images then load as they are.
  ...((process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_CORE_URL) && {
    images: { unoptimized: true },
  }),
}

export default nextConfig
