import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * Every BrandBase table lives in the `brandbase` schema. The Supabase database also holds the
 * archived BrandFactory tables in `public`; a schema of our own shares the database with them and
 * never collides with a name there.
 */
export const bb = pgSchema('brandbase')

const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
/** Bumped on every write; a client may send `ifVersion` to refuse a lost update. */
const version = () => integer('version').notNull().default(1)

export const brands = bb.table('brands', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  handle: text('handle').notNull(),
  line: text('line').notNull().default(''),
  /** The brand switcher's order. */
  position: integer('position').notNull().default(0),
  /** One zone per brand (decision 8): every "today", past day and week is read in it. */
  timezone: text('timezone').notNull().default('Asia/Singapore'),
  /** The platforms the brand posts on (`LINKED` in the demo). */
  linked: text('linked')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** The TikTok answers that start every new post, or null for the model's defaults. */
  tiktokDefaults: jsonb('tiktok_defaults'),
  createdAt: created(),
})

/** `id` is the identity provider's `sub`. Nothing creates a row on sign-in. */
export const users = bb.table('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  /** An admin reaches every brand and holds no `members` rows. */
  role: text('role', { enum: ['admin', 'member'] })
    .notNull()
    .default('member'),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  createdAt: created(),
})

export const members = bb.table(
  'members',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.brandId] })],
)

export const posts = bb.table(
  'posts',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    format: text('format', { enum: ['reel', 'carousel', 'story'] }).notNull(),
    hook: text('hook').notNull(),
    /** The brand-local day and time; null until the post has a day. */
    day: date('day'),
    time: text('time'),
    caption: text('caption').notNull().default(''),
    channels: text('channels')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** `{ src, kind, mediaId?, duration? }[]`, in order. */
    media: jsonb('media')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The whole composer draft (caption overrides, TikTok answers, tags, crops, extras). */
    draft: jsonb('draft')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** What the idea said before it became this post, so unplanning gives it back. */
    fromIdea: jsonb('from_idea'),
    /** A stage set by hand on the idea page (decision 3), apart from what publishing did. */
    marked: text('marked', { enum: ['scheduled', 'posted'] }),
    version: version(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('posts_brand_day').on(t.brandId, t.day)],
)

/** One row per account a post goes to (decision 5). The post's stage is derived from these. */
export const postJobs = bb.table(
  'post_jobs',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    status: text('status', { enum: ['scheduled', 'uploading', 'live', 'failed'] }).notNull(),
    runAt: timestamp('run_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    externalId: text('external_id'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('post_jobs_post_channel').on(t.postId, t.channel),
    index('post_jobs_due').on(t.status, t.runAt),
  ],
)

/** A send's first answer, kept by its idempotency key so a repeat returns it. */
export const postSends = bb.table('post_sends', {
  key: text('key').primaryKey(),
  postId: text('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  result: jsonb('result').notNull(),
  createdAt: created(),
})

export const ideas = bb.table(
  'ideas',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    format: text('format', { enum: ['reel', 'carousel', 'story'] }).notNull(),
    pillar: text('pillar').notNull().default(''),
    hook: text('hook').notNull(),
    angle: text('angle').notNull().default(''),
    feature: text('feature').notNull().default(''),
    image: text('image'),
    source: jsonb('source')
      .notNull()
      .default(sql`'{"own":true}'::jsonb`),
    status: text('status', { enum: ['suggested', 'idea'] })
      .notNull()
      .default('idea'),
    /**
     * The calendar day the idea's tile sits on, while it has no post. This replaces the demo's
     * match by hook text: a tile is found by the idea's id.
     */
    day: date('day'),
    /** Why the tile sits on its day ("Built on …"). */
    why: text('why'),
    postId: text('post_id')
      .unique()
      .references(() => posts.id, { onDelete: 'set null' }),
    inspiration: jsonb('inspiration')
      .notNull()
      .default(sql`'[]'::jsonb`),
    shots: jsonb('shots')
      .notNull()
      .default(sql`'[]'::jsonb`),
    cut: text('cut'),
    sharper: jsonb('sharper')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The idea and insight a suggestion was built on (`BuiltOn` in `data/ideas.ts`). */
    builtOn: jsonb('built_on'),
    version: version(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('ideas_brand').on(t.brandId)],
)

export const shoots = bb.table(
  'shoots',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    day: date('day').notNull(),
    start: text('start').notNull(),
    end: text('end').notNull(),
    place: text('place').notNull().default(''),
    /** Only an empty `planned` shoot is dropped when its last idea leaves. */
    origin: text('origin', { enum: ['planned', 'manual', 'lark'] }).notNull(),
    /** In shooting order. An idea is in one shoot at most; the server keeps that true. */
    ideaIds: text('idea_ids')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    version: version(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('shoots_brand_day').on(t.brandId, t.day)],
)

/** Crew are rows with ids, not names: two people may share a name. */
export const crew = bb.table(
  'crew',
  {
    id: text('id').primaryKey(),
    shootId: text('shoot_id')
      .notNull()
      .references(() => shoots.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role').notNull(),
    position: integer('position').notNull(),
    /** Set when the Lark invite went to this person; only people without it are invited next. */
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    reply: text('reply', { enum: ['going', 'cant'] }),
  },
  (t) => [index('crew_shoot').on(t.shootId)],
)

export const shareLinks = bb.table(
  'share_links',
  {
    /** 32 random bytes, base64url. The guest page reads by this and nothing else. */
    token: text('token').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['idea', 'shoot'] }).notNull(),
    targetId: text('target_id').notNull(),
    who: text('who', { enum: ['link', 'team'] })
      .notNull()
      .default('link'),
    can: text('can', { enum: ['view', 'comment', 'edit'] })
      .notNull()
      .default('comment'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('share_links_target').on(t.kind, t.targetId)],
)

export const comments = bb.table(
  'comments',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['idea', 'shoot'] }).notNull(),
    targetId: text('target_id').notNull(),
    /** A reply points at the comment it answers; the team signs as the brand. */
    parentId: text('parent_id'),
    name: text('name').notNull(),
    fromTeam: boolean('from_team').notNull().default(false),
    text: text('text').notNull(),
    done: boolean('done').notNull().default(false),
    createdAt: created(),
  },
  (t) => [index('comments_target').on(t.kind, t.targetId)],
)

export const inboxPeople = bb.table('inbox_people', {
  id: text('id').primaryKey(),
  brandId: text('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role').notNull(),
  position: integer('position').notNull(),
})

export const inboxMessages = bb.table(
  'inbox_messages',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: ['ig', 'tt', 'fb'] }).notNull(),
    kind: text('kind', { enum: ['comment', 'mention', 'dm'] }).notNull(),
    fromName: text('from_name').notNull(),
    fromHandle: text('from_handle').notNull(),
    text: text('text').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    tone: text('tone', { enum: ['complaint', 'question', 'praise', 'noise'] }).notNull(),
    post: jsonb('post'),
    /** `{ from, text, at, by? }[]`; `at` is an ISO timestamp. */
    earlier: jsonb('earlier')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The three reply directions, `{ direction, text }[]`. */
    replies: jsonb('replies')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The person a complaint is about, by `inbox_people.id`. */
    sendTo: text('send_to'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    sentTo: text('sent_to')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    replyText: text('reply_text'),
    replyStatus: text('reply_status', { enum: ['queued', 'sent', 'failed'] }),
    repliedBy: text('replied_by'),
  },
  (t) => [index('inbox_brand').on(t.brandId)],
)

export const brandKits = bb.table('brand_kits', {
  brandId: text('brand_id')
    .primaryKey()
    .references(() => brands.id, { onDelete: 'cascade' }),
  voice: jsonb('voice').notNull(),
  colours: jsonb('colours').notNull(),
  logo: jsonb('logo').notNull(),
  version: version(),
  updatedAt: updated(),
})

export const brandFiles = bb.table('brand_files', {
  id: text('id').primaryKey(),
  brandId: text('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  kind: text('kind', { enum: ['pdf', 'deck', 'doc', 'sheet', 'image'] }).notNull(),
  name: text('name').notNull(),
  mediaId: text('media_id'),
  updatedAt: updated(),
})

export const voiceVersions = bb.table(
  'voice_versions',
  {
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    n: integer('n').notNull(),
    by: text('by').notNull(),
    note: text('note').notNull().default(''),
    voice: jsonb('voice').notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.n] })],
)

/**
 * The UI's connection keys (ig, tt, fb, drive, lark, web, gbp, res, pinterest), and the
 * moodboard's two other sources: posts DM'd to the moodboard account (`moodboard-dm`) and the
 * brand's TikTok saves (`moodboard-tt`).
 */
export const connections = bb.table(
  'connections',
  {
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    status: text('status', { enum: ['connected', 'off', 'attention'] }).notNull(),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.key] })],
)

/**
 * A link the team pasted onto its moodboard, as the moodboard shows it (`Reference` in the app's
 * `data/ideas.ts`). An idea keeps it by id in its inspiration.
 */
export const pastedLinks = bb.table('pasted_links', {
  id: text('id').primaryKey(),
  brandId: text('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  reference: jsonb('reference').notNull(),
  createdAt: created(),
})

export const media = bb.table('media', {
  id: text('id').primaryKey(),
  brandId: text('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull().unique(),
  kind: text('kind', { enum: ['photo', 'video', 'file'] }).notNull(),
  mime: text('mime').notNull(),
  name: text('name').notNull().default(''),
  bytes: integer('bytes'),
  width: integer('width'),
  height: integer('height'),
  durationS: integer('duration_s'),
  createdAt: created(),
})
