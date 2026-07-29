import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      // §12.7 / §8 / §9: a toast is an overlay surface — 12px radius on the
      // ink-tinted elevation-2 ramp, not sonner's own black-based shadow.
      toastOptions={{ className: 'rounded-xl shadow-elevation-2' }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-border': 'var(--border)',
          '--normal-text': 'var(--popover-foreground)',
          '--success-bg': 'var(--popover)',
          '--success-border': 'var(--border)',
          '--success-text': 'var(--popover-foreground)',
          '--error-bg': 'var(--popover)',
          '--error-border': 'var(--border)',
          '--error-text': 'var(--popover-foreground)',
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
