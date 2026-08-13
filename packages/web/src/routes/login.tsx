import { createRoute, redirect } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { getAuthToken } from '@/auth/store'
import { LocalAuthProvider } from '@/auth/providers/local'
import { SupabaseAuthProvider } from '@/auth/providers/supabase'
import { AppLogo } from '@/components/AppLogo'

function LoginPage() {
  const provider = import.meta.env.VITE_AUTH_PROVIDER
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AppLogo />
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight">Brand Operating System</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue</p>
          </div>
        </div>
        {provider === 'supabase' ? <SupabaseAuthProvider /> : <LocalAuthProvider />}
      </div>
    </div>
  )
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: () => {
    if (getAuthToken()) throw redirect({ to: '/' })
  },
  component: LoginPage,
})
