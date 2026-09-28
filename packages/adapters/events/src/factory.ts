import { createMissionEventsSource } from './mission-events'
import { createNoopEventsSource } from './noop'
import type { EventsSource } from './port'

/**
 * The shipped impls. The same rule the other five adapters follow: the enum
 * lists **only what ships**, so widening it and widening the switch happen in
 * one commit, and a misconfigured env fails at boot rather than at first use.
 */
export const EVENTS_PROVIDER_IDS = ['none', 'mission-events'] as const
export type EventsProviderId = (typeof EVENTS_PROVIDER_IDS)[number]

export interface EventsSourceConfig {
  providerId: EventsProviderId
  missionEvents?: { baseUrl: string; token: string }
}

export function createEventsSource(config: EventsSourceConfig): EventsSource {
  switch (config.providerId) {
    case 'mission-events':
      if (!config.missionEvents?.baseUrl || !config.missionEvents.token) {
        // Unreachable through `buildAdapters` — `EnvSchema`'s `superRefine`
        // requires both when the provider is selected, as it does for every
        // other adapter. Stated so the type is not the only thing holding it,
        // and so a direct caller in a test cannot half-configure it.
        throw new Error(
          "MISSION_EVENTS_URL and MISSION_EVENTS_CALENDAR_TOKEN are required when EVENTS_PROVIDER='mission-events'",
        )
      }
      return createMissionEventsSource(config.missionEvents)
    case 'none':
      return createNoopEventsSource()
  }
}
