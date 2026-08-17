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
      <p className="max-w-[56ch] text-helper text-ink-secondary">
        This route does not exist. Only the registry and network areas are built in the alpha —
        see the sidebar.
      </p>
      <Link
        href="/outlets"
        className="rounded-md text-sm text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand"
      >
        Go to outlets
      </Link>
    </div>
  );
}
