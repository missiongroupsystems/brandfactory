import Link from "next/link";
import { CheckIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The placeholder for an area that is modelled but has no behaviour yet.
 *
 * States what exists, what does not, and where the decisions are written down. An empty
 * page with a spinner would suggest something is loading; a page with fake rows would be
 * worse still — which is also why this screen has no stat cards. There is no number here
 * worth putting in a hero card, so it does not get one, and the accent stays unspent.
 */
export function NotBuiltYet({
  title,
  phase,
  description,
  built,
  pending,
}: {
  title: string;
  phase: number;
  description: string;
  built: string[];
  pending: string[];
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        // `outline`, not the neutral beige pill: the beige pill IS `--surface-sunken`, which
        // is also the page canvas, so on this background it would be invisible. Beige pills
        // belong on white — in cards and table cells.
        actions={<Badge variant="outline">Phase {phase} · not built</Badge>}
      />

      <div className="flex flex-col gap-4 px-6 py-6 md:px-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Already in place</CardTitle>
              <CardDescription>Modelled, migrated and covered by tests.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-ink-secondary">
                {built.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    {/* Tick plus wording, not colour on its own (§3.3). Success is
                        #2f6b46 — legibly green, and deliberately not the brand accent. */}
                    <CheckIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Phase {phase} — still to build</CardTitle>
              <CardDescription>No API, no screen, no partial version in the way.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-ink-secondary">
                {pending.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[7px] size-1.5 shrink-0 rounded-4xl bg-ink-tertiary"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <p className="max-w-[72ch] text-helper text-ink-tertiary">
          Build order and the decisions behind it are in{" "}
          <code className="rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-ink">
            docs/spec.md §7
          </code>
          . The domain modules under{" "}
          <code className="rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-ink">
            backend/app/domain/
          </code>{" "}
          carry the rules already agreed for each area.{" "}
          <Link
            href="/dashboard"
            className="rounded-md text-ink underline decoration-[0.5px] underline-offset-4 hover:text-brand"
          >
            Back to the dashboard
          </Link>
          .
        </p>
      </div>
    </>
  );
}
