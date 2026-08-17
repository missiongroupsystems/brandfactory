"use client";

import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * **A placeholder, and it says so on every click.**
 *
 * This slot held "New outlet". Outlets are not going to be typed in one at a
 * time — they will arrive from the system that already holds the estate — so the
 * primary action on this screen becomes an import, and the create form moves
 * behind the table's own affordance rather than the header's.
 *
 * The backend for it does not exist yet and is not being designed here. Three
 * things follow, and they are the whole reason this is six lines rather than a
 * dialog:
 *
 * - **It is enabled.** A permanently greyed control in the primary action slot
 *   reads as broken software, not as an unbuilt feature.
 * - **It states what it is** — one toast, naming the thing that is missing. A
 *   button that did nothing visible would be a bug report waiting to be filed.
 * - **It commits to no shape.** No source picker, no field mapping, no schedule.
 *   Every one of those is a decision the real design gets to make, and a
 *   placeholder that guesses at them is a placeholder somebody has to argue
 *   against later.
 *
 * Replace the body, not the button, when the route lands. `RefreshCwIcon` rather
 * than a download arrow because the intent is a repeatable sync against a source
 * of record, not a one-off file import.
 */
export function SyncOutletsButton() {
  return (
    <Button
      onClick={() =>
        toast("Outlet sync is not connected yet", {
          description:
            "Outlets are read and edited here today. Importing them from the system of record is the next piece of work.",
        })
      }
    >
      <RefreshCwIcon data-icon="inline-start" />
      Import or sync outlets
    </Button>
  );
}
