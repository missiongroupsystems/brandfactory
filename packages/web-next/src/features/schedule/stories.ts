import type { BrandId } from '@/data/brands'
import type { Post, Stage } from '@/data/demo'

import type { DayItems } from './calendar-items'

/**
 * A day's stories one by one. The demo keeps only a count for stories already out, so each one
 * gets a time across the day, a title from the brand's usual stories and a frame from its photos,
 * the same every time for the same day. A story planned on the brief or in the composer is its
 * own post.
 */
export interface Story {
  id: string
  time: string
  title: string
  image?: string
  stage: Stage
  /** The post behind a planned story: its row opens it. */
  postId?: string
}

const TIMES = ['09:00', '11:30', '13:00', '15:30', '17:30', '19:00', '20:30', '22:00']

const TITLES: Record<BrandId, string[]> = {
  'casa-vostra': [
    'Doors open, Raffles City',
    'Dough for the day',
    'Lunch, from the pass',
    'The oven, up close',
    'Tonight’s pasta',
    'Table for two',
    'Last orders',
    'Kitchen, lights off',
  ],
  temper: [
    'The cellar, 4pm',
    'Today’s pour',
    'Ask the sommelier',
    'First glasses out',
    'Records on',
    'The counter, full',
    'Last seating',
    'Lights down at Duxton',
  ],
  carlitos: [
    'Joo Chiat morning',
    'Croquetas, rolled',
    'Lunch rush',
    'Jamón, sliced',
    'Vermut hour',
    'Plates landing',
    'The counter at night',
    'Closing up',
  ],
}

export function storiesOf(
  dayN: string,
  items: DayItems,
  brandId: BrandId,
  library: string[],
  byId: (id: string) => Post | undefined,
): Story[] {
  const titles = TITLES[brandId]
  const seed = Number(dayN)
  const posted: Story[] = Array.from({ length: items.storiesPosted }, (_, i) => ({
    id: `${dayN}-story-${i}`,
    time: TIMES[i % TIMES.length]!,
    title: titles[(seed + i) % titles.length]!,
    image: (i === 0 ? items.storyImage : undefined) ?? library[(seed + i) % library.length],
    stage: 'posted',
  }))
  const planned = items.plannedStory ? byId(items.plannedStory.id) : undefined
  const all = planned
    ? [
        ...posted,
        {
          id: planned.id,
          time: planned.slot.split(', ')[1] ?? '18:00',
          title: planned.hook,
          image: planned.images[0],
          stage: planned.stage,
          postId: planned.id,
        },
      ]
    : posted
  return all.sort((a, b) => a.time.localeCompare(b.time))
}
