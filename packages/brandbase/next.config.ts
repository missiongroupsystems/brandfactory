import type { NextConfig } from 'next'

// A UI-only demo: no API, no rewrites. The dev badge would sit over the page corner.
const nextConfig: NextConfig = {
  devIndicators: false,
}

export default nextConfig
