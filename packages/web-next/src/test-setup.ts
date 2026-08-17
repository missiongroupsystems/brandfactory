import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * @testing-library/react's automatic cleanup only runs when `globals: true` is set on the
 * runner. It is — but be explicit anyway: cleanup unmounts every rendered component after each
 * test, so the jsdom DOM is empty going into the next one. Without it, tests rendering
 * similarly-named controls clash on `getByRole`.
 */
afterEach(() => {
  cleanup();
});

/**
 * The DOM APIs jsdom does not implement and Base UI's popups require.
 *
 * None is a behaviour worth faking cleverly: pointer capture is a routing detail for pointer
 * events that never fire in jsdom anyway, and scrolling has no meaning in a layout engine that
 * does not lay anything out. Each is stubbed to the least surprising answer — capture is never
 * held, scrolling is a no-op, nothing ever resizes — and installed only when absent, so a
 * future jsdom that implements them wins.
 */
const proto = window.Element.prototype as unknown as Record<string, unknown>;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.scrollIntoView ??= () => {};

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * Same treatment, for the brand profile's contents rail. Nothing intersects in a layout engine
 * that lays nothing out, so an observer that never reports is the least surprising answer — the
 * rail renders every entry and simply highlights none, which is its own honest "not scrolled
 * anywhere yet" state.
 */
globalThis.IntersectionObserver ??= class {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
};
