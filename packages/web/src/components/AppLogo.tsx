import { cn } from '@/lib/utils'

// The Mission Systems mark. BrandFactory ships under the Mission Systems CI and
// has no product logo of its own, so the umbrella icon stands in — the same way
// each sibling app (Grapestack, Workforce) carries its own. Source SVG:
// "Mission Systems/All systems/Branding/MS-Branding-blk-icon.svg", re-fitted to
// `currentColor` so the parent decides the ink (brand green here) and it themes
// in both light and dark.
export function AppLogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      role="img"
      aria-label="Mission Systems"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M34.3562 85.569C24.2819 85.2261 14.8807 83.6534 5.59774 80.6144C4.07419 80.1178 2.44435 78.4741 1.96012 77.0788C5.20799 74.1108 9.4007 73.153 13.4871 72.3489L26.5376 69.7829L13.2273 67.619C8.9519 66.9213 5.04265 65.6797 0.932614 63.835C-0.7799 61.0089 0.164935 53.311 1.38141 49.1487C3.47186 42.0183 6.36542 35.0653 10.8416 29.1529C15.9201 22.4483 21.908 16.796 29.1478 12.7047C48.4814 1.80222 67.2364 1.18733 87.3142 10.5999C99.2663 16.2048 108.266 25.9721 114.49 37.6313C118.553 45.2465 120.194 54.0914 119.982 62.6289C119.415 63.4803 117.738 64.8756 116.852 65.1358C109.14 67.4534 101.841 68.3639 93.5973 69.7829C101.782 72.0178 114.1 71.6749 118.399 77.5991C114.537 82.0334 103.648 83.7007 96.6444 84.5048C82.6845 86.1248 68.8308 86.716 54.7764 86.243L34.3562 85.5572V85.569Z"
        fill="currentColor"
      />
      <path
        d="M76.1896 103.235C65.9736 104.24 56.0056 104.134 46.0494 103.247L30.9675 101.899C24.7315 101.343 12.5077 99.2739 12.3424 96.0694C12.2007 93.2551 22.8064 91.4104 28.8298 90.6891C32.2784 90.2752 35.8452 89.6604 39.3765 89.5421C53.2656 89.0928 66.883 88.9863 80.7484 89.5894C88.3308 89.9205 105.586 91.9425 107.653 95.6555C109.389 98.7654 95.1099 101.367 88.2363 102.041L76.1896 103.223V103.235Z"
        fill="currentColor"
      />
      <path
        d="M84.6455 112.708C89.039 116.634 32.7977 117.58 35.4905 112.59C35.7149 112.165 36.6715 111.514 37.1794 111.443L43.8877 110.414C47.6316 109.835 51.2928 109.693 55.1194 109.67L63.9418 109.599C70.5911 109.729 76.8861 110.202 83.3582 111.585L84.6337 112.72L84.6455 112.708Z"
        fill="currentColor"
      />
    </svg>
  )
}

// The full lockup used on the sign-in surface: the mark beside the product
// wordmark, both carried in the one brand green (`text-primary`), the way the
// sibling apps set their own logo. The wordmark is set text, not vector,
// because there is no BrandFactory wordmark asset — only the umbrella icon.
export function AppLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 text-primary', className)}>
      <AppLogoIcon className="h-8 w-8 shrink-0" />
      <span className="text-3xl font-bold tracking-tight">BrandFactory</span>
    </div>
  )
}
