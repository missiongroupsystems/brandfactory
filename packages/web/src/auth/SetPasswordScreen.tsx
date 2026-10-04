import { useState } from 'react'
import { PASSWORD_MIN_LENGTH, passwordProblem } from '@brandfactory/shared'
import { api, callVoid, queryClient } from '@/api/client'
import { meKeys } from '@/api/queries/me'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Choose your own password. The Vite app's copy of
 * `packages/web-next/src/features/me/set-password-screen.tsx`.
 *
 * **Both frontends need it because both are deployed.** A flagged account that
 * opened this app without it would meet `PASSWORD_NOT_SET` on every query and
 * read it as the product being broken. The duplication is deliberate and
 * temporary, like the rest of this package; the rule it must not break is that
 * the *validation* is not duplicated — `passwordProblem` is imported from
 * `@brandfactory/shared` here and there and on the server.
 *
 * ⚠️ **A courtesy, not the boundary.** The server refuses every other route
 * whether or not this renders. Deleting it would make the app rude, not open.
 */
export function SetPasswordScreen({ email }: { email: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problem = password ? passwordProblem(password, email) : null
  const mismatch = confirm.length > 0 && password !== confirm
  const ready = password.length > 0 && !problem && !mismatch && password === confirm

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready) return
    setError(null)
    setSubmitting(true)
    try {
      await callVoid(await api.me.password.$post({ json: { password } }))
      // Re-read `/me`: the flag is false now, so the boundary above renders the
      // app instead of this screen. There is no navigation to do.
      await queryClient.invalidateQueries({ queryKey: meKeys.me() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set your password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-1">
          <h1 className="text-lg font-medium">Choose your password</h1>
          <p className="text-sm text-muted-foreground">
            Your account was set up by an administrator, who chose a temporary password. Pick your
            own to continue.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="new-password-help"
              required
            />
            <p id="new-password-help" className="text-xs text-muted-foreground">
              At least {PASSWORD_MIN_LENGTH} characters. A short phrase works well.
            </p>
            {problem ? (
              <p role="alert" className="text-xs text-destructive">
                {problem}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {mismatch ? (
              <p role="alert" className="text-xs text-destructive">
                The two passwords do not match.
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={!ready || submitting}>
            {submitting ? 'Saving…' : 'Set password and continue'}
          </Button>
        </form>
      </div>
    </div>
  )
}
