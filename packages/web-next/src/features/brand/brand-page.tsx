'use client'

import Image from 'next/image'
import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { SparkIcon } from '@/components/icons'
import { BRAND_KIT, type BrandFile, type FileKind } from '@/data/brand-kit'
import { useBrand } from '@/features/schedule/posts-store'

import { editFiles, newFileId, useBrandFiles } from './brand-store'
import { removed, renamed, replaced, uploaded } from './model'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'

const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  deck: 'Deck',
  doc: 'Doc',
  sheet: 'Sheet',
  image: 'Image',
}

/**
 * The brand page: the one place for how the current brand looks and sounds. Nobody opens it
 * daily; a new hire reads it once, and AI drafts read it every time. Voice first, since that is
 * what AI uses most, then colours, the logo, and the team's files, each with a plain title.
 */
export function BrandPage() {
  const { brand } = useBrand()
  const kit = BRAND_KIT[brand.id]

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main
        key={brand.id}
        className="bb-swap mx-auto flex w-full max-w-[760px] flex-col px-4 pb-24"
      >
        <div className="flex flex-col gap-4 pt-6 pb-10 max-md:pt-2 max-md:pb-8">
          <span className={EYEBROW}>Brand kit</span>
          <h1 className="font-display text-[56px] leading-none tracking-[-0.035em] max-md:text-[34px]">
            {brand.name}
          </h1>
          <p className="max-w-[560px] text-[15px] text-ink-3">{brand.line}</p>
          <span className="flex items-center gap-2 text-[12.5px] text-ink-4">
            <SparkIcon size={10} />
            Used when AI drafts captions, hooks and replies.
          </span>
        </div>

        <Section label="Voice">
          <p className="font-display text-[24px] leading-[1.3] tracking-[-0.02em] max-md:text-[20px]">
            {kit.voice.summary}
          </p>
          <div className="grid grid-cols-2 gap-x-6">
            <span className={`${EYEBROW} pb-2`}>Say</span>
            <span className={`${EYEBROW} pb-2`}>Not</span>
            {kit.voice.words.map((w) => (
              <React.Fragment key={w.use}>
                <span className="border-t border-line py-2.5 text-[14.5px]">{w.use}</span>
                <span className="border-t border-line py-2.5 text-[14.5px] text-ink-4 line-through decoration-ink-5">
                  {w.avoid}
                </span>
              </React.Fragment>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <span className={EYEBROW}>Sounds like</span>
            {kit.voice.examples.map((line) => (
              <p key={line} className="border-l-2 border-line-strong pl-4 text-[15px] text-ink-2">
                {line}
              </p>
            ))}
          </div>
        </Section>

        <Section label="Colours">
          <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
            {kit.colours.map((c) => (
              <Swatch key={c.hex} name={c.name} hex={c.hex} />
            ))}
          </div>
        </Section>

        <Section label="Logo">
          <div className="flex items-center gap-5">
            <span className="flex size-[120px] shrink-0 items-center justify-center rounded-[18px] bg-surface">
              <span className="relative size-[88px] overflow-hidden rounded-full">
                <Image src={brand.logo} alt={`${brand.name} logo`} fill sizes="176px" />
              </span>
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[14.5px] font-medium">Mark</span>
              <span className="text-[12.5px] text-ink-4">PNG · 192 × 192</span>
              <a
                href={brand.logo}
                download={`${brand.id}-logo.png`}
                className="mt-1 text-[12.5px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              >
                Download
              </a>
            </span>
          </div>
        </Section>

        <Files />
      </main>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-6 border-t border-line py-9">
      <h2 className={EYEBROW}>{label}</h2>
      {children}
    </section>
  )
}

/** A colour to copy: a tap puts its hex on the clipboard, for Canva or a supplier. */
function Swatch({ name, hex }: { name: string; hex: string }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <button
      type="button"
      aria-label={`Copy ${name}, ${hex}`}
      onClick={() => {
        void navigator.clipboard?.writeText(hex)
        setCopied(true)
      }}
      className="group flex flex-col gap-2.5 text-left"
    >
      <span
        className="block h-[88px] w-full rounded-[14px] shadow-[inset_0_0_0_1px_var(--line)] transition-transform duration-200 group-hover:-translate-y-0.5"
        style={{ background: hex }}
      />
      <span className="flex flex-col">
        <span className="text-[13.5px] font-medium">{name}</span>
        <span className="font-mono text-[11.5px] text-ink-4">{copied ? 'Copied' : hex}</span>
      </span>
    </button>
  )
}

/**
 * The team's documents about the brand, each with a plain title AI reads to know what it is. An
 * upload opens its title for editing at once; a new version keeps the title. Client state only.
 */
function Files() {
  const { brand } = useBrand()
  const files = useBrandFiles(brand.id)
  const [editing, setEditing] = React.useState<string | null>(null)
  const upload = React.useRef<HTMLInputElement>(null)
  const replace = React.useRef<HTMLInputElement>(null)
  const replacing = React.useRef<string | null>(null)

  function onUpload(list: FileList | null) {
    const file = list?.[0]
    if (!file) return
    const id = newFileId(brand.id)
    editFiles(brand.id, (f) => uploaded(f, file.name, id))
    setEditing(id)
  }

  function onReplace(list: FileList | null) {
    const file = list?.[0]
    const id = replacing.current
    if (!file || !id) return
    editFiles(brand.id, (f) => replaced(f, id, file.name))
  }

  return (
    <section aria-label="Files" className="flex flex-col gap-4 border-t border-line py-9">
      <div className="flex items-center justify-between">
        <h2 className={EYEBROW}>Files</h2>
        <button
          type="button"
          onClick={() => upload.current?.click()}
          className="bb-press flex h-8 items-center rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-page hover:opacity-85"
        >
          Upload
        </button>
        <input
          ref={upload}
          type="file"
          hidden
          aria-label="Upload a file"
          onChange={(e) => {
            onUpload(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={replace}
          type="file"
          hidden
          aria-label="Upload a new version"
          onChange={(e) => {
            onReplace(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {files.length === 0 ? (
        <p className="py-6 text-[13.5px] text-ink-4">
          No files yet. Upload the brand book, a deck or the tone of voice.
        </p>
      ) : (
        <ul className="flex flex-col">
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              editing={editing === f.id}
              onEdit={() => setEditing(f.id)}
              onRename={(title) => {
                editFiles(brand.id, (list) => renamed(list, f.id, title))
                setEditing(null)
              }}
              onCancel={() => setEditing(null)}
              onReplace={() => {
                replacing.current = f.id
                replace.current?.click()
              }}
              onDelete={() => editFiles(brand.id, (list) => removed(list, f.id))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function FileRow({
  file,
  editing,
  onEdit,
  onRename,
  onCancel,
  onReplace,
  onDelete,
}: {
  file: BrandFile
  editing: boolean
  onEdit: () => void
  onRename: (title: string) => void
  onCancel: () => void
  onReplace: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-center gap-3.5 border-t border-line py-3 first:border-t-0">
      <span className="flex h-10 w-9 shrink-0 items-end justify-center rounded-[7px] bg-surface pb-1.5 font-mono text-[8.5px] tracking-[0.04em] text-ink-3 uppercase">
        {KIND_LABEL[file.kind]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {editing ? (
          <TitleInput title={file.title} onDone={onRename} onCancel={onCancel} />
        ) : (
          <span className="truncate text-[14.5px] font-medium">{file.title}</span>
        )}
        <span className="truncate text-[12px] text-ink-4">
          {editing
            ? 'A plain title tells AI what this file is.'
            : `${file.updated === 'Today' ? 'Updated today' : `Updated ${file.updated}`} · ${file.name}`}
        </span>
      </span>
      {!editing && (
        <RowMenu title={file.title} onRename={onEdit} onReplace={onReplace} onDelete={onDelete} />
      )}
    </li>
  )
}

function TitleInput({
  title,
  onDone,
  onCancel,
}: {
  title: string
  onDone: (title: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = React.useState(title)
  const input = React.useRef<HTMLInputElement>(null)
  // The title opens on a tap (Rename, or an upload), so the cursor goes straight into it.
  React.useEffect(() => input.current?.focus(), [])
  return (
    <input
      ref={input}
      value={value}
      aria-label="File title"
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value)
        else if (e.key === 'Escape') onCancel()
      }}
      className="-my-1 -ml-2 rounded-[8px] bg-surface px-2 py-1 text-[14.5px] font-medium outline-none"
    />
  )
}

/** Rename, a new version, or delete: kept behind one button, since nobody does them daily. */
function RowMenu({
  title,
  onRename,
  onReplace,
  onDelete,
}: {
  title: string
  onRename: () => void
  onReplace: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = (label: string, act: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false)
        act()
      }}
      className={`rounded-[8px] px-2.5 py-[7px] text-left text-[13.5px] transition-colors hover:bg-surface-2 ${danger ? 'text-fail-ink' : 'text-ink'}`}
    >
      {label}
    </button>
  )

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${title}`}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-9 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : ''}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor">
          <circle cx="2.5" cy="7" r="1.3" />
          <circle cx="7" cy="7" r="1.3" />
          <circle cx="11.5" cy="7" r="1.3" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`${title} actions`}
          className="bb-menu absolute top-10 right-0 z-30 flex w-[180px] origin-top-right flex-col rounded-[12px] bg-page p-1.5 shadow-pop"
        >
          {item('Rename', onRename)}
          {item('Upload new version', onReplace)}
          {item('Delete', onDelete, true)}
        </div>
      )}
    </div>
  )
}
