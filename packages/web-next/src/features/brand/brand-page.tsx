'use client'

import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { PAGE as COLUMN, PageTitle, SECTION } from '@/components/page-title'
import type { BrandFile, FileKind } from '@/data/brand-kit'
import { useBrand } from '@/features/schedule/posts-store'
import { remote, report, upload as uploadFile } from '@/lib/remote'
import { mediaItem } from '@/lib/remote-days'

import { BrandLogo } from './brand-logo'
import {
  attachFile,
  editFiles,
  editKit,
  newFileId,
  useBrandFiles,
  useBrandKit,
} from './brand-store'
import { ColoursEditable } from './kit-colours'
import { QUIET, Section } from './kit-parts'
import { removed, renamed, replaced, uploaded } from './model'
import { VoiceSection } from './voice/voice-section'

const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  deck: 'Deck',
  doc: 'Doc',
  sheet: 'Sheet',
  image: 'Image',
}

const PAGE = 'M7 3.5h6.5L18 8v12.5H7z M13.5 3.5V8H18'

/** One thin glyph per kind, drawn like the rest of the app's icons: no colour, no badge. */
const KIND_PATH: Record<FileKind, string> = {
  pdf: PAGE,
  doc: `${PAGE} M9.5 12h6 M9.5 15h6 M9.5 18h3.5`,
  deck: 'M3.5 5h17v11h-17z M12 16v3.5 M8.5 19.5h7',
  sheet: 'M4.5 5h15v14h-15z M4.5 10h15 M4.5 14.5h15 M10 5v14',
  image: 'M4 5h16v14H4z M4 16l4.5-4.5 4 4 2.5-2.5L20 18 M15.5 9.5h.01',
}

/** The file's kind in a quiet tile, the size of the Connections page's source marks. */
export function FileIcon({ file }: { file: Pick<BrandFile, 'kind'> }) {
  return (
    <span
      role="img"
      aria-label={KIND_LABEL[file.kind]}
      className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-ink-3"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={KIND_PATH[file.kind]}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/**
 * The brand page: the one place for how the current brand looks and sounds. Nobody opens it
 * daily; a new hire reads it once, and AI drafts read it every time. Voice first, since that is
 * what AI uses most, then colours, the logo, and the team's files, each with a plain title.
 *
 * At rest it reads as a page, not a form. Each section has one quiet control at its top right;
 * the voice's Edit opens a flow of its own (`voice/voice-section.tsx`).
 */
export function BrandPage() {
  const { brand } = useBrand()

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main key={brand.id} className={`bb-swap flex flex-col pb-24 ${COLUMN}`}>
        <PageTitle title="Brand kit" back />
        {/* The page reads in one column, from the same left edge as every title. */}
        <div className="flex w-full max-w-[760px] flex-col">
          <p className="max-w-[560px] pb-8 text-[16px] text-ink-3 max-md:pb-6">{brand.line}</p>
          <VoiceSection />
          <ColoursEditable />
          <LogoSection />
          <Files />
        </div>
      </main>
    </div>
  )
}

/** The logo: Replace takes a new file at once, since there is nothing to type. */
function LogoSection() {
  const { brand } = useBrand()
  const logo = useBrandKit(brand.id).logo
  const input = React.useRef<HTMLInputElement>(null)

  return (
    <Section
      label="Logo"
      action={
        <span className="flex items-center">
          {logo.src && (
            <a href={logo.src} download={logo.name ?? `${brand.id}-logo.png`} className={QUIET}>
              Download
            </a>
          )}
          <button type="button" onClick={() => input.current?.click()} className={`${QUIET} -mr-3`}>
            {logo.src ? 'Replace' : 'Upload'}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            aria-label="Upload a new logo"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file && remote) {
                // Kept on the server; the kit takes the stored file's address once it is up.
                void uploadFile(brand.id, file).then(
                  (src) => editKit(brand.id, (k) => ({ ...k, logo: { src, name: file.name } })),
                  () => report('The logo did not upload.'),
                )
              } else if (file) {
                const src = URL.createObjectURL(file)
                editKit(brand.id, (k) => {
                  // The old upload has no other reader once it is replaced.
                  if (k.logo.src?.startsWith('blob:')) URL.revokeObjectURL(k.logo.src)
                  return { ...k, logo: { src, name: file.name } }
                })
              }
              e.target.value = ''
            }}
          />
        </span>
      }
    >
      <div className="flex items-center gap-5">
        <span className="flex size-[120px] shrink-0 items-center justify-center rounded-[18px] bg-surface">
          {/* A new logo settles in, so the replace reads as done; the brand's own does not. */}
          <span
            key={logo.src}
            className={`relative size-[88px] overflow-hidden rounded-full ${logo.name ? 'bb-pop' : ''}`}
            // No logo yet: the initials sit on the brand's colour, as in the switcher.
            style={logo.src ? undefined : { background: `var(${brand.colour})` }}
          >
            <BrandLogo
              brandId={brand.id}
              alt={`${brand.name} logo`}
              sizes="176px"
              className="object-cover"
            />
          </span>
        </span>
        {logo.name && <span className="truncate text-[13px] text-ink-4">Today · {logo.name}</span>}
      </div>
    </Section>
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
    if (remote) keepFile(id, file)
  }

  function onReplace(list: FileList | null) {
    const file = list?.[0]
    const id = replacing.current
    if (!file || !id) return
    editFiles(brand.id, (f) => replaced(f, id, file.name))
    if (remote) keepFile(id, file)
  }

  /** The file itself goes to storage, and its row then points at it. */
  function keepFile(id: string, file: File) {
    void uploadFile(brand.id, file).then(
      (src) => {
        const mediaId = mediaItem(src).mediaId
        if (mediaId) attachFile(brand.id, id, file.name, mediaId)
      },
      () => report(`${file.name} did not upload.`),
    )
  }

  return (
    <section aria-label="Files" className="flex flex-col gap-4 border-t border-line py-9">
      <div className="flex items-center justify-between">
        <h2 className={SECTION}>Files</h2>
        <button type="button" onClick={() => upload.current?.click()} className={`${QUIET} -mr-3`}>
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
        <p className="py-6 text-[13px] text-ink-4">No files yet.</p>
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
      <FileIcon file={file} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {editing ? (
          <TitleInput title={file.title} onDone={onRename} onCancel={onCancel} />
        ) : (
          <span className="truncate text-[14px] font-medium">{file.title}</span>
        )}
        <span className="truncate text-[12px] text-ink-4">
          {file.updated} · {file.name}
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
      className="-my-1 -ml-2 rounded-[8px] bg-surface px-2 py-1 text-[14px] font-medium outline-none"
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
      className={`rounded-[8px] px-2.5 py-[7px] text-left text-[13px] transition-colors hover:bg-surface-2 ${danger ? 'text-fail-ink' : 'text-ink'}`}
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
