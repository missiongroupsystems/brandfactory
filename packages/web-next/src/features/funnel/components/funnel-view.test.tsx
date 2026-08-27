import type { FunnelStageWithDetail, Platform } from "@brandfactory/shared";
import { DEFAULT_FUNNEL_STAGES } from "@brandfactory/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSocialPosts } from "@/features/social-posts/hooks";

import { useFunnel, useFunnelMutations } from "../hooks";
import { FunnelView } from "./funnel-view";

vi.mock("../hooks", () => ({ useFunnel: vi.fn(), useFunnelMutations: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/social-posts/hooks", () => ({ useSocialPosts: vi.fn() }));

const mockedUseFunnel = vi.mocked(useFunnel);
const mockedUseMutations = vi.mocked(useFunnelMutations);
const mockedUseSocialPosts = vi.mocked(useSocialPosts);
const createStage = vi.fn();
const attachPlatform = vi.fn();
const updateActivity = vi.fn();

function stage(overrides: Partial<Record<keyof FunnelStageWithDetail, unknown>> = {}) {
  return {
    id: "s1",
    brandId: "b1",
    name: "Awareness",
    position: 100,
    platforms: [],
    activities: [],
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  } as FunnelStageWithDetail;
}

function platform(id: string, name: string, url: string | null): Platform {
  return {
    id,
    brandId: "b1",
    name,
    url,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  } as Platform;
}

function setup(stages: FunnelStageWithDetail[], platforms: Platform[] = []) {
  mockedUseFunnel.mockReturnValue({ stages, platforms, isLoading: false, error: null });
  render(<FunnelView brandId="b1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseSocialPosts.mockReturnValue({ posts: [], isLoading: false, error: null });
  mockedUseMutations.mockReturnValue({
    createStage,
    renameStage: vi.fn(),
    deleteStage: vi.fn(),
    createPlatform: vi.fn(),
    attachPlatform,
    detachPlatform: vi.fn(),
    createActivity: vi.fn(),
    updateActivity,
    setLinkedPost: vi.fn(),
    deleteActivity: vi.fn(),
  });
});

describe("FunnelView", () => {
  it("renders the stages in the order it is handed, not alphabetically", () => {
    // The order *is* the subject — a journey read out of order is not a journey.
    setup([
      stage({ id: "a", name: "Awareness", position: 100 }),
      stage({ id: "b", name: "Conversion", position: 400 }),
      stage({ id: "c", name: "Loyalty", position: 500 }),
    ]);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Awareness", "Conversion", "Loyalty"]);
  });

  it("offers the six defaults to a brand with none, and writes them on accept", async () => {
    // **This is the backfill.** Brands created before Plan 4 have no stages, and
    // six stage names in a migration would be product copy duplicated into the
    // one language that cannot import the constant.
    setup([]);
    expect(screen.getByText("No stages yet")).not.toBe(null);
    fireEvent.click(screen.getByRole("button", { name: /six default stages/ }));
    await waitFor(() => expect(createStage).toHaveBeenCalledTimes(DEFAULT_FUNNEL_STAGES.length));
    expect(createStage).toHaveBeenNthCalledWith(1, { name: "Awareness" });
  });

  it("links a platform that has a URL and does not invent one that does not", () => {
    // The shop window has no URL, and deriving one is the failure the influencer
    // platform badges already fixed once.
    setup([
      stage({
        platforms: [
          platform("p1", "Instagram", "https://instagram.com/brand"),
          platform("p2", "The shop window", null),
        ],
      }),
    ]);
    const link = screen.getByRole("link", { name: /Instagram/ });
    expect(link.getAttribute("href")).toBe("https://instagram.com/brand");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.queryByRole("link", { name: /shop window/ })).toBe(null);
    // One chip per platform, so the name appears exactly once.
    expect(screen.getByText("The shop window")).not.toBe(null);
    expect(screen.getByRole("button", { name: "Remove The shop window from Awareness" })).not.toBe(
      null,
    );
  });

  it("only offers platforms a stage does not already have", () => {
    setup(
      [stage({ platforms: [platform("p1", "Instagram", null)] })],
      [platform("p1", "Instagram", null), platform("p2", "Email", null)],
    );
    const select = screen.getByLabelText("Add a platform to Awareness") as HTMLSelectElement;
    const names = [...select.options].map((o) => o.textContent);
    expect(names).toContain("Email");
    expect(names).not.toContain("Instagram");
  });

  it("shows an activity's status as a lifecycle, never a score", () => {
    setup([
      stage({
        activities: [
          {
            id: "a1",
            stageId: "s1",
            platformId: null,
            title: "Spring campaign",
            status: "running",
            startsOn: "2026-03-01",
            endsOn: null,
            note: null,
            createdAt: "2026-08-27T00:00:00.000Z",
            updatedAt: "2026-08-27T00:00:00.000Z",
          },
        ],
      }),
    ]);
    // The select *is* the display — no badge beside it repeating the value.
    const status = screen.getByLabelText("Status for Spring campaign") as HTMLSelectElement;
    expect(status.value).toBe("running");
    expect([...status.options].map((o) => o.textContent)).toEqual([
      "Planned",
      "Running",
      "Paused",
      "Done",
    ]);
    // A Running activity with a start and no end — the state most activities are
    // in when anybody looks, and the one a single date could not express.
    expect(screen.getByText(/2026/)).not.toBe(null);
  });

  it("names each stage in its controls, so five blocks are navigable", () => {
    setup([stage({ id: "a", name: "Awareness" }), stage({ id: "b", name: "Loyalty" })]);
    expect(screen.getByRole("button", { name: "Add an activity to Awareness" })).not.toBe(null);
    expect(screen.getByRole("button", { name: "Add an activity to Loyalty" })).not.toBe(null);
  });

  it("says a stage is empty rather than rendering a bare heading", () => {
    setup([stage()]);
    expect(screen.getByText("Nothing running here yet.")).not.toBe(null);
  });
});

describe("the link to a social post", () => {
  const linkedActivity = (socialPostId: string | null) => ({
    id: "a1",
    stageId: "s1",
    platformId: null,
    socialPostId,
    title: "Spring campaign",
    status: "planned" as const,
    startsOn: null,
    endsOn: null,
    note: null,
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  });

  it("names a linked post the calendar no longer holds, instead of showing none", () => {
    // **Social posts soft-delete**, so `ON DELETE SET NULL` never fires and the
    // activity keeps its id — while the list filters `deletedAt`. Without an
    // option for it the controlled select would display "No linked post" over a
    // link the database still has, and the next touch would write that lie back.
    mockedUseSocialPosts.mockReturnValue({ posts: [], isLoading: false, error: null });
    setup([stage({ activities: [linkedActivity("p-gone")] })]);

    const select = screen.getByLabelText("Linked post for Spring campaign") as HTMLSelectElement;
    expect(select.value).toBe("p-gone");
    expect([...select.options].map((o) => o.textContent)).toContain(
      "Linked post (deleted from the calendar)",
    );
  });

  it("offers no such option when the post is still in the calendar", () => {
    mockedUseSocialPosts.mockReturnValue({
      posts: [{ id: "p1", body: "Spring teaser" } as never],
      isLoading: false,
      error: null,
    });
    setup([stage({ activities: [linkedActivity("p1")] })]);

    const select = screen.getByLabelText("Linked post for Spring campaign") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "No linked post",
      "Spring teaser",
    ]);
  });

  it("offers a way through to the post, and nothing when there is no link", () => {
    mockedUseSocialPosts.mockReturnValue({
      posts: [{ id: "p1", body: "Spring teaser" } as never],
      isLoading: false,
      error: null,
    });
    setup([stage({ activities: [linkedActivity("p1")] })]);
    const link = screen.getByRole("link", {
      name: "Open the post linked to Spring campaign",
    });
    expect(link.getAttribute("href")).toBe("/brands/b1/social?post=p1");

    cleanup();
    setup([stage({ activities: [linkedActivity(null)] })]);
    expect(screen.queryByRole("link", { name: /Open the post/ })).toBe(null);
  });
});

describe("destructive controls ask first", () => {
  it("does not delete an activity on one click", () => {
    // **The only destructive control in these four features that asked nothing.**
    // An activity is a record of work, the delete is a hard one, and there is no
    // undo behind it.
    const deleteActivity = vi.fn();
    mockedUseMutations.mockReturnValue({
      createStage: vi.fn(),
      renameStage: vi.fn(),
      deleteStage: vi.fn(),
      createPlatform: vi.fn(),
      attachPlatform: vi.fn(),
      detachPlatform: vi.fn(),
      createActivity: vi.fn(),
      updateActivity: vi.fn(),
      setLinkedPost: vi.fn(),
      deleteActivity,
    });
    setup([
      stage({
        activities: [
          {
            id: "a1",
            stageId: "s1",
            platformId: null,
            socialPostId: null,
            title: "Spring campaign",
            status: "planned" as const,
            startsOn: null,
            endsOn: null,
            note: null,
            createdAt: "2026-08-27T00:00:00.000Z",
            updatedAt: "2026-08-27T00:00:00.000Z",
          },
        ],
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Delete Spring campaign" }));
    expect(deleteActivity).not.toHaveBeenCalled();
    // The question names the thing, so a reader with four stages open knows which.
    expect(screen.getByText(/Delete “Spring campaign”/)).not.toBe(null);
  });
});
