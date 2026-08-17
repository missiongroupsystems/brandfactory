"use client";

import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * The primary action, and it is a **placeholder that says so** — the same call
 * `features/outlets/components/sync-outlets-button.tsx` made, for a reason that is stronger here.
 *
 * The old screen's action was a create form that posted to `/contacts` and took a 503 back. That
 * was the right shape for an address book: a name and a phone number are things a person types.
 * **Reach and engagement are not.** A follower count is a number you pull from a platform and it
 * is stale within the day, so a form asking somebody to type `1,240,000` into a box invites a
 * figure nobody can stand behind — and the row would then state it as a fact next to four others
 * that came from the same box.
 *
 * So the honest primary action for this screen is an import, not a create, and importing needs a
 * connected platform. Until there is one, this commits to no shape: no source picker, no field
 * mapping, no schedule. Every one of those is a decision the real design gets to make, and a
 * placeholder that guesses at them is a placeholder somebody has to argue against later.
 *
 * Replace the body, not the button, when the connection lands.
 */
export function SyncInfluencersButton() {
  return (
    <Button
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
