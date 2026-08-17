"use client";

import * as React from "react";
import useSWR from "swr";

import { ApiError } from "@/lib/api/client";
import { useInvalidate } from "@/lib/api/cache";
import { useCursorPages } from "@/lib/api/use-cursor-pages";
import type { SpaceScheme, SpaceSchemeSummary } from "@/lib/api/types";
import { type SpaceFilters, spacesService } from "@/features/spaces/api";
import { useSchemeStore } from "@/features/spaces/store";
import type { Scheme } from "@/features/spaces/types";

/**
 * Server state for spaces. SWR owns the fetch and the cache; the zustand store owns the
 * *editing draft*. `useSchemeEditor` below is the seam between them, and it is the only
 * thing that writes a scheme back.
 */

export function useSpaces(filters: SpaceFilters = {}) {
  return useCursorPages<SpaceSchemeSummary>("spaces", filters, (cursor) =>
    spacesService.list({ ...filters, cursor }),
  );
}

export function useSpace(id: string | null) {
  // A null key, not an array holding an empty id — an SWR array key is truthy however
  // empty its contents, so `["space", ""]` would fetch and take a 422 on every render.
  return useSWR(id ? ["space", id] : null, () => spacesService.get(id as string));
}

export function useSpaceMutations() {
  const invalidate = useInvalidate();

  return {
    create: async (payload: Scheme, outletId?: string | null) => {
      const created = await spacesService.create(payload, outletId);
      await invalidate("spaces");
      return created;
    },
    remove: async (id: string) => {
      await spacesService.remove(id);
      await invalidate("spaces", "space");
    },
    reassign: async (
      id: string,
      payload: Scheme,
      expectedVersion: number,
      outletId: string | null,
    ) => {
      const saved = await spacesService.save(id, payload, expectedVersion, outletId);
      await invalidate("spaces", "space");
      return saved;
    },
  };
}

/** How long the plan has to sit still before a save goes out. */
const AUTOSAVE_IDLE_MS = 1500;

/**
 * Load a scheme into the editor and keep it saved.
 *
 * **Why this is a debounced autosave and not a Save button.** The canvas mutates the
 * draft on every pointer move; a save per change is a request per frame, and a Save
 * button on a drag-based editor is a button people forget. So the draft moves freely and
 * a save goes out once the plan has been still for `AUTOSAVE_IDLE_MS`.
 *
 * **Why that does not contradict "nothing is optimistic".** That rule is about mutations
 * the API may refuse on domain grounds — rendering your own guess then shows a state that
 * does not exist. It still holds for create, delete and reassignment, which go through
 * `useSpaceMutations` and render the server's answer. It cannot hold for a drag: there is
 * no way to re-render a pointer move from a round trip. What is owed instead is honesty,
 * so `saveState` is shown rather than assumed, and a 409 stops the loop dead rather than
 * retrying over the top of whoever won.
 */
export function useSchemeEditor(id: string | null) {
  const { data, error, isLoading, mutate } = useSpace(id);

  const hydrate = useSchemeStore((s) => s.hydrate);
  const unhydrate = useSchemeStore((s) => s.unhydrate);
  const setSaveState = useSchemeStore((s) => s.setSaveState);
  const markSaved = useSchemeStore((s) => s.markSaved);
  const loadedId = useSchemeStore((s) => s.schemeId);

  // Adopt the fetched document. Keyed on the *scheme's* id rather than on `data`, so a
  // background revalidation returning an equivalent record does not throw away edits the
  // user has made since — SWR revalidates on window focus, and clobbering the draft
  // every time somebody tabs back would be catastrophic and hard to attribute.
  React.useEffect(() => {
    if (data && data.id !== loadedId) {
      hydrate(data.id, data.payload as Scheme, data.version);
    }
  }, [data, loadedId, hydrate]);

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The save currently in the air, with the exact document it carries. Both halves are
  // needed: the document says whether the draft has moved past what is being written, and
  // the promise lets the unmount rescue below *wait* for the version it will return
  // instead of racing it.
  const inFlight = React.useRef<{ document: Scheme; request: Promise<SpaceScheme> } | null>(null);
  // `flush` has to be able to re-arm the debounce that calls it, and naming it inside its
  // own `useCallback` is both a circular type and a `react-hooks/immutability` error. The
  // latest-ref indirection is the way round both, and it is why `schedule` reads through
  // the ref rather than closing over a particular render's `flush`.
  const flushRef = React.useRef<() => void>(() => {});

  const schedule = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), AUTOSAVE_IDLE_MS);
  }, []);

  // Leaving the editor drops the draft. The store is a module singleton, so without this
  // the next scheme opened would render the previous one's plan for a frame.
  //
  // **A pending edit is sent first.** `useUnsavedWarning` covers closing the tab; it
  // cannot see a client-side navigation, so clicking "All spaces" within the debounce
  // window used to clear the timer and drop the edit with nothing on screen to say so.
  // Fire-and-forget, because there is no longer a component to render the answer to — a
  // failure here is invisible, which is the lesser of the two failures available.
  React.useEffect(
    () => () => {
      const { schemeId, scheme, version, saveState } = useSchemeStore.getState();
      const pending = inFlight.current;
      // Unsent work is either a draft waiting on the debounce, a failed save, or a draft
      // that moved past whatever is currently being written.
      const unsent =
        saveState === "dirty" || saveState === "error" || (pending && pending.document !== scheme);

      if (schemeId && saveState !== "conflict" && unsent) {
        void (async () => {
          // If a save is still in the air it owns the version this one has to follow.
          // Firing concurrently would put two writes on the same `expected_version`, and
          // the loser would be a 409 nobody is left on screen to see.
          const landed = await pending?.request.catch(() => null);
          const saved = await spacesService.save(schemeId, scheme, landed?.version ?? version);
          // The cache takes the new version too, or the next visit hydrates on a stale
          // one and the save after that is a 409 blaming a tab nobody opened.
          await mutate(saved, { revalidate: false });
        })().catch(() => {});
      }
      unhydrate();
    },
    [unhydrate, mutate],
  );

  const flush = React.useCallback(async () => {
    const { schemeId, scheme, version, saveState } = useSchemeStore.getState();
    if (!schemeId) return;
    // `conflict` is terminal until the user reloads: retrying would be writing over
    // whoever won, which is the thing `expected_version` exists to prevent.
    if (saveState === "conflict") return;

    // A save is already in the air, so come back when it has landed. **Returning here
    // instead is how an edit made during a slow save was lost:** the timer had already
    // fired and nothing rescheduled it, so the draft sat unsent while the earlier
    // request completed and `markSaved` reported "Saved" over the top of it.
    if (inFlight.current) {
      schedule();
      return;
    }

    setSaveState("saving");
    const request = spacesService.save(schemeId, scheme, version);
    inFlight.current = { document: scheme, request };
    try {
      const saved = await request;
      const after = useSchemeStore.getState();
      // A different scheme is loaded now — this response belongs to a document nobody is
      // looking at, and `markSaved` would stamp its version onto the wrong draft.
      if (after.schemeId !== schemeId) return;

      markSaved(saved.version);
      // Keep the cache honest without refetching: the list's derived counts and the
      // record's version both moved.
      await mutate(saved, { revalidate: false });

      // The draft moved while the request was in the air, so what just landed is already
      // out of date and "Saved" would be a lie. Say dirty and go round again on the same
      // idle window — rather than immediately, which would turn a long drag into a
      // request per round trip.
      if (after.scheme !== scheme) {
        setSaveState("dirty");
        schedule();
      }
    } catch (err) {
      setSaveState(err instanceof ApiError && err.status === 409 ? "conflict" : "error");
    } finally {
      inFlight.current = null;
    }
  }, [markSaved, mutate, setSaveState, schedule]);

  // The debounce itself: any change to the *document* restarts the clock. Subscribing to
  // the store rather than re-rendering on every edit keeps the canvas out of React's way
  // — a 970-line SVG editor should not re-render its parent to record that it is dirty.
  React.useEffect(() => {
    flushRef.current = () => void flush();

    const unsubscribe = useSchemeStore.subscribe((state, previous) => {
      if (state.scheme === previous.scheme) return;
      if (!state.schemeId || state.saveState === "conflict") return;

      setSaveState("dirty");
      schedule();
    });

    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush, setSaveState, schedule]);

  return { scheme: data, error, isLoading, saveNow: flush };
}

/**
 * Warn before leaving with an unsaved edit in flight.
 *
 * The debounce window is short, but "close the tab straight after nudging a banquette"
 * is exactly the case where a lost save is invisible and unattributable.
 */
export function useUnsavedWarning() {
  const saveState = useSchemeStore((s) => s.saveState);

  React.useEffect(() => {
    if (saveState !== "dirty" && saveState !== "saving") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);
}
