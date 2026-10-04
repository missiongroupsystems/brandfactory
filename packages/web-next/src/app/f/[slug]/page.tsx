import { notFound, redirect } from "next/navigation";

/**
 * `/f/request` was the sample's public form, open to anyone with the link. MKT-5 chose
 * signed-in users only, so the address now lands on the same form inside the app — behind
 * sign-in — rather than going dark for everybody who saved the old link.
 *
 * Any other slug is still a 404: `/f/<slug>` is a shape people paste, and a wrong link has to
 * say so.
 */
export default async function PublicFormRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug !== "request") notFound();
  redirect("/marketing-requests?new=1");
}
