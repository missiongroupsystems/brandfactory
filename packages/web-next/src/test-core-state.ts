import { contentFor, type BrandId } from '@/data/brands'
import { feedsOf } from '@/data/demo'
import { mediaItem } from '@/lib/remote-days'

/**
 * A demo brand's posts as the core's `brand.state` sends them, for the tests that run on the core.
 * On the core the stores start with no demo posts, so such a test hands its posts in this way.
 */
export function demoAsCore(brandId: BrandId) {
  const { posts, weeks } = contentFor(brandId)
  const days = weeks.flatMap((w) => w.days)
  const dayOf = (id: string) =>
    days.find(
      (d) =>
        feedsOf(d).some((m) => m.kind === 'post' && m.postId === id) ||
        (d.story.kind === 'post' && d.story.postId === id),
    )?.date ?? null
  return {
    brand: { id: brandId },
    posts: posts.map((p) => ({
      id: p.id,
      format: p.format,
      hook: p.hook,
      day: dayOf(p.id),
      time: p.slot.split(', ')[1] ?? null,
      channels: p.channels ?? [],
      media: p.images.map((src, i) => mediaItem(src, i === 0 ? p.duration : undefined)),
      fromIdea: p.fromIdea ?? null,
      stage: p.stage,
      jobs:
        p.stage === 'failed'
          ? [{ channel: p.failedOn ?? 'ig', status: 'failed', error: p.error ?? null }]
          : [],
      caption: '',
      draft: {},
    })),
    ideas: [],
    // The rest of the state, empty, for the stores that read it.
    shoots: [],
    crew: [],
    inbox: { people: [], messages: [] },
    kit: {
      voice: { summary: '', words: [], examples: [] },
      colours: [],
      logo: { src: null, name: null },
    },
    files: [],
    versions: [],
    shareLinks: [],
    comments: [],
    connections: [],
    pasted: [],
    moodboard: null,
  }
}
