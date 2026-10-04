import type { CreateMemberInput, MemberSummary, UpdateMemberInput } from "@brandfactory/shared";

import { bf, callJson, callVoid } from "@/lib/api/bf-client";

/**
 * `/members` — the only file in this feature that knows a request happens.
 *
 * Launchpad's layering, and the reason it states for it: *"Everything above this
 * file — `./model`, `./hooks`, `./components/*` — is written against the shapes
 * below and never learns that a request happened."*
 *
 * Every path is checked against the server's route tree at compile time by `bf`,
 * so a route rename surfaces here as a type error rather than a 404 at runtime.
 */
export const memberService = {
  list: async (): Promise<MemberSummary[]> => {
    const { members } = await callJson<{ members: MemberSummary[] }>(await bf.members.$get());
    return members;
  },

  create: async (input: CreateMemberInput): Promise<MemberSummary> =>
    callJson<MemberSummary>(await bf.members.$post({ json: input })),

  update: async (id: string, input: UpdateMemberInput): Promise<MemberSummary> =>
    callJson<MemberSummary>(
      await bf.members[":id"].$patch({ param: { id }, json: input }),
    ),

  /** Answers `204`. The password never comes back, and is never logged. */
  resetPassword: async (id: string, password: string): Promise<void> =>
    callVoid(await bf.members[":id"].password.$post({ param: { id }, json: { password } })),

  deactivate: async (id: string): Promise<MemberSummary> =>
    callJson<MemberSummary>(await bf.members[":id"].deactivate.$post({ param: { id } })),

  reactivate: async (id: string): Promise<MemberSummary> =>
    callJson<MemberSummary>(await bf.members[":id"].reactivate.$post({ param: { id } })),
};
