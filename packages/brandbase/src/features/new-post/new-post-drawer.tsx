'use client'

import Image from 'next/image'
import * as React from 'react'

import { Segmented } from '@/components/controls'
import { CarouselIcon, ReelIcon, UploadIcon } from '@/components/icons'
import { fromFile, isVideo, Media, type Dropped } from '@/components/media'
import { Sheet } from '@/components/sheet'
import type { Format } from '@/data/demo'
import { useBrand } from '@/features/schedule/posts-store'

type Mode = 'idea' | 'scratch'

const FORMATS: Array<{ value: Format; label: string }> = [
  { value: 'reel', label: 'Reel' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'story', label: 'Story' },
]

const DROP_LABEL: Record<Format, string> = {
  reel: 'Drop a video',
  carousel: 'Drop photos or videos, up to 10',
  story: 'Drop one or more story frames',
}

/** A reel is one video; a carousel and a story take photos and videos. */
const ACCEPT: Record<Format, string> = {
  reel: 'video/*',
  carousel: 'image/*,video/*',
  story: 'image/*,video/*',
}

const CAROUSEL_MAX = 10

/** Start a post from one of the team's ideas, or from media. Either way it ends in Publish. */
export function NewPostDrawer({
  onClose,
  onPublishPost,
  onPublishMedia,
}: {
  onClose: () => void
  onPublishPost: (postId: string) => void
  onPublishMedia: (format: Format, images: string[], hook: string, duration?: string) => void
}) {
  const { brand, ideas, library, byId } = useBrand()
  const [mode, setMode] = React.useState<Mode>('idea')
  const [format, setFormat] = React.useState<Format>('reel')
  const [hook, setHook] = React.useState('')
  // Files the user dropped, newest first. They sit in front of the brand's library.
  const [uploads, setUploads] = React.useState<Dropped[]>([])
  const media = [...uploads.map((u) => u.src), ...library]
  const [picks, setPicks] = React.useState<string[]>(() => library.slice(0, 1))
  const [over, setOver] = React.useState(false)
  const [refusal, setRefusal] = React.useState<string | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const multi = format !== 'reel'

  function pick(src: string) {
    setPicks((p) =>
      multi
        ? p.includes(src)
          ? p.filter((x) => x !== src)
          : [...p, src]
        : p.includes(src)
          ? []
          : [src],
    )
  }

  /** Takes dropped or chosen files that fit the format and selects them. */
  async function add(files: FileList | null) {
    const all = [...(files ?? [])]
    const fit = all.filter((f) =>
      format === 'reel' ? f.type.startsWith('video/') : /^(image|video)\//.test(f.type),
    )
    if (fit.length === 0) {
      if (all.length)
        setRefusal(format === 'reel' ? 'A reel takes a video' : 'Photos or videos only')
      return
    }
    setRefusal(null)
    const added = await Promise.all((multi ? fit : fit.slice(0, 1)).map(fromFile))
    const srcs = added.map((a) => a.src)
    setUploads((u) => [...added, ...u])
    setPicks((p) => (multi ? [...srcs, ...p].slice(0, CAROUSEL_MAX) : srcs.slice(0, 1)))
  }

  return (
    <Sheet label="New post" onClose={onClose} width={520}>
      <div className="bb-rise flex flex-col gap-1.5" style={{ animationDelay: '60ms' }}>
        <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink-4">
          {brand.name.toUpperCase()}
        </span>
        <h2 className="font-serif text-4xl leading-none">New post</h2>
      </div>

      <div className="bb-rise mt-7" style={{ animationDelay: '120ms' }}>
        <Segmented
          label="Start from"
          options={[
            { value: 'idea', label: 'From an idea' },
            { value: 'scratch', label: 'From scratch' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {mode === 'idea' ? (
        <div key="idea" className="mt-6 grid grid-cols-3 gap-x-2.5 gap-y-4">
          {ideas.map((idea, i) => {
            const post = idea.postId ? byId(idea.postId) : undefined
            const image = post?.images[0]
            return (
              <button
                key={idea.hook}
                type="button"
                aria-label={`${image ? 'Publish' : 'Start'}: ${idea.hook}`}
                onClick={() => {
                  if (post) onPublishPost(post.id)
                  else {
                    setFormat(idea.format)
                    setHook(idea.hook)
                    setPicks([])
                    setMode('scratch')
                  }
                }}
                className="bb-rise group flex min-w-0 flex-col gap-2 text-left"
                style={{ animationDelay: `${160 + i * 50}ms` }}
              >
                <span
                  className={`relative block aspect-[4/5] w-full overflow-hidden rounded-[6px] transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lift ${image ? 'bg-tile' : 'bg-paper'}`}
                >
                  {image ? (
                    <Image src={image} alt="" fill sizes="150px" className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex flex-col justify-between px-2.5 pt-[9px] pb-[11px]">
                      <span className="font-mono text-[9.5px] tracking-[0.06em] text-ink-4">
                        IDEA
                      </span>
                      <span className="font-serif text-[17px] leading-[1.1] italic">
                        “{idea.hook}”
                      </span>
                    </span>
                  )}
                  <span
                    className={`absolute top-[7px] right-[7px] ${image ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]' : 'text-ink-4'}`}
                  >
                    {idea.format === 'reel' ? <ReelIcon size={15} /> : <CarouselIcon size={15} />}
                  </span>
                </span>
                {image && (
                  <span className="font-serif text-[15px] leading-[1.15] italic">
                    “{idea.hook}”
                  </span>
                )}
                <span className="text-[11.5px] text-ink-3">{idea.meta}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div key="scratch" className="bb-rise mt-6 flex flex-col gap-6">
          <Segmented
            label="What are you posting"
            options={FORMATS}
            value={format}
            onChange={(f) => {
              setFormat(f)
              setRefusal(null)
              setPicks(media.slice(0, f === 'reel' ? 1 : 2))
            }}
          />
          <div className="flex flex-col gap-2.5">
            <label htmlFor="new-post-hook" className="text-[13px] text-ink-4">
              Hook
            </label>
            <input
              id="new-post-hook"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="The line that stops the scroll"
              className="h-11 rounded-xl bg-surface-2 px-4 text-[15px] outline-none placeholder:text-ink-5"
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] text-ink-4">Media</span>
            <input
              ref={input}
              type="file"
              accept={ACCEPT[format]}
              multiple={multi}
              hidden
              onChange={(e) => {
                void add(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                if (!over) setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                void add(e.dataTransfer.files)
              }}
              className={`flex h-28 flex-col items-center justify-center gap-2 rounded-xl text-[13.5px] transition-[background-color,box-shadow,color] duration-200 ${
                over
                  ? 'bg-surface text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]'
                  : 'bg-surface-2 text-ink-2 hover:bg-surface'
              }`}
            >
              <span
                className={`transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${over ? '-translate-y-1' : ''}`}
              >
                <UploadIcon />
              </span>
              <span key={refusal ?? 'label'} className={refusal ? 'bb-pop text-ink' : ''}>
                {over ? 'Drop to add' : (refusal ?? DROP_LABEL[format])}
              </span>
            </button>
            <div className="grid grid-cols-5 gap-1.5">
              {media.map((src) => {
                const at = picks.indexOf(src)
                const on = at >= 0
                const upload = uploads.find((u) => u.src === src)
                return (
                  <button
                    key={src}
                    type="button"
                    aria-label={isVideo(src) ? 'Use this video' : 'Use this photo'}
                    aria-pressed={on}
                    onClick={() => pick(src)}
                    className={`bb-press relative overflow-hidden rounded-[6px] bg-tile ${upload ? 'bb-pop' : ''}`}
                    style={{
                      aspectRatio: format === 'story' ? '9 / 16' : '4 / 5',
                      boxShadow: on ? '0 0 0 2px var(--page), 0 0 0 4px var(--ink)' : 'none',
                    }}
                  >
                    <Media src={src} sizes="90px" />
                    {upload?.duration && (
                      <span className="absolute bottom-[5px] left-[5px] rounded-full bg-black/55 px-[5px] py-px font-mono text-[9.5px] text-white">
                        {upload.duration}
                      </span>
                    )}
                    {on && multi && (
                      <span className="bb-pop absolute top-[5px] right-[5px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-[5px] text-[11px] font-semibold text-page">
                        {at + 1}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <button
            type="button"
            aria-disabled={picks.length === 0}
            onClick={() => {
              if (picks.length === 0) return
              onPublishMedia(
                format,
                picks,
                hook.trim() || `New ${format}`,
                uploads.find((u) => u.src === picks[0])?.duration,
              )
            }}
            className={`mt-2 h-[52px] rounded-[14px] text-[15px] font-medium transition-[background-color,box-shadow] duration-200 ${
              picks.length === 0
                ? 'cursor-not-allowed bg-paper text-ink-4'
                : 'bg-ink text-page hover:shadow-lift'
            }`}
          >
            {picks.length === 0 ? 'Pick the media' : 'Next'}
          </button>
        </div>
      )}
    </Sheet>
  )
}
