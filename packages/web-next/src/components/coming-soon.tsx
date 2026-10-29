import { AppHeader } from './app-header'
import { TITLE } from './page-title'

/** A screen the nav shows that the demo does not cover yet. */
export function ComingSoon({ title, line }: { title: string; line: string }) {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-32 text-center">
        <h1 className={`bb-rise ${TITLE}`}>{title}</h1>
        <p className="bb-rise text-[15px] text-ink-3" style={{ animationDelay: '120ms' }}>
          {line}
        </p>
      </main>
    </div>
  )
}
