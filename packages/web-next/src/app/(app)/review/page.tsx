import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { LoadingRows } from "@/components/layout/query-states";
import { ReviewBrowser } from "@/features/review/components/review-browser";

export const metadata = { title: "Review — BrandFactory" };

/** Server shell, interactive half under `<Suspense>` — see the outlets page on why. */
export default function ReviewPage() {
  return (
    <>
      <PageHeader
        title="Review"
        description="What the migration could not know. The Lark import refused to guess: an unreadable figure stayed empty and every document was filed as a contract because nothing said otherwise. Each row is one record and one question — fix it, or say it is right as it stands."
      />
      <Suspense fallback={<LoadingRows rows={5} />}>
        <ReviewBrowser />
      </Suspense>
    </>
  );
}
