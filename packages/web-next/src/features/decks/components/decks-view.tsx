"use client";

import { byVersionRecency, type DeckVersion } from "@brandfactory/shared";
import {
  ChevronDownIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState, LoadingRows, QueryError } from "@/components/layout/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { downloadBlobUrl, fetchReadUrl } from "@/lib/blob";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { DeckWithVersions } from "../api";
import { useDecks } from "../hooks";
import { DeckForm } from "./deck-form";
import { VersionForm } from "./version-form";

/**
 * This brand's decks — a named folder per pitch deck or one-pager, each showing the version the
 * stack currently answers with plus a reachable history of everything before it.
 *
 * **`current` is read from the wire, never re-derived.** `routes/decks.ts` already computes it
 * with `currentVersion` (`@brandfactory/shared/deck/ordering`), and 2A's whole point was "no
 * caller decides for itself which version is current" — a client re-sorting `versions` here would
 * be exactly the caller that rule rules out.
 *
 * **Viewing only, plus the minimal "New deck" affordance this screen needs to not be inert.**
 * Recording a version — the Canva two-part write especially — is Phase 2F's job, sized around
 * decision 3's required-snapshot CHECK — **which 2F now supplies**: every card carries an
 * "Add version" control, and `VersionForm` owns the two arms and the ordered write.
 */
export function DecksView({ brandId }: { brandId: string }) {
  const { decks, isLoading, error } = useDecks(brandId);
  const [formOpen, setFormOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setFormOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          New deck
        </Button>
      </div>

      {error ? (
        <QueryError error={error} />
      ) : isLoading ? (
        <LoadingRows rows={4} />
      ) : decks.length === 0 ? (
        <EmptyState
          message="No decks yet"
          hint="A deck is a named folder this brand hangs versions off — a pitch deck, a one-pager. Add the first one."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {decks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} brandId={brandId} />
          ))}
        </div>
      )}

      <DeckForm brandId={brandId} open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

/**
 * One deck: its name, the current version shown without interaction, and — only when there is
 * more than one version — a toggle that reveals the rest, newest first.
 *
 * **An empty stack is a real state, not an error.** `currentVersion([])` answers `null`, and a
 * deck that exists with zero versions recorded renders `EmptyState`'s own quiet card, on the same
 * rule `ResourcesView` and every other list in this package follow for "nothing here yet".
 */
function DeckCard({ deck, brandId }: { deck: DeckWithVersions; brandId: string }) {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [versionFormOpen, setVersionFormOpen] = React.useState(false);

  const older = deck.versions
    .filter((version) => version.id !== deck.current?.id)
    .slice()
    .sort(byVersionRecency);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          {/* A real `<h2>`, not `CardTitle` — that component renders a `div` (see `AGENTS.md`). */}
          <h2 className="font-heading text-h3 text-ink">{deck.name}</h2>
          {/* Named per deck, because a page holding four of these otherwise offers four
              identically-labelled buttons and a screen reader cannot tell them apart. */}
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Add version to ${deck.name}`}
            onClick={() => setVersionFormOpen(true)}
          >
            <PlusIcon data-icon="inline-start" />
            Add version
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {deck.current ? (
          <VersionRow deckName={deck.name} version={deck.current} />
        ) : (
          <EmptyState
            message="No versions yet"
            hint="Nothing has been recorded for this deck yet."
          />
        )}

        {older.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <ChevronDownIcon
                aria-hidden
                className={cn("transition-transform duration-[120ms]", historyOpen && "rotate-180")}
              />
              {historyOpen ? "Hide" : "Show"} {older.length} earlier version
              {older.length === 1 ? "" : "s"}
            </Button>

            {historyOpen ? (
              <ul className="flex flex-col divide-y divide-border-subtle">
                {older.map((version) => (
                  <li key={version.id} className="py-2 first:pt-0 last:pb-0">
                    <VersionRow deckName={deck.name} version={version} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      <VersionForm
        brandId={brandId}
        deckId={deck.id}
        deckName={deck.name}
        open={versionFormOpen}
        onOpenChange={setVersionFormOpen}
      />
    </Card>
  );
}

/** One version's label, date and author, with the action its `source` earns it. */
function VersionRow({ deckName, version }: { deckName: string; version: DeckVersion }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-medium text-ink">{version.label}</p>
        <p className="text-helper text-ink-secondary">
          {formatDate(version.versionDate)} · {version.author}
        </p>
      </div>
      <VersionAction deckName={deckName} version={version} />
    </div>
  );
}

/**
 * The `source` discriminator, on screen. A Canva version's design lives at `canvaUrl` and stays
 * editable there, so its action is to open it — a plain external link, no blob involved. A PDF
 * version's only copy is the file itself, so its action mints a signed read URL and downloads it.
 *
 * **`fetchReadUrl`, not `useSignedReadUrl`.** The hook is a 4-minute-polling SWR subscription,
 * right for something mounted on screen and wrong for a button that fires once on click — see the
 * note on `fetchReadUrl` in `lib/blob.ts`.
 */
function VersionAction({ deckName, version }: { deckName: string; version: DeckVersion }) {
  const [isDownloading, setIsDownloading] = React.useState(false);

  if (version.source === "canva") {
    return (
      <a
        href={version.canvaUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-input px-3 py-1.5 text-helper text-ink-secondary transition-colors duration-[120ms] hover:border-border-strong hover:text-ink"
      >
        Open in Canva
        <ExternalLinkIcon aria-hidden className="size-3.5" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }

  async function handleDownload() {
    setIsDownloading(true);
    try {
      const url = await fetchReadUrl(version.pdfBlobKey);
      await downloadBlobUrl(url, `${deckName} — ${version.label}.pdf`);
    } catch {
      toast.error("Could not download this version.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      disabled={isDownloading}
      onClick={() => void handleDownload()}
    >
      {isDownloading ? (
        <Loader2Icon className="animate-spin" data-icon="inline-start" />
      ) : (
        <DownloadIcon data-icon="inline-start" />
      )}
      {isDownloading ? "Downloading" : "Download PDF"}
    </Button>
  );
}
