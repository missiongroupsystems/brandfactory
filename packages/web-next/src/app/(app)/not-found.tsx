import Link from "next/link";
import { CompassIcon } from "lucide-react";

/**
 * Empty state, §12.8: calm, centred, one thin-line icon, one sentence, one way out.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <CompassIcon aria-hidden className="size-5 text-ink-tertiary" strokeWidth={1.5} />
      <p className="text-h3 text-ink">Page not found</p>
      {/* **The one way out is the Dashboard**, and it moved off `/outlets` when that route left
          the nav in 1.42.0 — a 404 whose only escape is a page the sidebar no longer offers is a
          second dead end after the first. */}
      <p className="max-w-[56ch] text-helper text-ink-secondary">
        This route does not exist. The sidebar has everything that is built — and a brand&rsquo;s own
        screens live under it, once you have opened one from Brands.
      </p>
      <Link
        href="/dashboard"
        className="rounded-md text-sm text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand"
      >
        Go to the dashboard
      </Link>
    </div>
  );
}
