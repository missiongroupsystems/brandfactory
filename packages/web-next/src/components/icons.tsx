/** Stroke icons drawn for this demo. Decorative unless a caller labels the control. */

export function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2 2L10 10M10 2L2 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CropIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 0.5V9H11.5M0.5 3H9V11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 1.5V12.5M1.5 7H12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CheckIcon({
  size = 9,
  strokeWidth = 1.8,
}: {
  size?: number
  strokeWidth?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.3L5 8.7L9.5 3.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronIcon({ open = false, size = 9 }: { open?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="transition-transform duration-[260ms]"
      style={{ transform: open ? 'rotate(180deg)' : undefined }}
    >
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SparkIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M6 0C6.6 3.6 8.4 5.4 12 6C8.4 6.6 6.6 8.4 6 12C5.4 8.4 3.6 6.6 0 6C3.6 5.4 5.4 3.6 6 0Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Two sliders: what the calendar shows. */
export function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 5h11M2.5 11h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6" cy="5" r="1.9" fill="var(--page)" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="11" r="1.9" fill="var(--page)" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function ReelIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M3 8.5H21M8.5 3L11.5 8.5M14.5 3L17.5 8.5" />
      <path d="M10 12.2V17.3L14.6 14.75Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CarouselIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="3" width="13" height="13" rx="3" fill="currentColor" />
      <path d="M16.5 21H6.5A3.5 3.5 0 0 1 3 17.5V7.5" />
    </svg>
  )
}

export function StoryIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 0 1 9 9M21 12a9 9 0 0 1-9 9M12 21a9 9 0 0 1-9-9" />
      <path d="M3 12a9 9 0 0 1 9-9" strokeDasharray="2 3.2" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function PlayIcon() {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true">
      <path d="M1 1V9L8 5Z" fill="currentColor" />
    </svg>
  )
}

export function UploadIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 13V3M6 7L10 3L14 7M3 13V15.5A1.5 1.5 0 0 0 4.5 17H15.5A1.5 1.5 0 0 0 17 15.5V13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Two photos, one behind the other: pick from what is already saved. */
export function PhotosIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect
        x="1"
        y="3.5"
        width="7.5"
        height="7.5"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M3.5 1H9.4A1.6 1.6 0 0 1 11 2.6V8.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="14" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="9" r="4.6" fill="currentColor" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
