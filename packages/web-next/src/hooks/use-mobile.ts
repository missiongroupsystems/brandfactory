import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Rewritten from the shadcn default, which subscribed in `useEffect` and then called
 * `setState` synchronously in the same effect to catch the initial value. That is a
 * cascading render on every mount, and `react-hooks/set-state-in-effect` fails the build
 * over it.
 *
 * `useSyncExternalStore` is what this shape is for: subscribe, read, and give the server a
 * separate snapshot. Note the server snapshot is `false` — there is no viewport during SSR,
 * and guessing "mobile" would render the wrong sidebar into the static HTML.
 *
 * ⚠️ Re-running `shadcn add sidebar` overwrites this file with the original.
 */
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
