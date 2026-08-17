import type { Metadata } from "next";

import { PublicForm } from "@/features/marketing-requests/components/public-form";

export const metadata: Metadata = {
  title: "Marketing request — Mission Systems",
  robots: { index: false },
};

/**
 * The public face of the Marketing Request, at `/f/<slug>` (today, `/f/request`). It lives
 * *outside* the `(app)` route group on purpose, so it renders under the root layout only — no
 * sidebar, no app chrome — a clean standalone page anyone can open and submit without logging in.
 */
export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicForm slug={slug} />;
}
