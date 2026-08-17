"use client";

import useSWR from "swr";

import { bf, callJson } from "@/lib/api/bf-client";
import { SCOPES } from "@/lib/api/cache";

/**
 * Whether this deployment can research a brand at all — `GET /research`.
 *
 * One boolean, and it is **deployment configuration rather than a brand fact**: the create
 * form needs the answer before a brand exists, which is why the server has this route beside
 * the brand-scoped `GET /brands/:id/research` that also carries the flag.
 *
 * The rule it serves is 1.13.0's, and it is a rule about honesty rather than about research:
 * **when research is off the control is absent, not disabled.** A disabled checkbox with no
 * way to enable it is an advertisement for a feature this deployment does not have.
 *
 * `RESEARCH_PROVIDER=none` is the shipped default (`.env.example`), because research is the one
 * feature here that costs money per run — so on a contributor's machine this answers `false`
 * and the opt-in simply is not on screen.
 */
export interface ResearchConfig {
  enabled: boolean;
}

export function useResearchConfig(opts?: { enabled?: boolean }) {
  // Asked only while the form that needs it can be seen. The answer is deployment config and
  // cannot change while somebody types a name, so there is nothing to poll for.
  const active = opts?.enabled !== false;

  return useSWR<ResearchConfig>(
    active ? [SCOPES.researchConfig] : null,
    async () => callJson<ResearchConfig>(await bf.research.$get()),
    { revalidateOnFocus: false, revalidateIfStale: false },
  );
}
