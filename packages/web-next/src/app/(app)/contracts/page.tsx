import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { ContractsBrowser } from "@/features/contracts/components/contracts-browser";

export const metadata = { title: "Contracts — Marketing Hub" };

/**
 * Vendors left this page in 0.13.0, so `?view=vendors` redirects to `/vendors`.
 *
 * **The query is translated, not dropped.** Two links inside this product already
 * deep-link into the vendors tab *filtered* (`contract-detail.tsx` and
 * `contacts-browser.tsx`, both building `?view=vendors&vq=<name>`), and every shared link
 * anyone pasted before the move looks the same. A path-only redirect would turn "show me
 * this vendor" into "here is every vendor" — the "it got lost" failure this product exists
 * to fix, reintroduced by the fix for it.
 *
 * While translating it renames: `vq` → `q`, `vstatus` → `status`. Those prefixes only ever
 * existed because three views shared one URL and the contracts table had already taken
 * `q`. On a page of its own the vendors table uses the same keys as every other list
 * screen, and old links keep working for free.
 *
 * Server-side, off the awaited `searchParams`, so nothing renders first — a client-side
 * redirect would show a frame of the contracts table on the way past. An unrecognised value
 * still falls through to the contracts table exactly as `ContractsBrowser` has always made it.
 *
 * **`?view=health` no longer redirects anywhere, because there is nowhere left to send it.**
 * It went to `/service-reports?view=expected` for one release; that screen is gone with the
 * service workflow, which was keyed on a `(contract, outlet)` pair a contract no longer has.
 * The parameter now falls through to the contracts table exactly as any other unrecognised
 * value does — which is the honest outcome. A redirect to a 404 would be worse than none, and
 * inventing a destination would send a reader looking for overdue visits somewhere that cannot
 * answer them.
 */
export default async function ContractsPage({
  searchParams,
}: PageProps<"/contracts">) {
  const params = await searchParams;

  if (params.view === "vendors") {
    const forwarded = new URLSearchParams();
    // `searchParams` hands back `string | string[]`; a repeated key is a malformed link
    // rather than a case to honour, so take the first and move on.
    const first = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value;

    for (const [from, to] of [
      ["vq", "q"],
      ["vstatus", "status"],
    ] as const) {
      const value = first(params[from]);
      if (value) forwarded.set(to, value);
    }

    const query = forwarded.toString();
    redirect(query ? `/vendors?${query}` : "/vendors");
  }

  return (
    <>
      <PageHeader
        title="Contracts"
        description="The agreements and whether the service they promise is arriving. An auto-renewing contract nobody gave notice on is the single most expensive thing a spreadsheet fails to surface — here it gets a deadline on the dashboard."
      />
      <Suspense fallback={<LoadingRows rows={6} />}>
        <ContractsBrowser />
      </Suspense>
    </>
  );
}
