import { type ResearchProvider, ResearchNotConfiguredError } from './port'

/**
 * The default provider, and the one most deployments will run.
 *
 * `RESEARCH_PROVIDER=none` is the default in `EnvSchema` on purpose: research
 * is the one feature in this repo that costs money per click, and a self-hoster
 * who has not opted in must get it **absent and explained**, never broken and
 * never billed. "Absent" is enforced at the surface — the route passes no
 * `onStartResearch`, so the rail's footer row does not exist — which is the
 * callback gate the whole plan's invariant section is about.
 *
 * So both methods throwing is not a gap. **Reaching this class at runtime means
 * a request got past a gate**, and a loud, named error is how that is found in
 * a log rather than by a user staring at a job that never starts.
 */
export function createNoopResearchProvider(): ResearchProvider {
  return {
    start() {
      return Promise.reject(new ResearchNotConfiguredError())
    },
    poll() {
      return Promise.reject(new ResearchNotConfiguredError())
    },
    searchSection() {
      return Promise.reject(new ResearchNotConfiguredError())
    },
  }
}
