"use client";

import * as React from "react";

/**
 * Trails `value` by `delay`, so a search box can be responsive without a request per keystroke.
 *
 * Only the **fetch key** is debounced here, never the input's value — the field itself stays
 * controlled by the URL and updates on every keystroke. Debouncing the displayed value is what
 * produces the input that visibly lags behind typing.
 *
 * `setState` happens inside the timer callback rather than in the effect body. That distinction
 * matters in this codebase: a synchronous `setState` during an effect is what
 * `react-hooks/set-state-in-effect` rejects and what broke the build in `hooks/use-mobile.ts`.
 * An asynchronous one is the legitimate use of an effect — a subscription with cleanup.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    // Cleanup on every change is what makes it a debounce rather than a throttle: a keystroke
    // inside the window cancels the pending update instead of queueing a second one.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
