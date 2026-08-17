import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/api/bf-client";
import { ApiError } from "@/lib/api/client";

import { useSubmit } from "./use-submit";

/**
 * The branch at the end of `useSubmit`, which is the one every hand-rolled version gets wrong.
 *
 * This app has **two** API clients and each throws its own error class. A hook that recognised
 * only the Operations Hub's `ApiError` sent every BrandFactory refusal down the last branch and
 * told the reader the backend was not running — while the backend had answered, correctly, in
 * under a millisecond. Live for the whole of 1.33.0 on the one BrandFactory form there is.
 */

const UNREACHABLE = "Could not reach the API. Check that the backend is running.";

async function submitWith(error: unknown) {
  const { result } = renderHook(() => useSubmit());
  await act(async () => {
    await result.current.run(() => Promise.reject(error));
  });
  return result;
}

describe("useSubmit", () => {
  it("reports a BrandFactory refusal in the server's own words", async () => {
    const result = await submitWith(new AppError("workspace not found", "NOT_FOUND", 404));
    expect(result.current.formError).toBe("workspace not found");
  });

  it("reports a rejected body in the server's own words", async () => {
    const error = new AppError("name: Too small", "VALIDATION", 400);
    const result = await submitWith(error);
    expect(result.current.formError).toBe("name: Too small");
  });

  it("still reports an Operations Hub refusal in its own words", async () => {
    const result = await submitWith(new ApiError(409, "That name is taken", undefined));
    expect(result.current.formError).toBe("That name is taken");
  });

  it("keeps the unreachable-API message for a rejected fetch, and only for that", async () => {
    // The branch has to stay last and stay narrow: it is a claim about the network.
    const result = await submitWith(new TypeError("Failed to fetch"));
    expect(result.current.formError).toBe(UNREACHABLE);
  });

  it("clears on the next run, so a retry does not show the last attempt's message", async () => {
    const { result } = renderHook(() => useSubmit());
    await act(async () => {
      await result.current.run(() => Promise.reject(new AppError("nope", "INTERNAL", 500)));
    });
    expect(result.current.formError).toBe("nope");

    await act(async () => {
      await result.current.run(() => Promise.resolve());
    });
    expect(result.current.formError).toBeNull();
  });

  it("resolves true on success and false on a refusal", async () => {
    const { result } = renderHook(() => useSubmit());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.run(() => Promise.resolve());
    });
    expect(ok).toBe(true);

    await act(async () => {
      ok = await result.current.run(() => Promise.reject(new AppError("no", "FORBIDDEN", 403)));
    });
    expect(ok).toBe(false);
  });
});
