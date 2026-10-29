'use client'

import type { BrandFile, FileKind } from '@/data/brand-kit'
import type { BrandId } from '@/data/brands'
import { FileIcon } from '@/features/brand/brand-page'
import { useBrandFiles, useBrandKit } from '@/features/brand/brand-store'
import { useVoiceVersions } from '@/features/brand/voice/versions'
import { useBrand } from '@/features/schedule/posts-store'

import type { Card as Model } from './model'
import { Card, META, Thumb, TITLE } from './shell'

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** The voice as the kit now holds it, with its version number. */
export function VoiceCard({ model, index }: { model: Model; index: number }) {
  const brandId = model.brand as BrandId
  const { voice } = useBrandKit(brandId)
  const versions = useVoiceVersions(brandId)
  const n = model.tool === 'kit.voice_restore' ? Number(model.input.n) : versions[0]?.n
  const summary =
    voice.summary || str((model.input.voice as { summary?: string } | undefined)?.summary)
  return (
    <Card verb={model.verb} href="/brand" index={index} label={`Voice${n ? ` v${n}` : ''}`}>
      <span className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span className={TITLE}>Voice</span>
          {n ? <span className={META}>v{n}</span> : null}
        </span>
        <span className="line-clamp-3 text-[13px] leading-[1.45] text-ink-3">{summary}</span>
      </span>
    </Card>
  )
}

/** The brand's colours, landing one swatch after another. */
export function ColoursCard({ model, index }: { model: Model; index: number }) {
  const { colours } = useBrandKit(model.brand as BrandId)
  const asked = Array.isArray(model.input.colours)
    ? (model.input.colours as { name: string; hex: string }[])
    : []
  const list = colours.length > 0 ? colours : asked
  return (
    <Card
      verb={model.verb}
      href="/brand"
      index={index}
      label={`Colours: ${list.map((c) => c.name).join(', ')}`}
    >
      <span className="flex items-center gap-2">
        {list.slice(0, 6).map((c, i) => (
          <span
            key={`${c.hex}-${i}`}
            title={`${c.name} ${c.hex}`}
            className="bb-pop size-8 rounded-full shadow-[inset_0_0_0_1px_var(--line)]"
            style={{ background: c.hex, animationDelay: `${i * 70}ms` }}
          />
        ))}
      </span>
      <span className={`${META} truncate`}>{list.map((c) => c.name).join(' · ')}</span>
    </Card>
  )
}

/** The logo as the kit now shows it everywhere. */
export function LogoCard({ model, index }: { model: Model; index: number }) {
  const { logo } = useBrandKit(model.brand as BrandId)
  const src = logo.src || str(model.input.src)
  const brandName = useBrand().brands.find((b) => b.id === model.brand)?.name ?? ''
  return (
    <Card verb={model.verb} href="/brand" index={index} label="Logo">
      <span className="flex items-center gap-3">
        <Thumb src={src || undefined} className="size-[52px] rounded-[12px]" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={TITLE}>Logo</span>
          <span className={`${META} truncate`}>{logo.name ?? brandName}</span>
        </span>
      </span>
    </Card>
  )
}

const KIND_OF: Record<string, FileKind> = {
  pdf: 'pdf',
  key: 'deck',
  ppt: 'deck',
  pptx: 'deck',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  svg: 'image',
}

const isFile = (v: unknown): v is BrandFile => typeof v === 'object' && v !== null && 'kind' in v

/** A file of the kit as the Brand page lists it: its kind, its title and its name. */
export function FileCard({ model, index }: { model: Model; index: number }) {
  const files = useBrandFiles(model.brand as BrandId)
  const kept = isFile(model.snapshot) ? model.snapshot : undefined
  const file = files.find((f) => f.id === model.id) ?? kept
  const name = file?.name ?? str(model.input.name)
  const title = file?.title ?? (str(model.input.title) || name)
  const kind = file?.kind ?? KIND_OF[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'doc'
  return (
    <Card
      verb={model.verb}
      href="/brand"
      removed={model.removed}
      index={index}
      label={`File: ${title}`}
    >
      <span className="flex items-center gap-3">
        <FileIcon file={{ kind }} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={`${TITLE} truncate`}>{title || 'A file'}</span>
          {name && name !== title && <span className={`${META} truncate`}>{name}</span>}
        </span>
      </span>
    </Card>
  )
}
