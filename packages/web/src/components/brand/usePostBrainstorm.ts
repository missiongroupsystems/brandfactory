import type {
  BrandWithSections,
  IdeateThemesResult,
  PostIdea,
  SocialPlatform,
} from '@brandfactory/shared'
import { brandContentPillars } from '@brandfactory/shared'
import { useIdeateCopy, useIdeateThemes } from '@/api/queries/social-ideas'
import type { KeyDate } from '@/lib/key-dates'
import { brainstormRequest } from '@/lib/social-plan'

// ---------------------------------------------------------------------------
// usePostBrainstorm — Door 3's two calls, and nothing else
// ---------------------------------------------------------------------------
//
// `usePostPlanner`'s shape, one scale smaller. It holds the two mutations and
// the brand facts a request is built from; the *run's* state — which angles came
// back, which one is in the `Copy` field — lives in `PostEditorForm`, because
// the question this asks is made of two fields on that form.
//
// **Its own pair of mutations, not the planner's.** They are `useMutation`s with
// no key and no cache (`api/queries/social-ideas.ts`), so a second pair costs
// nothing and keeps two independent `isPending` flags: a planner run in the panel
// must not grey out the button in the dialog, and neither must wait for the
// other.
//
// **It writes nothing.** The route persists nothing, and the answer lands in a
// form field the user still has to submit. The one row this feature ever creates
// goes through `useCreateSocialPost`, like every other post on this surface.

export interface PostBrainstorm {
  /** Pass 1 — one day, one platform, three angles. `null` = it failed loudly. */
  onBrainstorm: (request: {
    dayKey: string
    platform: SocialPlatform
  }) => Promise<IdeateThemesResult | null>
  /** Pass 2 — one angle's caption. `null` = it failed loudly. */
  onWriteCopy: (idea: PostIdea, platform: SocialPlatform) => Promise<string | null>
}

export interface UsePostBrainstormOptions {
  brandId: string
  /** Its `Content pillars` section is what stops the run inventing new ones. */
  brand: BrandWithSections | undefined
  /** The enabled sets' dates, as the grid already holds them. */
  keyDates: KeyDate[]
  /** The page's toast, so every failure on this surface reads the same way. */
  onError: (err: unknown, fallback: string) => void
}

export function usePostBrainstorm({
  brandId,
  brand,
  keyDates,
  onError,
}: UsePostBrainstormOptions): PostBrainstorm {
  const themes = useIdeateThemes(brandId)
  const copy = useIdeateCopy(brandId)

  return {
    async onBrainstorm({ dayKey, platform }) {
      if (!brand) return null
      try {
        return await themes.mutateAsync(
          brainstormRequest({
            dayKey,
            platform,
            keyDates,
            // Read, never written. The planner's save action is the only
            // guidelines write in this feature, and it is a button in the panel.
            pillars: brandContentPillars(brand.sections),
          }),
        )
      } catch (err) {
        onError(err, 'Could not brainstorm this day')
        return null
      }
    },

    async onWriteCopy(idea, platform) {
      try {
        const result = await copy.mutateAsync({ items: [{ idea, platform }] })
        const body = result.outcome === 'ok' ? (result.copies[0]?.body ?? '') : ''
        // **A blank caption is a failure here, unlike in the planner.** There
        // the empty body is *slot claimed, copy pending* on a row the user
        // agreed to; here there is no row and no slot — emptying the `Copy`
        // field would be the whole visible result of pressing the button.
        if (!body.trim()) {
          onError(null, 'The model wrote nothing for that angle')
          return null
        }
        return body
      } catch (err) {
        onError(err, 'Could not write the copy for that angle')
        return null
      }
    },
  }
}
