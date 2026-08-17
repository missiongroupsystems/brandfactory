"use client";

import { ContractsView } from "./contracts-view";

/**
 * `/contracts` is one table.
 *
 * **The tab strip is gone.** It carried `contracts | health` — vendors having left in 0.13.0 —
 * and the comment that stood here argued service health had to stay a tab because removing it
 * would mean "promoting service health to a nav item it does not deserve". That test was the
 * right one and this is what changed its answer: the strip's own reasoning was that vendors
 * moved out *because it was a different noun* while health stayed *because it was a view of
 * contracts*. What went unsaid is why it did not deserve a page — **it had no action on any
 * row.** Reading a verdict was the whole of it. `/service-reports` gives every overdue pair the
 * control that closes it, and a screen with work in it is a screen worth navigating to.
 *
 * `?view=health` still resolves: the page above this one redirects it to `/service-reports`.
 *
 * This component stays although it now renders one child, and that is not an accident. It owns
 * the page's `px-6 … md:px-8` — the padding the `(app)` layout does not supply and `PageHeader`
 * carries separately. Folding it away would put a bare `ContractsView` under the header with no
 * gutters, which is exactly the shape 0.15.1 spent a release fixing on two other screens.
 */
export function ContractsBrowser() {
  return (
    <div className="flex flex-col gap-4 px-6 pb-8 md:px-8">
      <ContractsView />
    </div>
  );
}
