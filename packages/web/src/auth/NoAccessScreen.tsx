import { Button } from '@/components/ui/button'

/**
 * A terminal screen for somebody holding a valid session and no access. The
 * Vite app's copy of `packages/web-next/src/features/me/no-access-screen.tsx`,
 * for the same reason the set-password screen is duplicated: both frontends are
 * deployed.
 *
 * Two causes, two sentences — `NO_ACCOUNT` and `ACCOUNT_DEACTIVATED`. *You were
 * never added* and *your access was withdrawn* are different news, and an
 * administrator reading the support message that follows needs to know which.
 */
export function NoAccessScreen({
  reason,
  onSignOut,
}: {
  reason: 'NO_ACCOUNT' | 'ACCOUNT_DEACTIVATED'
  onSignOut: () => void
}) {
  const body =
    reason === 'ACCOUNT_DEACTIVATED'
      ? 'Your access to Brand Base has been withdrawn. An administrator can restore it.'
      : 'You signed in successfully, but this address has no Brand Base account. An administrator has to add you.'

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-lg font-medium">No access</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        <Button type="button" variant="secondary" className="w-full" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
