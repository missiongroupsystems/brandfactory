import type { NextConfig } from 'next'

// A UI-only demo unless NEXT_PUBLIC_CORE_URL names the core. The dev badge would sit over the page
// corner.
const nextConfig: NextConfig = {
  devIndicators: false,
  // With the core on, uploads are served from it (and from storage behind it), hosts the image
  // optimiser would each have to allow; images then load as they are.
  ...(process.env.NEXT_PUBLIC_CORE_URL && { images: { unoptimized: true } }),
}

export default nextConfig
