"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Box,
  Calculator,
  ChevronLeft,
  CircleHelp,
  Images,
  Map,
  Ruler,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/layout/filter-bar";
import { useSchemeStore } from "@/features/spaces/store";
import { useSchemeEditor, useUnsavedWarning } from "@/features/spaces/hooks";
import { SaveIndicator } from "@/features/spaces/components/save-indicator";
import { StatsBar } from "@/features/spaces/components/stats-bar";
import { PlanEditor } from "@/features/spaces/components/plan-editor";
import { AlbumView } from "@/features/spaces/components/album";
import { CostView } from "@/features/spaces/components/cost";
import { WelcomeDialog } from "@/features/spaces/components/welcome-dialog";
import { LoadingRows, QueryError } from "@/components/layout/query-states";

const WalkthroughView = dynamic(
  () =>
    import("@/features/spaces/components/walkthrough").then((m) => m.WalkthroughView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-ink-tertiary">
        Preparing the walkthrough…
      </div>
    ),
  },
);

const VIEWS = [
  { key: "plan", label: "Plan", icon: Map },
  { key: "walk", label: "Walkthrough", icon: Box },
  { key: "album", label: "Album", icon: Images },
  { key: "cost", label: "Cost", icon: Calculator },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

/**
 * The scheme workspace: four views of one set of decisions.
 *
 * **This used to render its own 240px sidebar, brand tile and user row** — OpenSpace was
 * its own application and needed them. Inside the Ops Hub they are `AppSidebar` and
 * `SidebarInset`, one level up, and the duplicate has been deleted rather than hidden.
 * What survives is the part that is actually about a scheme: the view switcher, the
 * stats bar, and the four views.
 *
 * The view lives in `?view=`, like every other URL-held view control in the product, so
 * a link to somebody's cost breakdown opens on the cost breakdown.
 */
export function SchemeWorkspace({ schemeId }: { schemeId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("view");
  const view: ViewKey = VIEWS.some((v) => v.key === raw) ? (raw as ViewKey) : "plan";

  const { error, isLoading } = useSchemeEditor(schemeId);
  useUnsavedWarning();

  const scheme = useSchemeStore((s) => s.scheme);
  const loadedId = useSchemeStore((s) => s.schemeId);

  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  const setView = useCallback(
    (v: ViewKey) => router.replace(`/spaces/${schemeId}?view=${v}`, { scroll: false }),
    [router, schemeId],
  );

  if (error) return <QueryError error={error} />;
  // `loadedId` rather than `isLoading`: the store is a module singleton, so between the
  // fetch resolving and hydration landing it still holds the previous scheme. Rendering
  // then would show the last plan under this one's name for a frame.
  if (isLoading || loadedId !== schemeId) return <LoadingRows rows={6} />;

  return (
    <>
      {/*
        A **fixed** height, not `h-full`, and this is load-bearing.

        `SidebarInset` is `min-h-svh` and grows with its content, which is right for every
        other screen here — a long table scrolls the page. It is wrong for this one: the
        plan is a pan-and-zoom canvas and the walkthrough is a 3D viewport, and both need a
        pane of known size to fit into. Given an indefinite parent height, `h-full`
        resolves to auto, the tall palette column becomes the tallest thing in the row, and
        the canvas is pushed off the bottom of the page — which is exactly what it did.

        `3.5rem` is the mobile top bar in `(app)/layout.tsx` (`h-14`); there is no desktop
        one, so the whole viewport is available from `md:` up.
      */}
      <div
        className="flex h-[calc(100svh-3.5rem)] min-h-0 flex-col md:h-svh"
        inert={helpOpen}
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 pb-4 pt-5 max-md:px-4">
          <div className="min-w-0">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/spaces" />}
              className="-ml-2 mb-1 text-ink-tertiary"
            >
              <ChevronLeft className="size-3.5" strokeWidth={1.75} />
              All spaces
            </Button>
            <h1 className="truncate text-h1 text-ink">{scheme.name}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-helper text-ink-tertiary">
              <Ruler className="size-3 shrink-0" strokeWidth={1.75} />
              Scale {scheme.unit.scale.source} — {scheme.unit.scale.method}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <SaveIndicator />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHelpOpen(true)}
              title="What is a space scheme?"
            >
              <CircleHelp className="size-3.5" strokeWidth={1.75} />
              How it works
            </Button>
          </div>
        </header>

        <StatsBar />

        <div className="shrink-0 border-b border-border bg-surface px-6 py-2 max-md:px-4">
          <SegmentedControl
            label="Which view of the scheme to show"
            value={view}
            onChange={setView}
            options={VIEWS.map(({ key, label }) => ({ value: key, label }))}
          />
        </div>

        <main className="min-h-0 flex-1">
          {view === "plan" && <PlanEditor />}
          {view === "walk" && <WalkthroughView />}
          {view === "album" && <AlbumView />}
          {view === "cost" && <CostView />}
        </main>
      </div>

      {helpOpen && <WelcomeDialog onClose={closeHelp} mode="help" />}
    </>
  );
}
