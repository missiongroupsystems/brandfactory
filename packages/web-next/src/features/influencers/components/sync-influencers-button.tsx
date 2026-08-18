"use client";

import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * A **placeholder that says so** — the same call
 * `features/outlets/components/sync-outlets-button.tsx` made, for a reason that is stronger here.
 *
 * A follower count is a number you pull from a platform and it is stale within the day, so a form
 * asking somebody to type `1,240,000` into a box invites a figure nobody can stand behind — and
 * the row would then state it as a fact next to four others that came from the same box. That is
 * why importing, not typing, is the mechanism this screen is eventually for, and it needs a
 * connected platform. Until there is one, this commits to no shape: no source picker, no field
 * mapping, no schedule. Every one of those is a decision the real design gets to make, and a
 * placeholder that guesses at them is a placeholder somebody has to argue against later.
 *
 * **`secondary` as of this release, and it was the primary until now.** The argument above did not
 * change; what changed is that `Add creator` exists, so an import that has not been built is no
 * longer the only way a row can arrive. A placeholder beside a working create is honest. A
 * placeholder *instead of* one was a screen that could not fill its own table.
 *
 * Replace the body, not the button, when the connection lands — and put it back to primary then,
 * because that is when it becomes the way most rows actually arrive.
 */
export function SyncInfluencersButton() {
  return (
    <Button
      variant="secondary"
      onClick={() =>
        toast("Creator import is not connected yet", {
          description:
            "The roster on screen is sample data. Pulling creators and their reach from a connected platform is the next piece of work.",
        })
      }
    >
      <RefreshCwIcon data-icon="inline-start" />
      Import or sync creators
    </Button>
  );
}
